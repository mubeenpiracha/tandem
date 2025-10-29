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
      throw new AuthenticationError('Workspace ID required');
    }

    // Find and validate workspace
    const workspace = await findWorkspaceById(workspaceId);
    if (!workspace) {
      throw new AuthenticationError('Workspace not found');
    }

    if (!workspace.isActive) {
      throw new AuthorizationError('Workspace is inactive');
    }

    // Attach workspace info to request
    req.workspace = {
      id: workspace.id,
      slackTeamId: workspace.slackTeamId,
      slackTeamName: workspace.slackTeamName,
      isActive: workspace.isActive,
    };

    req.workspaceId = workspaceId;

    next();
  } catch (error) {
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
      throw new AuthenticationError('User authentication required');
    }

    if (!req.workspaceId) {
      throw new AuthenticationError('Workspace context required');
    }

    // Verify user belongs to workspace
    const user = await findUserById(req.user.id);
    if (!user) {
      throw new AuthenticationError('User not found');
    }

    if ((user as any).workspaceId !== req.workspaceId) {
      throw new AuthorizationError('User does not belong to this workspace');
    }

    // Update user info with workspace context
    req.user = {
      ...req.user,
      workspaceId: (user as any).workspaceId,
    };

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
      throw new AuthenticationError('Slack team ID not found in payload');
    }

    // Find workspace by Slack team ID
    const { findWorkspaceBySlackTeamId } = await import('../models/workspace');
    const workspace = await findWorkspaceBySlackTeamId(teamId);
    
    if (!workspace) {
      throw new AuthenticationError('Workspace not found for Slack team');
    }

    if (!workspace.isActive) {
      throw new AuthorizationError('Workspace is inactive');
    }

    // Attach workspace info to request
    req.workspace = {
      id: workspace.id,
      slackTeamId: workspace.slackTeamId,
      slackTeamName: workspace.slackTeamName,
      isActive: workspace.isActive,
    };

    req.workspaceId = workspace.id;

    next();
  } catch (error) {
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