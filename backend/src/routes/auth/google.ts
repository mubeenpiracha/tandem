/**
 * Google OAuth authentication routes
 * 
 * This module handles the Google OAuth 2.0 flow for user authentication
 * and token management for Google Calendar integration.
 */

import { Request, Response } from 'express';
import { google } from 'googleapis';
import { findUserById } from '../../models/user';
import { upsertGoogleToken } from '../../models/googleToken';
import { generateOAuthState, validateOAuthState } from '../../services/oauth';
import { config } from '../../config';
import { Logger } from '../../utils/logger';

// Google OAuth interfaces
interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  scope: string;
  token_type: string;
  expires_in: number;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  locale: string;
  hd?: string; // Hosted domain for G Suite users
}

/**
 * Initialize Google OAuth client
 */
function createGoogleOAuthClient() {
  return new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.redirectUri
  );
}

/**
 * Initiate Google OAuth flow
 */
export async function initiateGoogleOAuth(req: Request, res: Response): Promise<void> {
  try {
    const { redirect_to } = req.query;
    
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Generate secure state parameter
    const state = generateOAuthState('google', req.user.id, redirect_to as string);
    
    // Create OAuth client and get authorization URL
    const oauth2Client = createGoogleOAuthClient();
    
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline', // Gets refresh token
      prompt: 'consent', // Forces consent screen to get refresh token
      scope: config.google.scopes,
      state,
      include_granted_scopes: true,
    });

    Logger.auth.oauthInitiated('google', state);

    res.redirect(authUrl);
  } catch (error) {
    console.error('Google OAuth initiation failed:', error);
    res.status(500).json({
      error: 'Failed to initiate Google OAuth',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Handle Google OAuth callback
 */
export async function handleGoogleOAuthCallback(req: Request, res: Response): Promise<void> {
  try {
    const { code, state, error } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('Google OAuth error:', error);
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
    if (!stateData || stateData.provider !== 'google') {
      res.status(400).json({
        error: 'Invalid state parameter',
        details: 'State validation failed',
      });
      return;
    }

    // Verify user exists
    if (!stateData.userId) {
      res.status(400).json({
        error: 'User ID missing from state',
        details: 'User must be authenticated before connecting Google',
      });
      return;
    }

    const user = await findUserById(stateData.userId);
    if (!user) {
      res.status(404).json({
        error: 'User not found',
        details: 'Invalid user ID in state parameter',
      });
      return;
    }

    // Exchange code for tokens
    const oauth2Client = createGoogleOAuthClient();
    const { tokens } = await oauth2Client.getToken(code as string);
    
    if (!tokens.access_token) {
      throw new Error('No access token received from Google');
    }

    // Get user information to verify the connection
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfoResponse = await oauth2.userinfo.get();
    
    if (!userInfoResponse.data || !userInfoResponse.data.email) {
      throw new Error('Failed to get user info from Google');
    }

    const googleUserInfo = userInfoResponse.data as GoogleUserInfo;
    
    // Store Google tokens
    const expiresAt = tokens.expiry_date ? new Date(tokens.expiry_date) : undefined;
    
    await upsertGoogleToken({
      userId: user.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || undefined,
      expiresAt,
    });

    Logger.auth.tokenStored(user.id, 'google');
    Logger.auth.userUpdated(user.id, 'google');

    // Redirect to success page
    const redirectTo = stateData.redirectTo || '/dashboard';
    
    if (req.headers.accept?.includes('application/json')) {
      res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          googleEmail: googleUserInfo.email,
        },
        redirectTo,
      });
    } else {
      // Redirect to success page
      const redirectUrl = new URL(redirectTo, config.server.baseUrl);
      redirectUrl.searchParams.set('google_connected', 'true');
      res.redirect(redirectUrl.toString());
    }

  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    Logger.auth.oauthFailed('google', error instanceof Error ? error.message : 'Unknown error');
    
    res.status(500).json({
      error: 'OAuth callback failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Revoke Google OAuth tokens
 */
export async function revokeGoogleAuth(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { findGoogleTokenByUser, deleteGoogleToken } = await import('../../models/googleToken');
    
    // Get current token to revoke it with Google
    const tokenRecord = await findGoogleTokenByUser(req.user.id);
    
    if (tokenRecord) {
      try {
        // Revoke token with Google
        const oauth2Client = createGoogleOAuthClient();
        oauth2Client.setCredentials({
          access_token: tokenRecord.accessToken,
        });
        
        await oauth2Client.revokeCredentials();
      } catch (error) {
        console.error('Failed to revoke token with Google:', error);
        // Continue anyway to remove from our database
      }
      
      // Remove token from our database
      await deleteGoogleToken(req.user.id);
    }

    Logger.auth.tokenRevoked(req.user.id, 'google');

    res.json({
      success: true,
      message: 'Google authentication revoked',
    });

  } catch (error) {
    console.error('Google auth revocation failed:', error);
    res.status(500).json({
      error: 'Failed to revoke Google authentication',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get Google authentication status
 */
export async function getGoogleAuthStatus(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { findGoogleTokenByUser, isGoogleTokenExpired } = await import('../../models/googleToken');

    const token = await findGoogleTokenByUser(req.user.id);
    const isExpired = token ? await isGoogleTokenExpired(req.user.id) : false;
    
    // Test connection by making a simple API call
    let isConnected = false;
    if (token && !isExpired) {
      try {
        const oauth2Client = createGoogleOAuthClient();
        oauth2Client.setCredentials({
          access_token: token.accessToken,
          refresh_token: token.refreshToken || undefined,
        });
        
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
        await calendar.calendarList.list({ maxResults: 1 });
        isConnected = true;
      } catch (error) {
        console.error('Google Calendar connection test failed:', error);
        isConnected = false;
      }
    }

    res.json({
      connected: !!token && !isExpired && isConnected,
      hasToken: !!token,
      isExpired,
      lastUpdated: token?.updatedAt || null,
    });

  } catch (error) {
    console.error('Google auth status check failed:', error);
    res.status(500).json({
      error: 'Failed to check Google authentication status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Refresh Google access token
 */
export async function refreshGoogleToken(userId: string): Promise<boolean> {
  try {
    const { findGoogleTokenByUser, updateGoogleToken } = await import('../../models/googleToken');
    
    const tokenRecord = await findGoogleTokenByUser(userId);
    if (!tokenRecord?.refreshToken) {
      throw new Error('No refresh token available');
    }

    const oauth2Client = createGoogleOAuthClient();
    oauth2Client.setCredentials({
      refresh_token: tokenRecord.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (!credentials.access_token) {
      throw new Error('No access token received from refresh');
    }

    // Update stored tokens
    const expiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : undefined;
    
    await updateGoogleToken(userId, {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token || tokenRecord.refreshToken,
      expiresAt,
    });

    Logger.auth.tokenRefresh(userId, 'google');
    
    return true;
  } catch (error) {
    console.error('Google token refresh failed:', error);
    Logger.auth.oauthFailed('google', `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}