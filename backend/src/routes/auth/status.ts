/**
 * Authentication status endpoints
 * 
 * This module provides endpoints for checking authentication status
 * and managing connected services.
 */

import { Request, Response } from 'express';
import { getUserAuthStatus } from '../../services/oauth/token_manager';
import { authMiddleware } from '../../middleware/auth';

/**
 * Get comprehensive authentication status
 */
export async function getAuthStatus(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const authStatus = await getUserAuthStatus(req.user.id);
    
    // Calculate setup completion
    const setupComplete = authStatus.slack.isValid && authStatus.google.isValid;
    
    // Determine next steps
    const nextSteps = [];
    if (!authStatus.slack.isValid) {
      nextSteps.push({
        provider: 'slack',
        action: 'connect',
        url: '/api/auth/slack',
        description: 'Connect your Slack account to detect tasks',
      });
    }
    if (!authStatus.google.isValid) {
      nextSteps.push({
        provider: 'google',
        action: 'connect',
        url: '/api/auth/google',
        description: 'Connect Google Calendar to schedule tasks',
      });
    }

    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        slackUserId: req.user.slackUserId,
      },
      setupComplete,
      services: {
        slack: {
          connected: authStatus.slack.connected,
          valid: authStatus.slack.isValid,
          lastUpdated: authStatus.slack.lastUpdated,
          status: authStatus.slack.isValid ? 'active' : 
                  authStatus.slack.connected ? 'invalid' : 'disconnected',
        },
        google: {
          connected: authStatus.google.connected,
          valid: authStatus.google.isValid,
          expired: authStatus.google.isExpired,
          expiresIn: authStatus.google.expiresIn,
          lastUpdated: authStatus.google.lastUpdated,
          status: authStatus.google.isValid ? 'active' : 
                  authStatus.google.isExpired ? 'expired' :
                  authStatus.google.connected ? 'invalid' : 'disconnected',
        },
      },
      nextSteps,
    });

  } catch (error) {
    console.error('Failed to get auth status:', error);
    res.status(500).json({
      error: 'Failed to get authentication status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get Slack connection status
 */
export async function getSlackStatus(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { validateSlackToken } = await import('../../services/oauth/token_manager');
    const { findSlackTokenByUser } = await import('../../models/slackToken');
    
    const validation = await validateSlackToken(req.user.id);
    const token = await findSlackTokenByUser(req.user.id);

    res.json({
      connected: !!token,
      valid: validation.isValid,
      lastUpdated: token?.updatedAt || null,
      connectUrl: '/api/auth/slack',
      revokeUrl: '/api/auth/slack/revoke',
    });

  } catch (error) {
    console.error('Failed to get Slack status:', error);
    res.status(500).json({
      error: 'Failed to get Slack status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get Google connection status
 */
export async function getGoogleStatus(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { validateGoogleToken } = await import('../../services/oauth/token_manager');
    const { findGoogleTokenByUser } = await import('../../models/googleToken');
    
    const validation = await validateGoogleToken(req.user.id);
    const token = await findGoogleTokenByUser(req.user.id);

    res.json({
      connected: !!token,
      valid: validation.isValid,
      expired: validation.isExpired,
      expiresIn: validation.expiresIn,
      lastUpdated: token?.updatedAt || null,
      connectUrl: '/api/auth/google',
      revokeUrl: '/api/auth/google/revoke',
    });

  } catch (error) {
    console.error('Failed to get Google status:', error);
    res.status(500).json({
      error: 'Failed to get Google status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Refresh tokens for a user
 */
export async function refreshTokens(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { provider } = req.params;
    
    if (!provider || !['slack', 'google'].includes(provider)) {
      res.status(400).json({ 
        error: 'Invalid provider',
        message: 'Provider must be "slack" or "google"',
      });
      return;
    }

    let result;
    if (provider === 'slack') {
      const { refreshSlackToken } = await import('../../services/oauth/token_manager');
      result = await refreshSlackToken(req.user.id);
    } else {
      const { refreshGoogleToken } = await import('../../services/oauth/token_manager');
      result = await refreshGoogleToken(req.user.id);
    }

    if (result.success) {
      res.json({
        success: true,
        message: `${provider} token refreshed successfully`,
        expiresAt: result.expiresAt,
      });
    } else {
      res.status(400).json({
        success: false,
        error: `Failed to refresh ${provider} token`,
        message: result.error,
      });
    }

  } catch (error) {
    console.error('Failed to refresh tokens:', error);
    res.status(500).json({
      error: 'Failed to refresh tokens',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Test connection to external services
 */
export async function testConnections(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const results = {
      slack: { connected: false, error: null as string | null },
      google: { connected: false, error: null as string | null },
    };

    // Test Slack connection
    try {
      const { checkSlackConnection } = await import('../../services/slack/messageReader');
      results.slack.connected = await checkSlackConnection(req.user.id);
    } catch (error) {
      results.slack.error = error instanceof Error ? error.message : 'Unknown error';
    }

    // Test Google connection
    try {
      const { validateGoogleToken } = await import('../../services/oauth/token_manager');
      const validation = await validateGoogleToken(req.user.id);
      results.google.connected = validation.isValid;
      if (!validation.isValid && validation.isExpired) {
        results.google.error = 'Token expired';
      }
    } catch (error) {
      results.google.error = error instanceof Error ? error.message : 'Unknown error';
    }

    res.json({
      timestamp: new Date().toISOString(),
      results,
      overall: results.slack.connected && results.google.connected,
    });

  } catch (error) {
    console.error('Failed to test connections:', error);
    res.status(500).json({
      error: 'Failed to test connections',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get user profile information
 */
export async function getUserProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { findUserById } = await import('../../models/user');
    const user = await findUserById(req.user.id);
    
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    const authStatus = await getUserAuthStatus(req.user.id);

    res.json({
      id: user.id,
      email: user.email,
      slackUserId: user.slackUserId,
      timezone: user.timezone,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      services: {
        slack: authStatus.slack,
        google: authStatus.google,
      },
    });

  } catch (error) {
    console.error('Failed to get user profile:', error);
    res.status(500).json({
      error: 'Failed to get user profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Update user profile
 */
export async function updateUserProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { timezone } = req.body;
    
    if (!timezone || typeof timezone !== 'string') {
      res.status(400).json({ 
        error: 'Invalid timezone',
        message: 'Timezone is required and must be a valid string',
      });
      return;
    }

    const { updateUser } = await import('../../models/user');
    const updatedUser = await updateUser(req.user.id, { timezone });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        slackUserId: updatedUser.slackUserId,
        timezone: updatedUser.timezone,
        updatedAt: updatedUser.updatedAt,
      },
    });

  } catch (error) {
    console.error('Failed to update user profile:', error);
    res.status(500).json({
      error: 'Failed to update user profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}