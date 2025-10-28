/**
 * Request logging middleware
 * 
 * This module provides custom request logging with correlation IDs
 * and structured logging for better observability.
 */

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

// Extend Request type to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
    }
  }
}

/**
 * Request logger middleware that adds correlation ID and timing
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Generate correlation ID for request tracking
  const correlationId = uuidv4();
  req.correlationId = correlationId;
  req.startTime = Date.now();

  // Add correlation ID to response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Log request start
  console.log(`[${correlationId}] ${req.method} ${req.path} - Request started`, {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    correlationId,
  });

  // Capture response end event
  const originalSend = res.send;
  res.send = function(body: any) {
    const duration = req.startTime ? Date.now() - req.startTime : 0;
    
    console.log(`[${correlationId}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      correlationId,
    });

    return originalSend.call(this, body);
  };

  next();
}