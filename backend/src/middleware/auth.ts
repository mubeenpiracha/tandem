/**
 * Authentication middleware
 * 
 * This module provides JWT-based authentication middleware
 * for protecting API routes.
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { findUserById } from '../models/user';

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