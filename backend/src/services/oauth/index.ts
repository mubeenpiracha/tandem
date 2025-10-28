/**
 * Base OAuth service structure
 * 
 * This module provides the foundational OAuth utilities and interfaces
 * for Slack and Google integrations.
 */

import crypto from 'crypto';
import { config } from '../../config';

// OAuth provider types
export type OAuthProvider = 'slack' | 'google';

// OAuth state management
export interface OAuthState {
  provider: OAuthProvider;
  userId?: string;
  redirectTo?: string;
  timestamp: number;
  nonce: string;
}

// OAuth token response interface
export interface OAuthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: Date;
  scope?: string;
  tokenType?: string;
}

// OAuth user info interface
export interface OAuthUserInfo {
  id: string;
  email: string;
  name?: string;
  avatar?: string;
  provider: OAuthProvider;
}

/**
 * Generate secure OAuth state parameter
 */
export function generateOAuthState(
  provider: OAuthProvider,
  userId?: string,
  redirectTo?: string
): string {
  const state: OAuthState = {
    provider,
    userId,
    redirectTo,
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
  };

  const stateString = JSON.stringify(state);
  const encoded = Buffer.from(stateString).toString('base64url');
  
  return encoded;
}

/**
 * Validate and parse OAuth state parameter
 */
export function validateOAuthState(stateParam: string): OAuthState | null {
  try {
    const decoded = Buffer.from(stateParam, 'base64url').toString();
    const state: OAuthState = JSON.parse(decoded);

    // Validate timestamp (state expires after 1 hour)
    const maxAge = 60 * 60 * 1000; // 1 hour
    if (Date.now() - state.timestamp > maxAge) {
      console.log('OAuth state expired');
      return null;
    }

    // Validate required fields
    if (!state.provider || !state.nonce) {
      console.log('OAuth state missing required fields');
      return null;
    }

    return state;
  } catch (error) {
    console.error('Failed to validate OAuth state:', error);
    return null;
  }
}

/**
 * Generate OAuth authorization URL
 */
export function generateAuthUrl(
  provider: OAuthProvider,
  state: string,
  scopes: string[]
): string {
  const params = new URLSearchParams();

  if (provider === 'slack') {
    params.append('client_id', config.slack.clientId);
    params.append('redirect_uri', config.slack.redirectUri);
    params.append('scope', scopes.join(' '));
    params.append('state', state);
    params.append('response_type', 'code');

    return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
  } else if (provider === 'google') {
    params.append('client_id', config.google.clientId);
    params.append('redirect_uri', config.google.redirectUri);
    params.append('scope', scopes.join(' '));
    params.append('state', state);
    params.append('response_type', 'code');
    params.append('access_type', 'offline');
    params.append('prompt', 'consent');

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  throw new Error(`Unsupported OAuth provider: ${provider}`);
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  provider: OAuthProvider,
  code: string
): Promise<OAuthTokenResponse> {
  let tokenUrl: string;
  let params: URLSearchParams;

  if (provider === 'slack') {
    tokenUrl = 'https://slack.com/api/oauth.v2.access';
    params = new URLSearchParams({
      client_id: config.slack.clientId,
      client_secret: config.slack.clientSecret,
      code,
      redirect_uri: config.slack.redirectUri,
    });
  } else if (provider === 'google') {
    tokenUrl = 'https://oauth2.googleapis.com/token';
    params = new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: config.google.redirectUri,
    });
  } else {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token exchange failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;

    // Handle provider-specific response formats
    if (provider === 'slack') {
      if (!data.ok) {
        throw new Error(`Slack OAuth error: ${data.error}`);
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        scope: data.scope,
        tokenType: data.token_type,
      };
    } else if (provider === 'google') {
      if (data.error) {
        throw new Error(`Google OAuth error: ${data.error_description || data.error}`);
      }

      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
        expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
        scope: data.scope,
        tokenType: data.token_type,
      };
    }

    throw new Error(`Unsupported provider response format: ${provider}`);
  } catch (error) {
    console.error(`OAuth token exchange failed for ${provider}:`, error);
    throw error;
  }
}

/**
 * Refresh OAuth access token
 */
export async function refreshAccessToken(
  provider: OAuthProvider,
  refreshToken: string
): Promise<OAuthTokenResponse> {
  let tokenUrl: string;
  let params: URLSearchParams;

  if (provider === 'slack') {
    // Slack doesn't typically use refresh tokens in the same way
    throw new Error('Slack token refresh not implemented - tokens are long-lived');
  } else if (provider === 'google') {
    tokenUrl = 'https://oauth2.googleapis.com/token';
    params = new URLSearchParams({
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
  } else {
    throw new Error(`Unsupported OAuth provider: ${provider}`);
  }

  try {
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OAuth token refresh failed: ${response.status} ${errorText}`);
    }

    const data = await response.json() as any;

    if (data.error) {
      throw new Error(`OAuth refresh error: ${data.error_description || data.error}`);
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken, // Keep existing refresh token if not provided
      expiresIn: data.expires_in,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      scope: data.scope,
      tokenType: data.token_type,
    };
  } catch (error) {
    console.error(`OAuth token refresh failed for ${provider}:`, error);
    throw error;
  }
}

/**
 * Validate OAuth access token
 */
export async function validateAccessToken(
  provider: OAuthProvider,
  accessToken: string
): Promise<boolean> {
  try {
    if (provider === 'slack') {
      const response = await fetch('https://slack.com/api/auth.test', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      const data = await response.json() as any;
      return data.ok;
    } else if (provider === 'google') {
      const response = await fetch(`https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=${accessToken}`);
      return response.ok;
    }

    return false;
  } catch (error) {
    console.error(`Token validation failed for ${provider}:`, error);
    return false;
  }
}

/**
 * Get OAuth provider configuration
 */
export function getOAuthConfig(provider: OAuthProvider) {
  if (provider === 'slack') {
    return {
      clientId: config.slack.clientId,
      redirectUri: config.slack.redirectUri,
      scopes: config.slack.userScopes,
      botScopes: config.slack.botScopes,
    };
  } else if (provider === 'google') {
    return {
      clientId: config.google.clientId,
      redirectUri: config.google.redirectUri,
      scopes: config.google.scopes,
    };
  }

  throw new Error(`Unsupported OAuth provider: ${provider}`);
}