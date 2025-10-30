/**
 * OAuth token management service with workspace context
 * 
 * This module provides centralized token management for OAuth providers,
 * including token refresh, validation, and cleanup operations with workspace scoping.
 */

import { config } from '../../config';
import { Logger } from '../../utils/logger';
import { findWorkspaceById } from '../../models/workspace';

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

export interface WorkspaceTokenSummary {
  workspaceId: string;
  workspaceName: string;
  userCount: number;
  connectedUsers: {
    slack: number;
    google: number;
  };
  expiringSoon: {
    google: number;
  };
  invalidTokens: {
    slack: number;
    google: number;
  };
}

/**
 * Get workspace context for logging
 */
async function getWorkspaceContext(userId: string): Promise<{ id: string; slackTeamName: string } | undefined> {
  try {
    const { findUserById } = await import('../../models/user');
    const user = await findUserById(userId);
    if (user?.workspaceId) {
      const workspace = await findWorkspaceById(user.workspaceId);
      if (workspace) {
        return {
          id: workspace.id,
          slackTeamName: workspace.slackTeamName,
        };
      }
    }
  } catch (error) {
    // Ignore error, return undefined
  }
  return undefined;
}

/**
 * Refresh Slack token with workspace context (Note: Slack user tokens don't expire)
 */
export async function refreshSlackToken(userId: string): Promise<TokenRefreshResult> {
  try {
    const workspaceContext = await getWorkspaceContext(userId);
    
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
    const workspaceContext = await getWorkspaceContext(userId);
    Logger.auth.oauthFailed('slack', `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`, workspaceContext);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Refresh Google token with workspace context
 */
export async function refreshGoogleToken(userId: string): Promise<TokenRefreshResult> {
  try {
    const workspaceContext = await getWorkspaceContext(userId);
    
    // We need to implement Google token refresh logic since the import was referencing the old function
    const { findGoogleTokenByUser, upsertGoogleToken } = await import('../../models/googleToken');
    const { google } = await import('googleapis');
    
    const tokenRecord = await findGoogleTokenByUser(userId);
    if (!tokenRecord || !tokenRecord.refreshToken) {
      return {
        success: false,
        error: 'No refresh token available for Google token refresh',
      };
    }

    // Create OAuth client and refresh the token
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    oauth2Client.setCredentials({
      refresh_token: tokenRecord.refreshToken,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();
    
    if (!credentials.access_token) {
      throw new Error('No access token received from refresh');
    }

    // Update stored token
    const expiresAt = credentials.expiry_date ? new Date(credentials.expiry_date) : undefined;
    
    await upsertGoogleToken({
      userId,
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token || tokenRecord.refreshToken,
      expiresAt,
    });

    Logger.auth.tokenRefresh(userId, 'google', workspaceContext);
    
    return {
      success: true,
      newToken: credentials.access_token,
      expiresAt,
    };
  } catch (error) {
    const workspaceContext = await getWorkspaceContext(userId);
    Logger.auth.oauthFailed('google', `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`, workspaceContext);
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
 * Get token summary for a specific workspace
 */
export async function getWorkspaceTokenSummary(workspaceId: string): Promise<WorkspaceTokenSummary | null> {
  try {
    const workspace = await findWorkspaceById(workspaceId);
    if (!workspace) {
      return null;
    }

    // Get all users in the workspace
    const { getUsersByWorkspace } = await import('../../models/user');
    const users = await getUsersByWorkspace(workspaceId);

    // Count connected users and token status
    let slackConnected = 0;
    let googleConnected = 0;
    let googleExpiringSoon = 0;
    let slackInvalid = 0;
    let googleInvalid = 0;

    const promises = users.map(async (user: any) => {
      try {
        // Check Slack token
        const slackValidation = await validateSlackToken(user.id);
        if (slackValidation.isValid) {
          slackConnected++;
        } else {
          slackInvalid++;
        }

        // Check Google token
        const googleValidation = await validateGoogleToken(user.id);
        if (googleValidation.isValid) {
          googleConnected++;
          
          // Check if expiring soon (within 24 hours)
          if (googleValidation.expiresIn && googleValidation.expiresIn < 24 * 60 * 60) {
            googleExpiringSoon++;
          }
        } else {
          googleInvalid++;
        }
      } catch (error) {
        console.error(`Error checking tokens for user ${user.id}:`, error);
      }
    });

    await Promise.all(promises);

    return {
      workspaceId: workspace.id,
      workspaceName: workspace.slackTeamName,
      userCount: users.length,
      connectedUsers: {
        slack: slackConnected,
        google: googleConnected,
      },
      expiringSoon: {
        google: googleExpiringSoon,
      },
      invalidTokens: {
        slack: slackInvalid,
        google: googleInvalid,
      },
    };
  } catch (error) {
    console.error(`Failed to get workspace token summary for ${workspaceId}:`, error);
    return null;
  }
}

/**
 * Refresh all expiring tokens for a specific workspace
 */
export async function refreshWorkspaceTokens(workspaceId: string, minutesThreshold: number = 60): Promise<{
  workspace: string;
  refreshed: number;
  failed: number;
  errors: Array<{ userId: string; error: string }>;
}> {
  try {
    const workspace = await findWorkspaceById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const { getUsersByWorkspace } = await import('../../models/user');
    const users = await getUsersByWorkspace(workspaceId);

    const results = {
      workspace: workspace.slackTeamName,
      refreshed: 0,
      failed: 0,
      errors: [] as Array<{ userId: string; error: string }>,
    };

    // Only check Google tokens since Slack tokens don't expire
    for (const user of users) {
      try {
        const googleValidation = await validateGoogleToken(user.id);
        
        // Check if token expires within threshold
        if (googleValidation.expiresIn && googleValidation.expiresIn < minutesThreshold * 60) {
          const refreshResult = await refreshGoogleToken(user.id);
          
          if (refreshResult.success) {
            results.refreshed++;
          } else {
            results.failed++;
            results.errors.push({
              userId: user.id,
              error: refreshResult.error || 'Unknown error',
            });
          }
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          userId: user.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  } catch (error) {
    throw new Error(`Failed to refresh workspace tokens: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get authentication overview for all workspaces
 */
export async function getAllWorkspacesTokenSummary(): Promise<WorkspaceTokenSummary[]> {
  try {
    const { getActiveWorkspaces } = await import('../../models/workspace');
    const workspaces = await getActiveWorkspaces();

    const summaries = await Promise.all(
      workspaces.map(async (workspace) => {
        const summary = await getWorkspaceTokenSummary(workspace.id);
        return summary;
      })
    );

    return summaries.filter((summary): summary is WorkspaceTokenSummary => summary !== null);
  } catch (error) {
    console.error('Failed to get all workspace token summaries:', error);
    return [];
  }
}

/**
 * Batch refresh tokens across all workspaces
 */
export async function refreshAllWorkspacesTokens(minutesThreshold: number = 60): Promise<{
  workspaces: number;
  totalRefreshed: number;
  totalFailed: number;
  workspaceResults: Array<{
    workspaceId: string;
    workspaceName: string;
    refreshed: number;
    failed: number;
  }>;
}> {
  try {
    const { getActiveWorkspaces } = await import('../../models/workspace');
    const workspaces = await getActiveWorkspaces();

    const globalResults = {
      workspaces: workspaces.length,
      totalRefreshed: 0,
      totalFailed: 0,
      workspaceResults: [] as Array<{
        workspaceId: string;
        workspaceName: string;
        refreshed: number;
        failed: number;
      }>,
    };

    for (const workspace of workspaces) {
      try {
        const workspaceResult = await refreshWorkspaceTokens(workspace.id, minutesThreshold);
        
        globalResults.totalRefreshed += workspaceResult.refreshed;
        globalResults.totalFailed += workspaceResult.failed;
        globalResults.workspaceResults.push({
          workspaceId: workspace.id,
          workspaceName: workspace.slackTeamName,
          refreshed: workspaceResult.refreshed,
          failed: workspaceResult.failed,
        });
      } catch (error) {
        console.error(`Failed to refresh tokens for workspace ${workspace.id}:`, error);
        globalResults.workspaceResults.push({
          workspaceId: workspace.id,
          workspaceName: workspace.slackTeamName,
          refreshed: 0,
          failed: 0,
        });
      }
    }

    return globalResults;
  } catch (error) {
    console.error('Failed to refresh tokens across all workspaces:', error);
    throw error;
  }
}

/**
 * Enhanced scheduled job to refresh expiring tokens with workspace awareness
 */
export async function scheduleTokenRefresh(): Promise<void> {
  try {
    Logger.system.startup();

    console.log('🔄 Starting workspace-aware token refresh job...');

    // Refresh tokens across all workspaces
    const results = await refreshAllWorkspacesTokens(60); // 60 minutes threshold

    console.log(`✅ Token refresh completed across ${results.workspaces} workspaces:`);
    console.log(`   📊 Total refreshed: ${results.totalRefreshed}`);
    console.log(`   ❌ Total failed: ${results.totalFailed}`);

    // Log per-workspace results
    for (const workspaceResult of results.workspaceResults) {
      if (workspaceResult.refreshed > 0 || workspaceResult.failed > 0) {
        console.log(`   🏢 ${workspaceResult.workspaceName}: ${workspaceResult.refreshed} refreshed, ${workspaceResult.failed} failed`);
      }
    }

    // Clean up invalid tokens (run less frequently)
    const shouldCleanup = Math.random() < 0.1; // 10% chance each run
    if (shouldCleanup) {
      console.log('🧹 Running token cleanup...');
      
      const slackCleanup = await cleanupInvalidTokens('slack');
      const googleCleanup = await cleanupInvalidTokens('google');
      
      console.log(`🗑️ Cleanup completed: Slack ${slackCleanup.cleaned}, Google ${googleCleanup.cleaned} tokens removed`);
    }

  } catch (error) {
    console.error('❌ Token refresh job failed:', error);
  }
}