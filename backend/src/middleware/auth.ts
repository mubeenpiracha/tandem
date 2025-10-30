/**
 * Authentication middleware with workspace routing support
 * 
 * This module provides JWT-based authentication middleware
 * for protecting API routes with workspace-aware routing.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { findUserById } from '../models/user';
import { findWorkspaceById } from '../models/workspace';

interface JWTPayload {
  userId: string;
  workspaceId: string;
  email: string;
  slackUserId: string;
  iat: number;
  exp: number;
}

/**
 * Extract JWT token from request headers
 */
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return null;
  }

  // Support both "Bearer token" and "token" formats
  const parts = authHeader.split(' ');
  if (parts.length === 2 && parts[0] === 'Bearer') {
    return parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }

  return null;
}

/**
 * Verify JWT token and extract payload
 */
async function verifyToken(token: string): Promise<JWTPayload> {
  try {
    const payload = jwt.verify(token, config.auth.jwtSecret) as JWTPayload;
    
    // Validate payload structure
    if (!payload.userId || !payload.email || !payload.slackUserId) {
      throw new AuthenticationError('Invalid token payload');
    }

    return payload;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token');
    } else if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token expired');
    } else if (error instanceof jwt.NotBeforeError) {
      throw new AuthenticationError('Token not active');
    }
    
    throw error;
  }
}

/**
 * Main authentication middleware
 */
export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract token from request
    const token = extractToken(req);
    if (!token) {
      throw new AuthenticationError('Authentication token required');
    }

    // Verify token
    const payload = await verifyToken(token);

    // Check if user still exists and is active
    const user = await findUserById(payload.userId);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if (user.status !== 'ACTIVE') {
      throw new AuthorizationError('User account is inactive');
    }

    // Attach user info to request
    req.user = {
      id: user.id,
      workspaceId: user.workspaceId,
      email: user.email,
      slackUserId: user.slackUserId,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication middleware (doesn't require auth)
 */
export async function optionalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) {
      return next();
    }

    try {
      const payload = await verifyToken(token);
      const user = await findUserById(payload.userId);
      
      if (user && user.status === 'ACTIVE') {
        req.user = {
          id: user.id,
          workspaceId: user.workspaceId,
          email: user.email,
          slackUserId: user.slackUserId,
        };
      }
    } catch (error) {
      // Ignore auth errors in optional middleware
      console.log('Optional auth failed:', error);
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Generate JWT token for user
 */
export function generateUserToken(user: {
  id: string;
  workspaceId: string;
  email: string;
  slackUserId: string;
}): string {
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = {
    userId: user.id,
    workspaceId: user.workspaceId,
    email: user.email,
    slackUserId: user.slackUserId,
  };

  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
    issuer: 'tandem-slack-bot',
    audience: 'tandem-api',
  } as jwt.SignOptions);
}

/**
 * Require Slack authentication middleware
 */
export async function requireSlackAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // First ensure user is authenticated
    await authMiddleware(req, res, () => {});
    
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Check if user has valid Slack token
    const { validateSlackToken } = await import('../services/oauth/token_manager');
    const validation = await validateSlackToken(req.user.id);
    
    if (!validation.isValid) {
      res.status(401).json({ 
        error: 'Slack authentication required',
        message: 'Please connect your Slack account',
        provider: 'slack',
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Require Google authentication middleware
 */
export async function requireGoogleAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // First ensure user is authenticated
    await authMiddleware(req, res, () => {});
    
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Check if user has valid Google token
    const { validateGoogleToken } = await import('../services/oauth/token_manager');
    const validation = await validateGoogleToken(req.user.id);
    
    if (!validation.isValid) {
      res.status(401).json({ 
        error: 'Google authentication required',
        message: 'Please connect your Google Calendar account',
        provider: 'google',
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Require both Slack and Google authentication middleware
 */
export async function requireFullAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // First ensure user is authenticated
    await authMiddleware(req, res, () => {});
    
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Check both providers
    const { getUserAuthStatus } = await import('../services/oauth/token_manager');
    const authStatus = await getUserAuthStatus(req.user.id);
    
    const missingProviders = [];
    if (!authStatus.slack.isValid) {
      missingProviders.push('slack');
    }
    if (!authStatus.google.isValid) {
      missingProviders.push('google');
    }
    
    if (missingProviders.length > 0) {
      res.status(401).json({ 
        error: 'Complete authentication required',
        message: `Please connect your ${missingProviders.join(' and ')} account(s)`,
        missingProviders,
        authStatus,
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Refresh token middleware (for future use)
 */
export function refreshTokenMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // TODO: Implement refresh token logic if needed
  // For now, just use regular auth middleware
  authMiddleware(req, res, next);
}

/**
 * Workspace validation middleware
 * Ensures the authenticated user belongs to the specified workspace
 */
export async function requireWorkspaceAccess(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // First ensure user is authenticated
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    // Get workspace ID from URL params or query
    const workspaceId = req.params.workspaceId || req.query.workspace;
    
    if (!workspaceId) {
      throw new AuthorizationError('Workspace ID required');
    }

    // Verify workspace exists and user has access
    const workspace = await findWorkspaceById(workspaceId as string);
    if (!workspace || !workspace.isActive) {
      throw new AuthorizationError('Workspace not found or inactive');
    }

    // Verify user belongs to this workspace
    if (req.user.workspaceId !== workspace.id) {
      throw new AuthorizationError('Access denied to this workspace');
    }

    // Attach workspace info to request
    req.workspace = {
      id: workspace.id,
      name: workspace.slackTeamName,
      slackTeamId: workspace.slackTeamId,
      slackTeamName: workspace.slackTeamName,
      isActive: workspace.isActive,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Workspace admin middleware
 * Ensures the user has admin privileges for workspace operations
 */
export async function requireWorkspaceAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // First ensure workspace access
    await requireWorkspaceAccess(req, res, () => {});

    if (!req.user || !req.workspace) {
      throw new AuthenticationError('Authentication and workspace access required');
    }

    // TODO: Implement workspace admin role checking
    // For now, check if user was one of the first users (simplified admin check)
    const { getUsersByWorkspace } = await import('../models/user');
    const workspaceUsers = await getUsersByWorkspace(req.workspace.id);
    
    // Simple admin check: user must be one of the first 3 users in the workspace
    const userIndex = workspaceUsers.findIndex(user => user.id === req.user!.id);
    const isAdmin = userIndex >= 0 && userIndex < 3;

    if (!isAdmin) {
      throw new AuthorizationError('Workspace admin privileges required');
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Multi-workspace authentication middleware
 * Supports operations across multiple workspaces (for system admin)
 */
export async function requireSystemAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // First ensure user is authenticated
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    // TODO: Implement system admin role checking
    // For now, this is a placeholder for future system-wide admin operations
    // In production, this should check against a system admin role or permission
    
    // For MVP, we'll just require authentication
    // Later this can be enhanced with proper role-based access control
    
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Workspace-scoped resource access middleware
 * Ensures a resource (task, message, etc.) belongs to the user's workspace
 */
export async function requireResourceWorkspaceAccess(resourceType: 'task' | 'message' | 'calendar') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        throw new AuthenticationError('Authentication required');
      }

      const resourceId = req.params.id || req.params.resourceId;
      if (!resourceId) {
        throw new AuthorizationError('Resource ID required');
      }

      // Validate resource belongs to user's workspace
      let resourceWorkspaceId: string | null = null;

      switch (resourceType) {
        case 'task': {
          const { findTaskById } = await import('../models/task');
          const task = await findTaskById(resourceId);
          if (task) {
            const taskUser = await findUserById(task.userId);
            resourceWorkspaceId = taskUser?.workspaceId || null;
          }
          break;
        }
        case 'message': {
          const { findSlackMessageById } = await import('../models/slackMessage');
          const message = await findSlackMessageById(resourceId);
          resourceWorkspaceId = message?.workspaceId || null;
          break;
        }
        case 'calendar': {
          const { findCalendarEventById } = await import('../models/calendarEvent');
          const event = await findCalendarEventById(resourceId);
          if (event) {
            // Calendar event is related to user through task
            const { findTaskById } = await import('../models/task');
            const task = await findTaskById(event.taskId);
            if (task) {
              const taskUser = await findUserById(task.userId);
              resourceWorkspaceId = taskUser?.workspaceId || null;
            }
          }
          break;
        }
      }

      if (!resourceWorkspaceId) {
        throw new AuthorizationError(`${resourceType} not found`);
      }

      if (resourceWorkspaceId !== req.user.workspaceId) {
        throw new AuthorizationError(`Access denied to ${resourceType} from different workspace`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Combined authentication and workspace routing middleware
 * One-stop middleware for workspace-scoped API endpoints
 */
export async function requireWorkspaceAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Step 1: Authenticate user
    await authMiddleware(req, res, () => {});
    
    if (!req.user) {
      throw new AuthenticationError('Authentication required');
    }

    // Step 2: Validate workspace access if workspace ID is provided
    const workspaceId = req.params.workspaceId || req.query.workspace;
    if (workspaceId) {
      await requireWorkspaceAccess(req, res, () => {});
    } else {
      // If no specific workspace ID, use user's default workspace
      const workspace = await findWorkspaceById(req.user.workspaceId);
      if (workspace) {
        req.workspace = {
          id: workspace.id,
          name: workspace.slackTeamName,
          slackTeamId: workspace.slackTeamId,
          slackTeamName: workspace.slackTeamName,
          isActive: workspace.isActive,
        };
      }
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Rate limiting middleware with workspace scoping
 */
export async function workspaceRateLimit(
  maxRequests: number = 100,
  windowMs: number = 15 * 60 * 1000 // 15 minutes
) {
  const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !req.user.workspaceId) {
        throw new AuthenticationError('Workspace authentication required for rate limiting');
      }

      const key = `workspace:${req.user.workspaceId}`;
      const now = Date.now();
      const resetTime = now + windowMs;

      const current = rateLimitStore.get(key);
      
      if (!current || now > current.resetTime) {
        // Reset or initialize counter
        rateLimitStore.set(key, { count: 1, resetTime });
        next();
        return;
      }

      if (current.count >= maxRequests) {
        res.status(429).json({
          error: 'Rate limit exceeded',
          message: `Too many requests from workspace. Try again in ${Math.ceil((current.resetTime - now) / 1000)} seconds.`,
          retryAfter: Math.ceil((current.resetTime - now) / 1000),
        });
        return;
      }

      // Increment counter
      current.count++;
      rateLimitStore.set(key, current);
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': Math.max(0, maxRequests - current.count).toString(),
        'X-RateLimit-Reset': Math.ceil(current.resetTime / 1000).toString(),
      });

      next();
    } catch (error) {
      next(error);
    }
  };
}