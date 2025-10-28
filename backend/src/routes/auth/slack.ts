/**
 * Slack OAuth authentication routes
 * 
 * This module handles the Slack OAuth 2.0 flow for user authentication
 * and token management.
 */

import { Request, Response, NextFunction } from 'express';
import { WebClient } from '@slack/web-api';
import { createUser, findUserBySlackId, updateUser } from '../../models/user';
import { upsertSlackToken } from '../../models/slackToken';
import { generateOAuthState, validateOAuthState } from '../../services/oauth';
import { config } from '../../config';
import { Logger } from '../../utils/logger';

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
 * Initiate Slack OAuth flow
 */
export async function initiateSlackOAuth(req: Request, res: Response): Promise<void> {
  try {
    const { redirect_to } = req.query;
    
    // Generate secure state parameter
    const state = generateOAuthState('slack', undefined, redirect_to as string);
    
    // Build Slack OAuth URL
    const authUrl = new URL('https://slack.com/oauth/v2/authorize');
    authUrl.searchParams.set('client_id', config.slack.clientId);
    authUrl.searchParams.set('scope', config.slack.botScopes.join(','));
    authUrl.searchParams.set('redirect_uri', config.slack.redirectUri);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('user_scope', config.slack.userScopes.join(','));

    Logger.auth.oauthInitiated('slack', state);

    res.redirect(authUrl.toString());
  } catch (error) {
    console.error('Slack OAuth initiation failed:', error);
    res.status(500).json({
      error: 'Failed to initiate Slack OAuth',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handle Slack OAuth callback
 */
export async function handleSlackOAuthCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code, state, error } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('Slack OAuth error:', error);
      res.status(400).json({
        error: 'OAuth authorization failed',
        details: error,
      });
      return;
    }

    // Validate required parameters
    if (!code || !state) {
      res.status(400).json({
        error: 'Missing required parameters',
        details: 'Authorization code and state are required',
      });
      return;
    }

    // Validate state parameter
    const stateData = validateOAuthState(state as string);
    if (!stateData || stateData.provider !== 'slack') {
      res.status(400).json({
        error: 'Invalid state parameter',
        details: 'State validation failed',
      });
      return;
    }

    // Exchange code for tokens
    const tokenResponse = await exchangeSlackCode(code as string);
    if (!tokenResponse.ok || !tokenResponse.authed_user) {
      throw new Error(`Token exchange failed: ${tokenResponse.error}`);
    }

    // Find workspace by Slack team ID
    const { findWorkspaceBySlackTeamId } = await import('../../models/workspace');
    const workspace = await findWorkspaceBySlackTeamId(tokenResponse.team.id);
    if (!workspace) {
      res.status(400).json({
        error: 'Workspace not found',
        details: 'This Slack workspace is not registered with our app',
      });
      return;
    }

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
      
      Logger.auth.userCreated(user.id, 'slack', slackUser.profile.email);
    } else {
      // Update existing user
      user = await updateUser(user.id, {
        email: slackUser.profile.email,
        timezone: slackUser.tz || user.timezone,
      });
      
      Logger.auth.userUpdated(user.id, 'slack');
    }

    // Store Slack tokens
    await upsertSlackToken({
      userId: user.id,
      accessToken: tokenResponse.authed_user.access_token,
      refreshToken: undefined, // Slack doesn't provide refresh tokens for user tokens
      expiresAt: undefined, // Slack user tokens don't expire
    });

    Logger.auth.tokenStored(user.id, 'slack');

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
        },
        redirectTo,
      });
    } else {
      // Redirect with token in URL (for web flow)
      const redirectUrl = new URL(redirectTo, config.server.baseUrl);
      redirectUrl.searchParams.set('token', jwt);
      res.redirect(redirectUrl.toString());
    }

  } catch (error) {
    console.error('Slack OAuth callback failed:', error);
    Logger.auth.oauthFailed('slack', error instanceof Error ? error.message : 'Unknown error');
    
    res.status(500).json({
      error: 'OAuth callback failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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
 * Revoke Slack OAuth tokens
 */
export async function revokeSlackAuth(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Note: Slack doesn't provide a revoke endpoint for user tokens
    // We'll just remove the token from our database
    const { deleteSlackToken } = await import('../../models/slackToken');
    await deleteSlackToken(req.user.id);

    Logger.auth.tokenRevoked(req.user.id, 'slack');

    res.json({
      success: true,
      message: 'Slack authentication revoked',
    });

  } catch (error) {
    console.error('Slack auth revocation failed:', error);
    res.status(500).json({
      error: 'Failed to revoke Slack authentication',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get Slack authentication status
 */
export async function getSlackAuthStatus(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { findSlackTokenByUser, isSlackTokenExpired } = await import('../../models/slackToken');
    const { checkSlackConnection } = await import('../../services/slack/messageReader');

    const token = await findSlackTokenByUser(req.user.id);
    const isExpired = token ? await isSlackTokenExpired(req.user.id) : false;
    const isConnected = token && !isExpired ? await checkSlackConnection(req.user.id) : false;

    res.json({
      connected: !!token && !isExpired && isConnected,
      hasToken: !!token,
      isExpired,
      lastUpdated: token?.updatedAt || null,
    });

  } catch (error) {
    console.error('Slack auth status check failed:', error);
    res.status(500).json({
      error: 'Failed to check Slack authentication status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}