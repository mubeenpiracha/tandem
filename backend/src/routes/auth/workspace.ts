/**
 * Workspace Authentication Routes
 * 
 * This module handles Slack App installation flows for workspace-level
 * installation including bot token exchange and workspace registration.
 * This is separate from user authentication within workspaces.
 */

import express, { Request, Response, NextFunction } from 'express';
import { WebClient } from '@slack/web-api';
import { config } from '../../config';
import { Logger, LogCategory } from '../../utils/logger';
import { createWorkspace, findWorkspaceBySlackTeamId, updateWorkspaceBotToken } from '../../models/workspace';
import { validate } from '../../utils/validation';
import { z } from 'zod';

const router = express.Router();

// Validation schemas
const installQuerySchema = z.object({
  redirect_url: z.string().url().optional(),
  state: z.string().optional(),
});

const callbackQuerySchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

/**
 * GET /auth/slack/install
 * 
 * Initiates Slack App installation flow for workspace admins.
 * This redirects to Slack's OAuth flow for workspace-level app installation.
 */
router.get('/install', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const queryValidation = validate(installQuerySchema, req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: queryValidation.errors,
      });
    }

    const { redirect_url, state } = queryValidation.data || {};

    Logger.system.startup();

    // Generate installation state for CSRF protection
    const installState = state || `install_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Store redirect URL in session/cache if provided
    if (redirect_url) {
      // In production, store this in Redis with the state as key
      // For now, we'll include it in the state parameter
      // TODO: Implement secure state management with Redis
    }

    // Build Slack OAuth URL for workspace installation
    const slackOAuthUrl = new URL('https://slack.com/oauth/v2/authorize');
    slackOAuthUrl.searchParams.set('client_id', config.slack.clientId);
    slackOAuthUrl.searchParams.set('scope', config.slack.botScopes.join(','));
    slackOAuthUrl.searchParams.set('redirect_uri', `${config.webhooks.baseUrl}${config.slack.workspace.callbackPath}`);
    slackOAuthUrl.searchParams.set('state', installState);
    
    // Add user scopes for enhanced functionality
    if (config.slack.userScopes.length > 0) {
      slackOAuthUrl.searchParams.set('user_scope', config.slack.userScopes.join(','));
    }

    Logger.info(LogCategory.AUTH, 'Redirecting to Slack OAuth for workspace installation', {
      redirectUrl: slackOAuthUrl.toString(),
      state: installState,
    });

    res.redirect(slackOAuthUrl.toString());
  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Error initiating Slack workspace installation', error as Error, {
      stack: error instanceof Error ? error.stack : undefined,
    });
    next(error);
  }
});

/**
 * GET /auth/slack/workspace/callback
 * 
 * Handles the OAuth callback from Slack workspace installation.
 * Exchanges authorization code for bot token and stores workspace data.
 */
router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    Logger.info(LogCategory.AUTH, 'Processing Slack workspace installation callback', {
      query: req.query,
    });

    const queryValidation = validate(callbackQuerySchema, req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid callback parameters',
        details: queryValidation.errors,
      });
    }

    const { code, state, error, error_description } = queryValidation.data || {};

    // Handle OAuth errors
    if (error) {
      Logger.warn(LogCategory.AUTH, 'Slack workspace installation declined or failed', {
        error,
        description: error_description,
        state,
      });

      return res.status(400).json({
        success: false,
        error: 'Installation failed',
        description: error_description || 'User declined installation or an error occurred',
      });
    }

    // Exchange authorization code for access token
    const slackClient = new WebClient();
    const oauthResponse = await slackClient.oauth.v2.access({
      client_id: config.slack.clientId,
      client_secret: config.slack.clientSecret,
      code,
      redirect_uri: `${config.webhooks.baseUrl}${config.slack.workspace.callbackPath}`,
    });

    if (!oauthResponse.ok || !oauthResponse.access_token) {
      throw new Error(`OAuth exchange failed: ${oauthResponse.error || 'Unknown error'}`);
    }

    // Extract workspace and bot information
    const { 
      access_token: botToken,
      team,
      authed_user,
      bot_user_id,
      scope,
      token_type 
    } = oauthResponse;

    if (!team?.id || !team?.name) {
      throw new Error('Invalid team information received from Slack');
    }

    Logger.info(LogCategory.AUTH, 'Successfully obtained workspace tokens from Slack', {
      teamId: team.id,
      teamName: team.name,
      botUserId: bot_user_id,
      scopes: scope,
      tokenType: token_type,
    });

    // Check if workspace already exists
    let workspace = await findWorkspaceBySlackTeamId(team.id);

    if (workspace) {
      // Update existing workspace with new bot token
      workspace = await updateWorkspaceBotToken(workspace.id, botToken as string);
      
      Logger.info(LogCategory.AUTH, 'Updated existing workspace with new bot token', {
        workspaceId: workspace.id,
        teamId: team.id,
        teamName: team.name,
      });
    } else {
      // Create new workspace
      workspace = await createWorkspace({
        slackTeamId: team.id,
        slackTeamName: team.name,
        slackBotToken: botToken as string,
        isActive: true,
      });

      Logger.info(LogCategory.AUTH, 'Created new workspace from installation', {
        workspaceId: workspace.id,
        teamId: team.id,
        teamName: team.name,
      });
    }

    // Store additional installation metadata
    // TODO: Consider storing bot_user_id, authed_user details in workspace model
    
    // Success response - redirect to success page or return JSON
    const successResponse = {
      success: true,
      message: 'Workspace successfully connected to Tandem',
      workspace: {
        id: workspace.id,
        name: workspace.slackTeamName,
        teamId: workspace.slackTeamId,
        installedAt: workspace.installedAt,
      },
      nextSteps: {
        userAuthentication: `${config.server.baseUrl}/auth/slack/login?workspace=${workspace.id}`,
        dashboard: `${config.server.baseUrl}/dashboard?workspace=${workspace.id}`,
      },
    };

    // Check if this is an API request or browser request
    const acceptsJson = req.headers.accept?.includes('application/json');
    
    if (acceptsJson) {
      res.json(successResponse);
    } else {
      // Redirect to a success page with workspace info
      const successUrl = new URL(`${config.server.baseUrl}/install/success`);
      successUrl.searchParams.set('workspace', workspace.id);
      successUrl.searchParams.set('name', workspace.slackTeamName);
      res.redirect(successUrl.toString());
    }

  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Error processing Slack workspace installation callback', error as Error, {
      query: req.query,
    });
    
    // Return error response
    const errorResponse = {
      success: false,
      error: 'Installation failed',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    };

    const acceptsJson = req.headers.accept?.includes('application/json');
    
    if (acceptsJson) {
      res.status(500).json(errorResponse);
    } else {
      // Redirect to error page
      const errorUrl = new URL(`${config.server.baseUrl}/install/error`);
      errorUrl.searchParams.set('message', errorResponse.message);
      res.redirect(errorUrl.toString());
    }
  }
});

/**
 * POST /auth/slack/workspace/uninstall
 * 
 * Handles workspace uninstallation/deactivation.
 * This endpoint is typically called when the app is uninstalled from a workspace.
 */
router.post('/uninstall', async (req: Request, res: Response, next: NextFunction) => {
  try {
    Logger.info(LogCategory.AUTH, 'Processing workspace uninstall request', {
      body: req.body,
      headers: req.headers,
    });

    // Validate request (this might come from Slack's app uninstall webhook)
    const { team_id, user_id } = req.body;

    if (!team_id) {
      return res.status(400).json({
        success: false,
        error: 'Team ID is required for uninstallation',
      });
    }

    // Find and deactivate the workspace
    const workspace = await findWorkspaceBySlackTeamId(team_id);
    
    if (!workspace) {
      Logger.warn(LogCategory.AUTH, 'Attempted to uninstall non-existent workspace', {
        teamId: team_id,
        userId: user_id,
      });
      
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Deactivate workspace (preserves data but marks as inactive)
    const { deactivateWorkspace } = await import('../../models/workspace');
    await deactivateWorkspace(workspace.id);

    Logger.info(LogCategory.AUTH, 'Successfully deactivated workspace', {
      workspaceId: workspace.id,
      teamId: team_id,
      teamName: workspace.slackTeamName,
      uninstalledBy: user_id,
    });

    // TODO: Clean up related data if needed
    // - Deactivate scheduled jobs for this workspace
    // - Notify users about the uninstallation
    // - Handle any pending calendar events

    res.json({
      success: true,
      message: 'Workspace successfully uninstalled',
      workspace: {
        id: workspace.id,
        name: workspace.slackTeamName,
        deactivatedAt: new Date().toISOString(),
      },
    });

  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Error processing workspace uninstall', error as Error, {
      body: req.body,
    });
    
    next(error);
  }
});

/**
 * GET /auth/slack/workspace/status
 * 
 * Check the installation status of a workspace.
 * Useful for debugging and health checks.
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { team_id, workspace_id } = req.query;

    if (!team_id && !workspace_id) {
      return res.status(400).json({
        success: false,
        error: 'Either team_id or workspace_id is required',
      });
    }

    let workspace;
    
    if (workspace_id) {
      const { findWorkspaceById } = await import('../../models/workspace');
      workspace = await findWorkspaceById(workspace_id as string);
    } else {
      workspace = await findWorkspaceBySlackTeamId(team_id as string);
    }

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
        installed: false,
      });
    }

    // Get workspace statistics
    const { findWorkspaceWithStats } = await import('../../models/workspace');
    const workspaceWithStats = await findWorkspaceWithStats(workspace.id);

    res.json({
      success: true,
      installed: true,
      workspace: {
        id: workspace.id,
        name: workspace.slackTeamName,
        teamId: workspace.slackTeamId,
        isActive: workspace.isActive,
        installedAt: workspace.installedAt,
        userCount: workspaceWithStats?._count?.users || 0,
        messageCount: workspaceWithStats?._count?.slackMessages || 0,
        recentUsers: workspaceWithStats?.users || [],
      },
    });

  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Error checking workspace status', error as Error, {
      query: req.query,
    });
    
    next(error);
  }
});

/**
 * GET /auth/slack/workspace/info
 * 
 * Get detailed information about a workspace for admin purposes.
 * Requires workspace authentication.
 */
router.get('/info/:workspaceId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workspaceId } = req.params;

    // TODO: Add workspace admin authentication middleware
    // For now, this is open but should be protected in production

    const { findWorkspaceWithStats } = await import('../../models/workspace');
    const workspace = await findWorkspaceWithStats(workspaceId);

    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Test workspace bot token by calling Slack API
    let botInfo = null;
    try {
      const slackClient = new WebClient(workspace.slackBotToken);
      const authTest = await slackClient.auth.test();
      botInfo = {
        botUserId: authTest.user_id,
        botUserName: authTest.user,
        teamId: authTest.team_id,
        teamName: authTest.team,
        isValid: authTest.ok,
      };
    } catch (tokenError) {
      Logger.warn(LogCategory.AUTH, 'Invalid or expired bot token detected', {
        workspaceId,
        error: tokenError instanceof Error ? tokenError.message : 'Unknown error',
      });
    }

    res.json({
      success: true,
      workspace: {
        id: workspace.id,
        name: workspace.slackTeamName,
        teamId: workspace.slackTeamId,
        isActive: workspace.isActive,
        installedAt: workspace.installedAt,
        updatedAt: workspace.updatedAt,
        userCount: workspace._count?.users || 0,
        messageCount: workspace._count?.slackMessages || 0,
        recentUsers: workspace.users || [],
        botInfo,
      },
    });

  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Error getting workspace info', error as Error, {
      workspaceId: req.params.workspaceId,
    });
    
    next(error);
  }
});

export default router;