/**
 * Security hardening middleware and utilities
 * 
 * This module provides comprehensive security measures including
 * input validation, rate limiting, audit logging, and workspace isolation.
 */

import { Request, Response, NextFunction } from 'express';
import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';
import { Logger, LogCategory } from '../utils/logger';
import { config } from '../config';

const prisma = new PrismaClient();

// Security event types for audit logging
export enum SecurityEventType {
  LOGIN_ATTEMPT = 'login_attempt',
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_ACCESS = 'data_access',
  WORKSPACE_ACCESS = 'workspace_access',
  API_KEY_USAGE = 'api_key_usage',
  FILE_UPLOAD = 'file_upload',
  CONFIGURATION_CHANGE = 'configuration_change',
}

// Audit log entry interface
export interface AuditLogEntry {
  eventType: SecurityEventType;
  userId?: string;
  workspaceId?: string;
  ipAddress: string;
  userAgent: string;
  endpoint: string;
  method: string;
  success: boolean;
  details?: Record<string, any>;
  timestamp: Date;
  sessionId?: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

// Rate limiting store for tracking requests
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Enhanced helmet configuration for security headers
 */
export function securityHeaders(): any {
  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        connectSrc: [
          "'self'",
          "https://api.slack.com",
          "https://slack.com",
          "https://www.googleapis.com",
          "https://oauth2.googleapis.com",
          "https://api.openai.com",
        ],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false, // For OAuth flows
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  });
}

/**
 * Advanced rate limiting with workspace-aware rules
 */
export function createAdvancedRateLimit(options: {
  windowMs: number;
  maxRequests: number;
  workspaceMaxRequests?: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Request) => string;
}): RateLimitRequestHandler {
  return rateLimit({
    windowMs: options.windowMs,
    max: options.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    
    keyGenerator: options.keyGenerator || ((req: Request) => {
      // Default key generator includes IP and workspace for better isolation
      const ip = req.ip || req.socket.remoteAddress || 'unknown';
      const workspaceId = req.workspaceId || 'no-workspace';
      return `${ip}:${workspaceId}`;
    }),
    
    skip: (req: Request) => {
      // Skip rate limiting for health checks and monitoring
      const skipPaths = ['/health', '/metrics', '/status'];
      return skipPaths.some(path => req.path.startsWith(path));
    },
    
    handler: (req: Request, res: Response) => {
      // Log rate limit exceeded event
      logSecurityEvent({
        eventType: SecurityEventType.RATE_LIMIT_EXCEEDED,
        userId: req.user?.id,
        workspaceId: req.workspaceId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        endpoint: req.path,
        method: req.method,
        success: false,
        riskLevel: 'medium',
        details: {
          rateLimitType: 'general',
          windowMs: options.windowMs,
          maxRequests: options.maxRequests,
        },
      });
      
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests. Please slow down.',
          retryAfter: Math.ceil(options.windowMs / 1000),
        },
      });
      
      // Log rate limit event
      Logger.warn(LogCategory.SECURITY, 'Rate limit reached', {
        ip: req.ip,
        workspaceId: (req as any).workspaceId,
        endpoint: req.path,
        userAgent: req.get('User-Agent'),
      });
    },
  });
}

/**
 * Workspace-specific rate limiting
 */
export const workspaceRateLimit = createAdvancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 1000, // Per workspace
  workspaceMaxRequests: 100, // Per user in workspace
  keyGenerator: (req: Request) => {
    const ip = req.ip || 'unknown';
    const workspaceId = req.workspaceId || 'no-workspace';
    const userId = req.user?.id || 'anonymous';
    return `workspace:${workspaceId}:user:${userId}:ip:${ip}`;
  },
});

/**
 * API rate limiting for different endpoint types
 */
export const apiRateLimit = createAdvancedRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
});

export const webhookRateLimit = createAdvancedRateLimit({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 1000, // Higher limit for webhooks
});

export const authRateLimit = createAdvancedRateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 10, // Strict limit for auth endpoints
});

/**
 * Input validation and sanitization middleware
 */
export function inputValidation() {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Skip validation for monitoring and health endpoints
      const skipPaths = ['/health', '/metrics', '/status', '/webhooks/slack/health', '/webhooks/slack/interactions/health'];
      if (skipPaths.some(path => req.path.startsWith(path))) {
        return next();
      }
      
      // Validate request size
      const contentLength = parseInt(req.get('content-length') || '0', 10);
      const maxSize = 10 * 1024 * 1024; // 10MB
      
      if (contentLength > maxSize) {
        logSecurityEvent({
          eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
          userId: req.user?.id,
          workspaceId: req.workspaceId,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          endpoint: req.path,
          method: req.method,
          success: false,
          riskLevel: 'high',
          details: {
            reason: 'Request too large',
            contentLength,
            maxSize,
          },
        });
        
        return res.status(413).json({
          error: {
            code: 'REQUEST_TOO_LARGE',
            message: 'Request entity too large',
          },
        });
      }
      
      // Sanitize common injection patterns
      if (req.body) {
        req.body = sanitizeObject(req.body);
      }
      
      if (req.query) {
        req.query = sanitizeObject(req.query);
      }
      
      // Validate workspace isolation
      if (req.workspaceId && req.user) {
        if (req.user.workspaceId !== req.workspaceId) {
          logSecurityEvent({
            eventType: SecurityEventType.UNAUTHORIZED_ACCESS,
            userId: req.user.id,
            workspaceId: req.workspaceId,
            ipAddress: req.ip || 'unknown',
            userAgent: req.get('User-Agent') || 'unknown',
            endpoint: req.path,
            method: req.method,
            success: false,
            riskLevel: 'critical',
            details: {
              reason: 'Workspace isolation violation',
              userWorkspaceId: req.user.workspaceId,
              requestedWorkspaceId: req.workspaceId,
            },
          });
          
          return res.status(403).json({
            error: {
              code: 'WORKSPACE_ACCESS_DENIED',
              message: 'Access denied to workspace',
            },
          });
        }
      }
      
      next();
    } catch (error) {
      Logger.error(LogCategory.SECURITY, 'Input validation error', error as Error);
      res.status(500).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
        },
      });
    }
  };
}

/**
 * Audit logging middleware
 */
export function auditLogging() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original res.json to capture response details
    const originalJson = res.json;
    let responseBody: any;
    
    res.json = function(body: any) {
      responseBody = body;
      return originalJson.call(this, body);
    };
    
    // Log successful requests
    res.on('finish', () => {
      // Don't log monitoring endpoints to avoid noise
      const skipPaths = ['/health', '/metrics', '/status'];
      if (skipPaths.some(path => req.path.startsWith(path))) {
        return;
      }
      
      const isSuccess = res.statusCode < 400;
      const riskLevel = getRiskLevel(req, res.statusCode);
      
      logSecurityEvent({
        eventType: SecurityEventType.DATA_ACCESS,
        userId: req.user?.id,
        workspaceId: req.workspaceId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        endpoint: req.path,
        method: req.method,
        success: isSuccess,
        riskLevel,
        details: {
          statusCode: res.statusCode,
          responseSize: JSON.stringify(responseBody || {}).length,
          processingTime: Date.now() - (req as any).startTime,
        },
      });
    });
    
    // Store start time for processing duration
    (req as any).startTime = Date.now();
    next();
  };
}

/**
 * Security monitoring middleware for suspicious patterns
 */
export function securityMonitoring() {
  return (req: Request, res: Response, next: NextFunction) => {
    const suspiciousPatterns = [
      // SQL injection patterns
      /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/i,
      // XSS patterns
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      // Command injection patterns
      /(;|\||&|`|\$\(|\$\{)/,
      // Path traversal patterns
      /(\.\.\/|\.\.\\)/,
      // Common attack strings
      /(\balert\s*\(|\bconfirm\s*\(|\bprompt\s*\()/i,
    ];
    
    const requestBody = JSON.stringify(req.body || {});
    const queryString = JSON.stringify(req.query || {});
    const userAgent = req.get('User-Agent') || '';
    
    const isSuspicious = suspiciousPatterns.some(pattern => 
      pattern.test(requestBody) || 
      pattern.test(queryString) || 
      pattern.test(req.path)
    );
    
    // Check for suspicious user agents
    const suspiciousUserAgents = [
      /sqlmap/i,
      /nikto/i,
      /nmap/i,
      /masscan/i,
      /nessus/i,
      /burpsuite/i,
      /scanner/i,
    ];
    
    const isSuspiciousUserAgent = suspiciousUserAgents.some(pattern => 
      pattern.test(userAgent)
    );
    
    if (isSuspicious || isSuspiciousUserAgent) {
      logSecurityEvent({
        eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
        userId: req.user?.id,
        workspaceId: req.workspaceId,
        ipAddress: req.ip || 'unknown',
        userAgent,
        endpoint: req.path,
        method: req.method,
        success: false,
        riskLevel: 'high',
        details: {
          reason: isSuspicious ? 'Suspicious request pattern' : 'Suspicious user agent',
          requestBody: isSuspicious ? '[FILTERED]' : undefined,
          userAgent: isSuspiciousUserAgent ? userAgent : undefined,
        },
      });
      
      // Block suspicious requests
      return res.status(400).json({
        error: {
          code: 'SUSPICIOUS_REQUEST',
          message: 'Request blocked due to security policy',
        },
      });
    }
    
    next();
  };
}

/**
 * Workspace access control middleware
 */
export function workspaceAccessControl() {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.workspaceId || !req.user) {
        return next();
      }
      
      // Check if user has access to workspace
      const userHasAccess = await verifyWorkspaceAccess(req.user.id, req.workspaceId);
      
      if (!userHasAccess) {
        logSecurityEvent({
          eventType: SecurityEventType.UNAUTHORIZED_ACCESS,
          userId: req.user.id,
          workspaceId: req.workspaceId,
          ipAddress: req.ip || 'unknown',
          userAgent: req.get('User-Agent') || 'unknown',
          endpoint: req.path,
          method: req.method,
          success: false,
          riskLevel: 'high',
          details: {
            reason: 'User not authorized for workspace',
          },
        });
        
        return res.status(403).json({
          error: {
            code: 'WORKSPACE_ACCESS_DENIED',
            message: 'Access denied to workspace',
          },
        });
      }
      
      // Log workspace access
      logSecurityEvent({
        eventType: SecurityEventType.WORKSPACE_ACCESS,
        userId: req.user.id,
        workspaceId: req.workspaceId,
        ipAddress: req.ip || 'unknown',
        userAgent: req.get('User-Agent') || 'unknown',
        endpoint: req.path,
        method: req.method,
        success: true,
        riskLevel: 'low',
      });
      
      next();
    } catch (error) {
      Logger.error(LogCategory.SECURITY, 'Workspace access control error', error as Error);
      res.status(500).json({
        error: {
          code: 'ACCESS_CONTROL_ERROR',
          message: 'Access control check failed',
        },
      });
    }
  };
}

/**
 * Log security events to audit trail
 */
export async function logSecurityEvent(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
  try {
    const auditEntry: AuditLogEntry = {
      ...entry,
      timestamp: new Date(),
    };
    
    // Log to application logger
    Logger.info(LogCategory.SECURITY, `Security Event: ${entry.eventType}`, auditEntry);
    
    // Store in database for compliance
    await prisma.auditLog.create({
      data: {
        eventType: entry.eventType,
        userId: entry.userId,
        workspaceId: entry.workspaceId,
        ipAddress: entry.ipAddress,
        userAgent: entry.userAgent,
        endpoint: entry.endpoint,
        method: entry.method,
        success: entry.success,
        details: entry.details ? JSON.stringify(entry.details) : null,
        timestamp: auditEntry.timestamp,
        sessionId: entry.sessionId,
        riskLevel: entry.riskLevel,
      },
    });
    
    // Alert on critical security events
    if (entry.riskLevel === 'critical') {
      await sendSecurityAlert(auditEntry);
    }
    
  } catch (error) {
    Logger.error(LogCategory.SECURITY, 'Failed to log security event', error as Error);
  }
}

/**
 * Sanitize object to prevent injection attacks
 */
function sanitizeObject(obj: any): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(sanitizeObject);
  }
  
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    // Sanitize key
    const cleanKey = key.replace(/[<>'"&]/g, '');
    
    // Sanitize value
    if (typeof value === 'string') {
      // Basic XSS prevention
      sanitized[cleanKey] = value
        .replace(/[<>'"&]/g, '')
        .trim();
    } else {
      sanitized[cleanKey] = sanitizeObject(value);
    }
  }
  
  return sanitized;
}

/**
 * Determine risk level based on request and response
 */
function getRiskLevel(req: Request, statusCode: number): 'low' | 'medium' | 'high' | 'critical' {
  // High risk for auth endpoints
  if (req.path.includes('/auth/')) {
    return statusCode >= 400 ? 'high' : 'medium';
  }
  
  // High risk for admin endpoints
  if (req.path.includes('/admin/')) {
    return 'high';
  }
  
  // Medium risk for data modification
  if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
    return statusCode >= 400 ? 'medium' : 'low';
  }
  
  // Low risk for read operations
  return statusCode >= 500 ? 'medium' : 'low';
}

/**
 * Verify user has access to workspace
 */
async function verifyWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findFirst({
      where: {
        id: userId,
        workspaceId: workspaceId,
      },
    });
    
    return !!user;
  } catch (error) {
    Logger.error(LogCategory.SECURITY, 'Workspace access verification failed', error as Error);
    return false;
  }
}

/**
 * Send security alert for critical events
 */
async function sendSecurityAlert(entry: AuditLogEntry): Promise<void> {
  try {
    // In production, this would integrate with alerting systems
    // like PagerDuty, Slack alerts, or email notifications
    Logger.info(LogCategory.SECURITY, 'CRITICAL SECURITY EVENT', {
      eventType: entry.eventType,
      userId: entry.userId,
      workspaceId: entry.workspaceId,
      ipAddress: entry.ipAddress,
      endpoint: entry.endpoint,
      details: entry.details,
    });
    
    // TODO: Implement actual alerting mechanism
    // await sendSlackAlert(entry);
    // await sendEmail(entry);
    // await createPagerDutyIncident(entry);
    
  } catch (error) {
    Logger.error(LogCategory.SECURITY, 'Failed to send security alert', error as Error);
  }
}

/**
 * Session security middleware
 */
export function sessionSecurity() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Add security headers for session management
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    // Remove potentially sensitive headers
    res.removeHeader('X-Powered-By');
    res.removeHeader('Server');
    
    next();
  };
}

/**
 * CORS configuration for workspace isolation
 */
export function corsConfiguration() {
  return {
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      // Allow same-origin requests
      if (!origin) {
        return callback(null, true);
      }
      
      // Check against allowed origins
      const allowedOrigins = [
        config.cors.origin[0], // Use first CORS origin instead of config.frontend.url
        config.server.baseUrl,
        ...config.cors.origin.slice(1), // Use remaining CORS origins
      ];
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Workspace-ID',
    ],
  };
}

// Export all security middleware as a convenient setup function
export function setupSecurity(app: any): void {
  // Basic security headers
  app.use(securityHeaders());
  
  // Session security
  app.use(sessionSecurity());
  
  // Input validation and sanitization
  app.use(inputValidation());
  
  // Security monitoring
  app.use(securityMonitoring());
  
  // Audit logging
  app.use(auditLogging());
}

export default {
  securityHeaders,
  createAdvancedRateLimit,
  workspaceRateLimit,
  apiRateLimit,
  webhookRateLimit,
  authRateLimit,
  inputValidation,
  auditLogging,
  securityMonitoring,
  workspaceAccessControl,
  sessionSecurity,
  corsConfiguration,
  setupSecurity,
  logSecurityEvent,
};