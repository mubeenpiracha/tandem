/**
 * Workspace management routes
 * 
 * This module provides API endpoints for workspace management,
 * installation, and configuration.
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import { workspaceMiddleware, workspaceAdminMiddleware } from '../middleware/workspace';
import { 
  generateWorkspaceInstallUrl,
  validateWorkspaceInstallState,
  exchangeWorkspaceCode,
  completeWorkspaceInstallation,
  testWorkspaceBotToken
} from '../services/oauth/workspace';
import { 
  findWorkspaceById,
  getActiveWorkspaces,
  updateWorkspace,
  getWorkspaceCount
} from '../models/workspace';

const router = Router();

/**
 * GET /workspace/install
 * Generate Slack app installation URL for workspace
 */
router.get('/install', (req, res) => {
  try {
    const redirectTo = req.query.redirect_to as string;
    const installUrl = generateWorkspaceInstallUrl(redirectTo);
    
    res.json({
      success: true,
      installUrl,
      message: 'Click the URL to install Tandem in your Slack workspace',
    });
  } catch (error) {
    console.error('Failed to generate install URL:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate installation URL',
    });
  }
});

/**
 * GET /workspace/callback
 * Handle Slack app installation callback
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    if (error) {
      console.error('Slack installation error:', error);
      return res.status(400).json({
        success: false,
        error: 'Installation was cancelled or failed',
        details: error,
      });
    }

    if (!code || !state) {
      return res.status(400).json({
        success: false,
        error: 'Missing authorization code or state',
      });
    }

    // Validate state parameter
    const stateData = validateWorkspaceInstallState(state as string);
    if (!stateData) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired state parameter',
      });
    }

    // Exchange code for tokens
    const oauthResponse = await exchangeWorkspaceCode(code as string);
    
    // Complete workspace installation
    const workspaceId = await completeWorkspaceInstallation(oauthResponse);
    
    // Redirect to success page or specified redirect URL
    const redirectUrl = stateData.redirectTo || '/workspace/success';
    res.redirect(`${redirectUrl}?workspace=${workspaceId}&team=${oauthResponse.team.name}`);
    
  } catch (error) {
    console.error('Workspace installation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete workspace installation',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /workspace/success
 * Installation success page
 */
router.get('/success', (req, res) => {
  const { workspace, team } = req.query;
  
  res.json({
    success: true,
    message: `🎉 Tandem has been successfully installed in ${team}!`,
    workspaceId: workspace,
    nextSteps: [
      'Users can now authenticate with Slack and Google Calendar',
      'Start a conversation in any channel to detect tasks',
      'Configure work preferences for smart scheduling',
    ],
    links: {
      userAuth: `/auth/slack?workspace=${workspace}`,
      dashboard: `/dashboard?workspace=${workspace}`,
    },
  });
});

/**
 * GET /workspace/:workspaceId
 * Get workspace information
 */
router.get('/:workspaceId', workspaceMiddleware, async (req, res) => {
  try {
    const workspace = await findWorkspaceById(req.workspaceId!);
    
    if (!workspace) {
      return res.status(404).json({
        success: false,
        error: 'Workspace not found',
      });
    }

    // Don't expose sensitive information like bot tokens
    const safeWorkspace = {
      id: workspace.id,
      slackTeamId: workspace.slackTeamId,
      slackTeamName: workspace.slackTeamName,
      isActive: workspace.isActive,
      installedAt: workspace.installedAt,
      updatedAt: workspace.updatedAt,
    };

    res.json({
      success: true,
      workspace: safeWorkspace,
    });
  } catch (error) {
    console.error('Failed to get workspace:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workspace information',
    });
  }
});

/**
 * PUT /workspace/:workspaceId
 * Update workspace settings (admin only)
 */
router.put('/:workspaceId', 
  authMiddleware,
  workspaceMiddleware,
  workspaceAdminMiddleware,
  async (req, res) => {
    try {
      const { slackTeamName, isActive } = req.body;
      
      const updatedWorkspace = await updateWorkspace(req.workspaceId!, {
        slackTeamName,
        isActive,
      });

      const safeWorkspace = {
        id: updatedWorkspace.id,
        slackTeamId: updatedWorkspace.slackTeamId,
        slackTeamName: updatedWorkspace.slackTeamName,
        isActive: updatedWorkspace.isActive,
        installedAt: updatedWorkspace.installedAt,
        updatedAt: updatedWorkspace.updatedAt,
      };

      res.json({
        success: true,
        workspace: safeWorkspace,
        message: 'Workspace updated successfully',
      });
    } catch (error) {
      console.error('Failed to update workspace:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update workspace',
      });
    }
  }
);

/**
 * POST /workspace/:workspaceId/test
 * Test workspace bot token connectivity
 */
router.post('/:workspaceId/test',
  authMiddleware,
  workspaceMiddleware,
  workspaceAdminMiddleware,
  async (req, res) => {
    try {
      const workspace = await findWorkspaceById(req.workspaceId!);
      if (!workspace) {
        return res.status(404).json({
          success: false,
          error: 'Workspace not found',
        });
      }

      const isValid = await testWorkspaceBotToken(workspace.slackTeamId);
      
      res.json({
        success: true,
        tokenValid: isValid,
        message: isValid 
          ? 'Bot token is valid and working'
          : 'Bot token is invalid, reinstallation may be required',
      });
    } catch (error) {
      console.error('Failed to test workspace token:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to test workspace connectivity',
      });
    }
  }
);

/**
 * GET /workspace
 * List all active workspaces (admin only - for monitoring)
 */
router.get('/', async (req, res) => {
  try {
    // This endpoint could be used for monitoring/admin purposes
    const workspaces = await getActiveWorkspaces();
    const count = await getWorkspaceCount();
    
    // Don't expose sensitive information
    const safeWorkspaces = workspaces.map(workspace => ({
      id: workspace.id,
      slackTeamId: workspace.slackTeamId,
      slackTeamName: workspace.slackTeamName,
      isActive: workspace.isActive,
      installedAt: workspace.installedAt,
    }));

    res.json({
      success: true,
      workspaces: safeWorkspaces,
      total: count,
    });
  } catch (error) {
    console.error('Failed to list workspaces:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve workspaces',
    });
  }
});

export default router;