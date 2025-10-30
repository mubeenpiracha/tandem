/**
 * Slack OAuth authentication routes
 * 
 * This module handles the Slack OAuth 2.0 flow for user authentication
 * within workspace context and token management with workspace scoping.
 */

import express, { Request, Response, NextFunction } from 'express';
import { WebClient } from '@slack/web-api';
import { createUser, findUserBySlackId, updateUser } from '../../models/user';
import { upsertSlackToken } from '../../models/slackToken';
import { findWorkspaceBySlackTeamId, findWorkspaceById } from '../../models/workspace';
import { generateOAuthState, validateOAuthState } from '../../services/oauth';
import { config } from '../../config';
import { Logger } from '../../utils/logger';
import { validate } from '../../utils/validation';
import { z } from 'zod';

// Validation schemas
const slackLoginQuerySchema = z.object({
  workspace: z.string().uuid().optional(), // Workspace ID for context
  redirect_to: z.string().url().optional(),
  state: z.string().optional(),
});

const slackCallbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

// Slack OAuth interfaces
interface SlackOAuthResponse {
  ok: boolean;
  access_token: string;
  token_type: string;
  scope: string;
  bot_user_id?: string;
  app_id: string;
  team: {
    id: string;
    name: string;
  };
  enterprise?: {
    id: string;
    name: string;
  };
  authed_user: {
    id: string;
    scope: string;
    access_token: string;
    token_type: string;
  };
  error?: string;
}

interface SlackUserInfo {
  ok: boolean;
  user: {
    id: string;
    name: string;
    profile: {
      email: string;
      real_name: string;
      display_name: string;
      image_512: string;
    };
    tz: string;
  };
  error?: string;
}

/**
 * GET /auth/slack/login
 * 
 * Initiate Slack OAuth flow for user authentication within workspace context.
 * This is different from workspace installation - this authenticates individual users.
 */
/**
 * Initiate Slack OAuth flow for user authentication within workspace context.
 * This is different from workspace installation - this authenticates individual users.
 */
export async function initiateSlackOAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const queryValidation = validate(slackLoginQuerySchema, req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: queryValidation.errors,
      });
    }

    const { workspace: workspaceId, redirect_to } = queryValidation.data || {};
    
    // If workspace is specified, validate it exists
    let workspaceContext: { id: string; slackTeamName: string } | undefined = undefined;
    if (workspaceId) {
      const workspace = await findWorkspaceById(workspaceId);
      if (!workspace || !workspace.isActive) {
        return res.status(400).json({
          success: false,
          error: 'Invalid workspace',
          message: 'Workspace not found or inactive',
        });
      }
      workspaceContext = { id: workspace.id, slackTeamName: workspace.slackTeamName };
    }
    
    // Generate secure state parameter with workspace context
    const state = generateOAuthState('slack', workspaceId, redirect_to);
    
    // Build Slack OAuth URL for user authentication
    const authUrl = new URL('https://slack.com/oauth/v2/authorize');
    authUrl.searchParams.set('client_id', config.slack.clientId);
    authUrl.searchParams.set('user_scope', config.slack.userScopes.join(','));
    authUrl.searchParams.set('redirect_uri', config.slack.redirectUri);
    authUrl.searchParams.set('state', state);

    Logger.auth.oauthInitiated('slack', state, workspaceContext);

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Slack OAuth initiation failed:', error);
    next(error);
  }
}

/**
 * Handle Slack OAuth callback for user authentication within workspace context.
 */
/**
 * Handle Slack OAuth callback for user authentication within workspace context.
 */
export async function handleSlackOAuthCallback(req: Request, res: Response, next: NextFunction) {
  try {
    const queryValidation = validate(slackCallbackQuerySchema, req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid callback parameters',
        details: queryValidation.errors,
      });
    }

    if (!queryValidation.data) {
      return res.status(400).json({
        success: false,
        error: 'Missing callback data',
        details: queryValidation.errors,
      });
    }

    const { code, state, error, error_description } = queryValidation.data;

    // Handle OAuth errors
    if (error) {
      console.error('Slack OAuth error:', error);
      return res.status(400).json({
        success: false,
        error: 'OAuth authorization failed',
        details: error_description || error,
      });
    }

    // Validate state parameter
    const stateData = validateOAuthState(state);
    if (!stateData || stateData.provider !== 'slack') {
      return res.status(400).json({
        success: false,
        error: 'Invalid state parameter',
        details: 'State validation failed',
      });
    }

    // Exchange code for tokens
    const tokenResponse = await exchangeSlackCode(code);
    if (!tokenResponse.ok || !tokenResponse.authed_user) {
      throw new Error(`Token exchange failed: ${tokenResponse.error}`);
    }

    // Find workspace by Slack team ID
    const workspace = await findWorkspaceBySlackTeamId(tokenResponse.team.id);
    if (!workspace || !workspace.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Workspace not found',
        details: 'This Slack workspace is not registered with our app or is inactive',
      });
    }

    const workspaceContext = { id: workspace.id, slackTeamName: workspace.slackTeamName };

    // Get user information from Slack
    const userInfo = await getSlackUserInfo(tokenResponse.authed_user.access_token);
    if (!userInfo.ok || !userInfo.user) {
      throw new Error(`Failed to get user info: ${userInfo.error}`);
    }

    const slackUser = userInfo.user;

    // Create or update user in database
    let user = await findUserBySlackId(slackUser.id, workspace.id);
    
    if (!user) {
      // Create new user
      user = await createUser({
        workspaceId: workspace.id,
        email: slackUser.profile.email,
        slackUserId: slackUser.id,
        timezone: slackUser.tz || 'UTC',
      });
      
      Logger.auth.userCreated(user.id, 'slack', slackUser.profile.email, workspaceContext);
    } else {
      // Update existing user
      user = await updateUser(user.id, {
        email: slackUser.profile.email,
        timezone: slackUser.tz || user.timezone,
      });
      
      Logger.auth.userUpdated(user.id, 'slack', workspaceContext);
    }

    // Store Slack tokens
    await upsertSlackToken({
      userId: user.id,
      accessToken: tokenResponse.authed_user.access_token,
      refreshToken: undefined, // Slack doesn't provide refresh tokens for user tokens
      expiresAt: undefined, // Slack user tokens don't expire
    });

    Logger.auth.tokenStored(user.id, 'slack', workspaceContext);

    // Generate JWT for user session
    const jwt = await generateUserJWT(user);

    // Redirect to success page or return JSON
    const redirectTo = stateData.redirectTo || '/dashboard';
    
    if (req.headers.accept?.includes('application/json')) {
      res.json({
        success: true,
        token: jwt,
        user: {
          id: user.id,
          email: user.email,
          slackUserId: user.slackUserId,
          workspace: {
            id: workspace.id,
            name: workspace.slackTeamName,
            teamId: workspace.slackTeamId,
          },
        },
        redirectTo,
      });
    } else {
      // Redirect with token in URL (for web flow)
      const redirectUrl = new URL(redirectTo, config.server.baseUrl);
      redirectUrl.searchParams.set('token', jwt);
      redirectUrl.searchParams.set('workspace', workspace.id);
      res.redirect(redirectUrl.toString());
    }

  } catch (error) {
    console.error('Slack OAuth callback failed:', error);
    Logger.auth.oauthFailed('slack', error instanceof Error ? error.message : 'Unknown error');
    
    next(error);
  }
}

/**
 * Exchange authorization code for access token
 */
async function exchangeSlackCode(code: string): Promise<SlackOAuthResponse> {
  const response = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: config.slack.clientId,
      client_secret: config.slack.clientSecret,
      code,
      redirect_uri: config.slack.redirectUri,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.json() as SlackOAuthResponse;
}

/**
 * Get user information from Slack API
 */
async function getSlackUserInfo(accessToken: string): Promise<SlackUserInfo> {
  const slack = new WebClient(accessToken);
  
  // First get the current user's identity
  const authResponse = await slack.auth.test();
  if (!authResponse.ok || !authResponse.user_id) {
    throw new Error('Failed to get user identity from auth.test');
  }
  
  // Then get detailed user info
  const response = await slack.users.info({
    user: authResponse.user_id,
  });

  return response as SlackUserInfo;
}

/**
 * Generate JWT token for user session
 */
async function generateUserJWT(user: any): Promise<string> {
  const jwt = require('jsonwebtoken');
  
  const payload = {
    userId: user.id,
    email: user.email,
    slackUserId: user.slackUserId,
    iat: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
    issuer: 'tandem-app',
    audience: 'tandem-users',
  });
}

/**
 * Revoke Slack OAuth tokens for the authenticated user.
 */
/**
 * Revoke Slack OAuth tokens for the authenticated user.
 */
export async function revokeSlackAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // TODO: Add authentication middleware
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }

    // Note: Slack doesn't provide a revoke endpoint for user tokens
    // We'll just remove the token from our database
    const { deleteSlackToken } = await import('../../models/slackToken');
    await deleteSlackToken(req.user.id);

    // Get workspace context for logging
    let workspaceContext;
    try {
      const { findUserById } = await import('../../models/user');
      const user = await findUserById(req.user.id);
      if (user?.workspaceId) {
        const workspace = await findWorkspaceById(user.workspaceId);
        if (workspace) {
          workspaceContext = { 
            id: workspace.id, 
            slackTeamName: workspace.slackTeamName 
          };
        }
      }
    } catch (error) {
      // Ignore error, just log without context
    }

    Logger.auth.tokenRevoked(req.user.id, 'slack', workspaceContext);

    res.json({
      success: true,
      message: 'Slack authentication revoked',
    });

  } catch (error) {
    console.error('Slack auth revocation failed:', error);
    next(error);
  }
}

/**
 * Get Slack authentication status for the authenticated user.
 */
/**
 * Get Slack authentication status for the authenticated user.
 */
export async function getSlackAuthStatus(req: Request, res: Response, next: NextFunction) {
  try {
    // TODO: Add authentication middleware
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication required' 
      });
    }

    const { findSlackTokenByUser, isSlackTokenExpired } = await import('../../models/slackToken');
    const { checkSlackConnection } = await import('../../services/slack/messageReader');

    const token = await findSlackTokenByUser(req.user.id);
    const isExpired = token ? await isSlackTokenExpired(req.user.id) : false;
    const isConnected = token && !isExpired ? await checkSlackConnection(req.user.id) : false;

    res.json({
      success: true,
      status: {
        connected: !!token && !isExpired && isConnected,
        hasToken: !!token,
        isExpired,
        lastUpdated: token?.updatedAt || null,
      },
    });

  } catch (error) {
    console.error('Slack auth status check failed:', error);
    next(error);
  }
}