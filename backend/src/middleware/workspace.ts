/**
 * Workspace authentication middleware
 * 
 * This module provides workspace-aware authentication middleware
 * for protecting API routes that require workspace context.
 */

import { Request, Response, NextFunction } from 'express';
import { findWorkspaceById } from '../models/workspace';
import { findUserById } from '../models/user';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { 
  validateWorkspaceContext, 
  validateSlackTeamId, 
  logWorkspaceValidation,
  WorkspaceValidationError 
} from '../utils/validation';

/**
 * Workspace context extraction middleware
 * Extracts workspace information from URL parameters and validates access
 */
export async function workspaceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId || req.workspaceId;
    
    if (!workspaceId) {
      logWorkspaceValidation('validation_failed', {
        reason: 'Missing workspace ID',
      });
      throw new AuthenticationError('Workspace ID required');
    }

    // Find and validate workspace
    const workspace = await findWorkspaceById(workspaceId);
    if (!workspace) {
      logWorkspaceValidation('access_denied', {
        workspaceId,
        reason: 'Workspace not found',
      });
      throw new AuthenticationError('Workspace not found');
    }

    if (!workspace.isActive) {
      logWorkspaceValidation('access_denied', {
        workspaceId,
        reason: 'Workspace inactive',
      });
      throw new AuthorizationError('Workspace is inactive');
    }

    // Validate workspace context using our validation utility
    const workspaceContext = {
      id: workspace.id,
      slackTeamId: workspace.slackTeamId,
      slackTeamName: workspace.slackTeamName,
    };
    
    validateWorkspaceContext(workspaceContext);

    // Attach workspace info to request
    req.workspace = {
      id: workspace.id,
      name: workspace.slackTeamName,
      slackTeamId: workspace.slackTeamId,
      slackTeamName: workspace.slackTeamName,
      isActive: workspace.isActive,
    };

    req.workspaceId = workspaceId;

    logWorkspaceValidation('access_granted', {
      workspaceId,
      resourceType: 'workspace_context',
    });

    next();
  } catch (error) {
    if (error instanceof WorkspaceValidationError) {
      logWorkspaceValidation('validation_failed', {
        workspaceId: error.workspaceId,
        reason: error.message,
      });
    }
    next(error);
  }
}

/**
 * Workspace user validation middleware
 * Ensures the authenticated user belongs to the workspace
 */
export async function workspaceUserMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      logWorkspaceValidation('access_denied', {
        workspaceId: req.workspaceId,
        reason: 'Missing user authentication',
      });
      throw new AuthenticationError('User authentication required');
    }

    if (!req.workspaceId) {
      logWorkspaceValidation('validation_failed', {
        userId: req.user.id,
        reason: 'Missing workspace context',
      });
      throw new AuthenticationError('Workspace context required');
    }

    // Verify user belongs to workspace
    const user = await findUserById(req.user.id);
    if (!user) {
      logWorkspaceValidation('access_denied', {
        userId: req.user.id,
        workspaceId: req.workspaceId,
        reason: 'User not found',
      });
      throw new AuthenticationError('User not found');
    }

    if ((user as any).workspaceId !== req.workspaceId) {
      logWorkspaceValidation('access_denied', {
        userId: req.user.id,
        workspaceId: req.workspaceId,
        reason: 'User does not belong to workspace',
      });
      throw new AuthorizationError('User does not belong to this workspace');
    }

    // Update user info with workspace context
    req.user = {
      ...req.user,
      workspaceId: (user as any).workspaceId,
    };

    logWorkspaceValidation('access_granted', {
      userId: req.user.id,
      workspaceId: req.workspaceId,
      resourceType: 'user_workspace_access',
    });

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Slack webhook workspace validation middleware
 * Extracts workspace context from Slack webhook payloads
 */
export async function slackWebhookWorkspaceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const payload = req.body;

    // Skip workspace validation for URL verification challenges
    if (payload?.type === 'url_verification') {
      next();
      return;
    }

    // Extract team ID from Slack payload
    const teamId = payload?.team_id || payload?.team?.id || payload?.event?.team;
    
    if (!teamId) {
      logWorkspaceValidation('validation_failed', {
        reason: 'Missing Slack team ID in webhook payload',
      });
      throw new AuthenticationError('Slack team ID not found in payload');
    }

    // Validate Slack team ID format
    try {
      validateSlackTeamId(teamId);
    } catch (error) {
      logWorkspaceValidation('validation_failed', {
        reason: `Invalid Slack team ID format: ${teamId}`,
      });
      throw error;
    }

    // Find workspace by Slack team ID
    const { findWorkspaceBySlackTeamId } = await import('../models/workspace');
    const workspace = await findWorkspaceBySlackTeamId(teamId);
    
    if (!workspace) {
      logWorkspaceValidation('access_denied', {
        reason: `Workspace not found for Slack team ${teamId}`,
      });
      throw new AuthenticationError('Workspace not found for Slack team');
    }

    if (!workspace.isActive) {
      logWorkspaceValidation('access_denied', {
        workspaceId: workspace.id,
        reason: 'Workspace inactive for Slack webhook',
      });
      throw new AuthorizationError('Workspace is inactive');
    }

    // Validate workspace context
    const workspaceContext = {
      id: workspace.id,
      slackTeamId: workspace.slackTeamId,
      slackTeamName: workspace.slackTeamName,
    };
    
    validateWorkspaceContext(workspaceContext);

    // Attach workspace info to request
    req.workspace = {
      id: workspace.id,
      name: workspace.slackTeamName,
      slackTeamId: workspace.slackTeamId,
      slackTeamName: workspace.slackTeamName,
      isActive: workspace.isActive,
    };

    req.workspaceId = workspace.id;

    logWorkspaceValidation('access_granted', {
      workspaceId: workspace.id,
      resourceType: 'slack_webhook',
    });

    next();
  } catch (error) {
    if (error instanceof WorkspaceValidationError) {
      logWorkspaceValidation('validation_failed', {
        workspaceId: error.workspaceId,
        reason: error.message,
      });
    }
    next(error);
  }
}

/**
 * Combined workspace and user authentication middleware
 * Use this for routes that need both workspace context and user authentication
 */
export async function workspaceAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // First get workspace context
    await workspaceMiddleware(req, res, () => {});
    
    // Then validate user belongs to workspace
    await workspaceUserMiddleware(req, res, () => {});
    
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Workspace admin authentication middleware
 * For routes that require workspace admin permissions
 */
export async function workspaceAdminMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.user) {
      throw new AuthenticationError('User authentication required');
    }

    if (!req.workspace) {
      throw new AuthenticationError('Workspace context required');
    }

    // TODO: Implement admin role checking
    // For now, we could check if user is the first user in workspace
    // or add an admin field to the User model
    
    // This is a placeholder - in a real implementation you'd check
    // if the user has admin permissions for this workspace
    const user = await findUserById(req.user.id);
    if (!user || (user as any).workspaceId !== req.workspaceId) {
      throw new AuthorizationError('Workspace admin access required');
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional workspace middleware (for routes that can work with or without workspace context)
 */
export async function optionalWorkspaceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const workspaceId = req.params.workspaceId || req.workspaceId;
    
    if (workspaceId) {
      await workspaceMiddleware(req, res, () => {});
    }
    
    next();
  } catch (error) {
    // Ignore workspace errors in optional middleware
    console.log('Optional workspace middleware failed:', error);
    next();
  }
}