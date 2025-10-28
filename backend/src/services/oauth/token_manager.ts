/**
 * OAuth token management service
 * 
 * This module provides centralized token management for OAuth providers,
 * including token refresh, validation, and cleanup operations.
 */

import { config } from '../../config';
import { Logger } from '../../utils/logger';

// Token refresh interfaces
export interface TokenRefreshResult {
  success: boolean;
  error?: string;
  newToken?: string;
  expiresAt?: Date;
}

export interface TokenValidationResult {
  isValid: boolean;
  isExpired: boolean;
  expiresIn?: number; // seconds until expiration
}

/**
 * Refresh Slack token (Note: Slack user tokens don't expire)
 */
export async function refreshSlackToken(userId: string): Promise<TokenRefreshResult> {
  try {
    const { findSlackTokenByUser } = await import('../../models/slackToken');
    const tokenRecord = await findSlackTokenByUser(userId);
    
    if (!tokenRecord) {
      return {
        success: false,
        error: 'No Slack token found for user',
      };
    }

    // Slack user tokens don't expire, so we just validate the existing token
    const { checkSlackConnection } = await import('../../services/slack/messageReader');
    const isValid = await checkSlackConnection(userId);
    
    if (!isValid) {
      return {
        success: false,
        error: 'Slack token is invalid or revoked',
      };
    }

    return {
      success: true,
      newToken: tokenRecord.accessToken,
    };
  } catch (error) {
    Logger.auth.oauthFailed('slack', `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Refresh Google token
 */
export async function refreshGoogleToken(userId: string): Promise<TokenRefreshResult> {
  try {
    const { refreshGoogleToken } = await import('../../routes/auth/google');
    const success = await refreshGoogleToken(userId);
    
    if (!success) {
      return {
        success: false,
        error: 'Failed to refresh Google token',
      };
    }

    // Get the new token details
    const { findGoogleTokenByUser } = await import('../../models/googleToken');
    const tokenRecord = await findGoogleTokenByUser(userId);
    
    return {
      success: true,
      newToken: tokenRecord?.accessToken,
      expiresAt: tokenRecord?.expiresAt || undefined,
    };
  } catch (error) {
    Logger.auth.oauthFailed('google', `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Validate Slack token
 */
export async function validateSlackToken(userId: string): Promise<TokenValidationResult> {
  try {
    const { findSlackTokenByUser } = await import('../../models/slackToken');
    const { checkSlackConnection } = await import('../../services/slack/messageReader');
    
    const tokenRecord = await findSlackTokenByUser(userId);
    if (!tokenRecord) {
      return {
        isValid: false,
        isExpired: false,
      };
    }

    // Check if token works with Slack API
    const isValid = await checkSlackConnection(userId);
    
    return {
      isValid,
      isExpired: false, // Slack user tokens don't expire
    };
  } catch (error) {
    console.error('Slack token validation failed:', error);
    return {
      isValid: false,
      isExpired: false,
    };
  }
}

/**
 * Validate Google token
 */
export async function validateGoogleToken(userId: string): Promise<TokenValidationResult> {
  try {
    const { findGoogleTokenByUser, isGoogleTokenExpired } = await import('../../models/googleToken');
    
    const tokenRecord = await findGoogleTokenByUser(userId);
    if (!tokenRecord) {
      return {
        isValid: false,
        isExpired: false,
      };
    }

    const isExpired = await isGoogleTokenExpired(userId);
    
    // If expired, try to refresh
    if (isExpired && tokenRecord.refreshToken) {
      const refreshResult = await refreshGoogleToken(userId);
      if (refreshResult.success) {
        return {
          isValid: true,
          isExpired: false,
          expiresIn: refreshResult.expiresAt ? 
            Math.floor((refreshResult.expiresAt.getTime() - Date.now()) / 1000) : undefined,
        };
      }
    }

    // Calculate expiration time
    let expiresIn: number | undefined;
    if (tokenRecord.expiresAt) {
      expiresIn = Math.floor((tokenRecord.expiresAt.getTime() - Date.now()) / 1000);
    }

    return {
      isValid: !isExpired,
      isExpired,
      expiresIn: expiresIn && expiresIn > 0 ? expiresIn : undefined,
    };
  } catch (error) {
    console.error('Google token validation failed:', error);
    return {
      isValid: false,
      isExpired: true,
    };
  }
}

/**
 * Get tokens expiring soon for proactive refresh
 */
export async function getExpiringTokens(provider: 'slack' | 'google', minutesThreshold: number = 60): Promise<string[]> {
  try {
    const expiringUserIds: string[] = [];
    
    if (provider === 'google') {
      const { getExpiringSoonGoogleTokens } = await import('../../models/googleToken');
      const tokens = await getExpiringSoonGoogleTokens();
      
      const thresholdTime = new Date(Date.now() + (minutesThreshold * 60 * 1000));
      
      for (const token of tokens) {
        if (token.expiresAt && token.expiresAt <= thresholdTime) {
          expiringUserIds.push(token.userId);
        }
      }
    }
    // Slack tokens don't expire, so no need to check
    
    return expiringUserIds;
  } catch (error) {
    console.error(`Failed to get expiring ${provider} tokens:`, error);
    return [];
  }
}

/**
 * Batch refresh tokens for multiple users
 */
export async function batchRefreshTokens(provider: 'slack' | 'google', userIds: string[]): Promise<{
  success: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
}> {
  const results = {
    success: 0,
    failed: 0,
    errors: [] as Array<{ userId: string; error: string }>,
  };

  const refreshFunction = provider === 'slack' ? refreshSlackToken : refreshGoogleToken;

  for (const userId of userIds) {
    try {
      const result = await refreshFunction(userId);
      if (result.success) {
        results.success++;
        Logger.auth.tokenRefresh(userId, provider);
      } else {
        results.failed++;
        results.errors.push({
          userId,
          error: result.error || 'Unknown error',
        });
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return results;
}

/**
 * Cleanup invalid tokens
 */
export async function cleanupInvalidTokens(provider: 'slack' | 'google'): Promise<{
  cleaned: number;
  errors: Array<{ userId: string; error: string }>;
}> {
  const results = {
    cleaned: 0,
    errors: [] as Array<{ userId: string; error: string }>,
  };

  try {
    let tokens: Array<{ userId: string }> = [];
    
    if (provider === 'slack') {
      const { getAllSlackTokens } = await import('../../models/slackToken');
      tokens = await getAllSlackTokens();
    } else {
      const { getAllGoogleTokens } = await import('../../models/googleToken');
      tokens = await getAllGoogleTokens();
    }

    for (const token of tokens) {
      try {
        const validation = provider === 'slack' 
          ? await validateSlackToken(token.userId)
          : await validateGoogleToken(token.userId);

        if (!validation.isValid) {
          // Token is invalid, remove it
          if (provider === 'slack') {
            const { deleteSlackToken } = await import('../../models/slackToken');
            await deleteSlackToken(token.userId);
          } else {
            const { deleteGoogleToken } = await import('../../models/googleToken');
            await deleteGoogleToken(token.userId);
          }
          
          results.cleaned++;
          Logger.auth.tokenRevoked(token.userId, provider);
        }
      } catch (error) {
        results.errors.push({
          userId: token.userId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  } catch (error) {
    console.error(`Failed to cleanup ${provider} tokens:`, error);
  }

  return results;
}

/**
 * Get authentication status summary for a user
 */
export async function getUserAuthStatus(userId: string): Promise<{
  slack: {
    connected: boolean;
    isValid: boolean;
    lastUpdated?: Date;
  };
  google: {
    connected: boolean;
    isValid: boolean;
    isExpired: boolean;
    expiresIn?: number;
    lastUpdated?: Date;
  };
}> {
  try {
    // Get Slack status
    const slackValidation = await validateSlackToken(userId);
    const { findSlackTokenByUser } = await import('../../models/slackToken');
    const slackToken = await findSlackTokenByUser(userId);

    // Get Google status
    const googleValidation = await validateGoogleToken(userId);
    const { findGoogleTokenByUser } = await import('../../models/googleToken');
    const googleToken = await findGoogleTokenByUser(userId);

    return {
      slack: {
        connected: !!slackToken,
        isValid: slackValidation.isValid,
        lastUpdated: slackToken?.updatedAt,
      },
      google: {
        connected: !!googleToken,
        isValid: googleValidation.isValid,
        isExpired: googleValidation.isExpired,
        expiresIn: googleValidation.expiresIn,
        lastUpdated: googleToken?.updatedAt,
      },
    };
  } catch (error) {
    console.error('Failed to get user auth status:', error);
    throw error;
  }
}

/**
 * Scheduled job to refresh expiring tokens
 */
export async function scheduleTokenRefresh(): Promise<void> {
  try {
    Logger.system.workerStarted('token-refresh');

    // Check for Google tokens expiring in the next hour
    const expiringGoogleUsers = await getExpiringTokens('google', 60);
    
    if (expiringGoogleUsers.length > 0) {
      console.log(`Refreshing ${expiringGoogleUsers.length} expiring Google tokens`);
      const results = await batchRefreshTokens('google', expiringGoogleUsers);
      
      console.log(`Token refresh completed: ${results.success} success, ${results.failed} failed`);
      
      if (results.errors.length > 0) {
        console.error('Token refresh errors:', results.errors);
      }
    }

    // Clean up invalid tokens (run less frequently)
    const shouldCleanup = Math.random() < 0.1; // 10% chance each run
    if (shouldCleanup) {
      console.log('Running token cleanup...');
      
      const slackCleanup = await cleanupInvalidTokens('slack');
      const googleCleanup = await cleanupInvalidTokens('google');
      
      console.log(`Cleanup completed: Slack ${slackCleanup.cleaned}, Google ${googleCleanup.cleaned} tokens removed`);
    }

  } catch (error) {
    console.error('Token refresh job failed:', error);
  }
}