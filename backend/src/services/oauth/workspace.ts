/**
 * Workspace OAuth service for Slack App installation
 * 
 * This module handles workspace-level OAuth flows for installing
 * the Tandem Slack bot into workspaces.
 */

import crypto from 'crypto';
import { config } from '../../config';
import { createWorkspace, findWorkspaceBySlackTeamId } from '../../models/workspace';

// Workspace installation state
export interface WorkspaceInstallState {
  provider: 'slack';
  timestamp: number;
  nonce: string;
  redirectTo?: string;
}

// Slack OAuth response for workspace installation
export interface SlackWorkspaceOAuthResponse {
  ok: boolean;
  app_id: string;
  authed_user: {
    id: string;
    scope: string;
    access_token: string;
    token_type: string;
  };
  scope: string;
  token_type: string;
  access_token: string; // Bot token
  bot_user_id: string;
  team: {
    id: string;
    name: string;
  };
  enterprise?: {
    id: string;
    name: string;
  };
  is_enterprise_install: boolean;
}

/**
 * Generate workspace installation URL for Slack
 */
export function generateWorkspaceInstallUrl(redirectTo?: string): string {
  const state = generateWorkspaceInstallState(redirectTo);
  
  const params = new URLSearchParams({
    client_id: config.slack.clientId,
    scope: config.slack.botScopes.join(','),
    user_scope: config.slack.userScopes.join(','),
    redirect_uri: `${config.server.baseUrl}${config.slack.workspace.callbackPath}`,
    state: state,
  });

  return `https://slack.com/oauth/v2/authorize?${params.toString()}`;
}

/**
 * Generate secure workspace installation state
 */
export function generateWorkspaceInstallState(redirectTo?: string): string {
  const state: WorkspaceInstallState = {
    provider: 'slack',
    timestamp: Date.now(),
    nonce: crypto.randomBytes(16).toString('hex'),
    redirectTo,
  };

  const stateString = JSON.stringify(state);
  return Buffer.from(stateString).toString('base64url');
}

/**
 * Validate workspace installation state
 */
export function validateWorkspaceInstallState(stateParam: string): WorkspaceInstallState | null {
  try {
    const decoded = Buffer.from(stateParam, 'base64url').toString();
    const state: WorkspaceInstallState = JSON.parse(decoded);

    // Validate timestamp (state expires after 1 hour)
    const maxAge = 60 * 60 * 1000; // 1 hour
    if (Date.now() - state.timestamp > maxAge) {
      console.log('Workspace install state expired');
      return null;
    }

    // Validate required fields
    if (state.provider !== 'slack' || !state.nonce) {
      console.log('Workspace install state invalid');
      return null;
    }

    return state;
  } catch (error) {
    console.error('Failed to validate workspace install state:', error);
    return null;
  }
}

/**
 * Exchange authorization code for workspace tokens
 */
export async function exchangeWorkspaceCode(code: string): Promise<SlackWorkspaceOAuthResponse> {
  const params = new URLSearchParams({
    client_id: config.slack.clientId,
    client_secret: config.slack.clientSecret,
    code,
    redirect_uri: `${config.server.baseUrl}${config.slack.workspace.callbackPath}`,
  });

  try {
    const response = await fetch('https://slack.com/api/oauth.v2.access', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json() as SlackWorkspaceOAuthResponse;
    
    if (!data.ok) {
      throw new Error(`Slack OAuth error: ${JSON.stringify(data)}`);
    }

    return data;
  } catch (error) {
    console.error('Failed to exchange workspace code:', error);
    throw error;
  }
}

/**
 * Handle workspace installation completion
 */
export async function completeWorkspaceInstallation(
  oauthResponse: SlackWorkspaceOAuthResponse
): Promise<string> {
  try {
    // Check if workspace already exists
    const existingWorkspace = await findWorkspaceBySlackTeamId(oauthResponse.team.id);
    
    if (existingWorkspace) {
      // Update existing workspace with new bot token
      const { updateWorkspaceBotToken } = await import('../../models/workspace');
      await updateWorkspaceBotToken(existingWorkspace.id, oauthResponse.access_token);
      
      console.log(`✅ Workspace reinstalled: ${oauthResponse.team.name}`);
      return existingWorkspace.id;
    } else {
      // Create new workspace
      const workspace = await createWorkspace({
        slackTeamId: oauthResponse.team.id,
        slackTeamName: oauthResponse.team.name,
        slackBotToken: oauthResponse.access_token, // This should be encrypted in production
        isActive: true,
      });

      console.log(`✅ New workspace installed: ${oauthResponse.team.name} (${workspace.id})`);
      return workspace.id;
    }
  } catch (error) {
    console.error('Failed to complete workspace installation:', error);
    throw error;
  }
}

/**
 * Get workspace bot token by team ID
 */
export async function getWorkspaceBotToken(slackTeamId: string): Promise<string | null> {
  try {
    const workspace = await findWorkspaceBySlackTeamId(slackTeamId);
    return workspace?.slackBotToken || null;
  } catch (error) {
    console.error('Failed to get workspace bot token:', error);
    return null;
  }
}

/**
 * Validate workspace is active and has valid bot token
 */
export async function validateWorkspaceAccess(slackTeamId: string): Promise<boolean> {
  try {
    const workspace = await findWorkspaceBySlackTeamId(slackTeamId);
    return workspace?.isActive === true && !!workspace.slackBotToken;
  } catch (error) {
    console.error('Failed to validate workspace access:', error);
    return false;
  }
}

/**
 * Test workspace bot token validity
 */
export async function testWorkspaceBotToken(slackTeamId: string): Promise<boolean> {
  try {
    const botToken = await getWorkspaceBotToken(slackTeamId);
    if (!botToken) {
      return false;
    }

    // Test the bot token by calling Slack API
    const response = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json() as any;
    return data.ok === true && data.team_id === slackTeamId;
  } catch (error) {
    console.error('Failed to test workspace bot token:', error);
    return false;
  }
}

/**
 * Refresh workspace bot token if needed
 */
export async function refreshWorkspaceBotToken(slackTeamId: string): Promise<boolean> {
  // Slack bot tokens don't typically expire, but this is a placeholder
  // for future token refresh logic if needed
  try {
    const isValid = await testWorkspaceBotToken(slackTeamId);
    if (isValid) {
      return true;
    }

    // If token is invalid, workspace admin needs to reinstall
    console.log(`❌ Workspace bot token invalid for team ${slackTeamId}, reinstallation required`);
    return false;
  } catch (error) {
    console.error('Failed to refresh workspace bot token:', error);
    return false;
  }
}