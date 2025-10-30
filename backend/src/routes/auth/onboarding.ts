/**
 * User onboarding flow routes with workspace context
 * 
 * This module handles the complete user onboarding process within workspace context,
 * including account setup and service connections.
 */

import express, { Request, Response, NextFunction } from 'express';
import { findUserById, createUser } from '../../models/user';
import { findWorkspaceById } from '../../models/workspace';
import { getUserAuthStatus } from '../../services/oauth/token_manager';
import { authMiddleware, optionalAuthMiddleware, requireWorkspaceAuth } from '../../middleware/auth';
import { config } from '../../config';
import { Logger } from '../../utils/logger';
import { validate } from '../../utils/validation';
import { z } from 'zod';

// Validation schemas
const onboardingQuerySchema = z.object({
  workspace: z.string().uuid().optional(),
});

// Enhanced onboarding status interface with workspace context
export interface OnboardingStatus {
  isComplete: boolean;
  currentStep: 'workspace_setup' | 'slack_auth' | 'google_auth' | 'completed';
  completedSteps: string[];
  nextStep: {
    name: string;
    url: string;
    description: string;
  } | null;
  user?: {
    id: string;
    email: string;
    slackUserId: string;
    workspace: {
      id: string;
      name: string;
      teamId: string;
    };
  };
  workspace?: {
    id: string;
    name: string;
    teamId: string;
    userCount: number;
  };
  authStatus?: {
    slack: { connected: boolean; isValid: boolean };
    google: { connected: boolean; isValid: boolean };
  };
}

/**
 * Get user onboarding status with workspace context
 */
export async function getOnboardingStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const queryValidation = validate(onboardingQuerySchema, req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid query parameters',
        details: queryValidation.errors,
      });
    }

    const { workspace: workspaceId } = queryValidation.data || {};

    // Use optional auth to handle both authenticated and unauthenticated users
    await optionalAuthMiddleware(req, res, () => {});

    if (!req.user) {
      // User not authenticated - first they need to be part of a workspace
      const status: OnboardingStatus = {
        isComplete: false,
        currentStep: 'workspace_setup',
        completedSteps: [],
        nextStep: {
          name: 'Join Slack Workspace',
          url: '/auth/slack/workspace/install', // App installation first
          description: 'The Tandem app needs to be installed in your Slack workspace first',
        },
      };

      return res.json({
        success: true,
        onboarding: status,
      });
    }

    // Get user's workspace context
    const user = await findUserById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
      });
    }

    const workspace = await findWorkspaceById(user.workspaceId);
    if (!workspace) {
      return res.status(400).json({
        success: false,
        error: 'User workspace not found',
        message: 'Please contact your workspace admin to reinstall the Tandem app',
      });
    }

    const workspaceContext = {
      id: workspace.id,
      slackTeamName: workspace.slackTeamName,
    };

    // User is authenticated - check their service connections
    const authStatus = await getUserAuthStatus(req.user.id);
    const completedSteps = ['workspace_setup']; // Workspace exists if user exists

    if (authStatus.slack.connected && authStatus.slack.isValid) {
      completedSteps.push('slack_auth');
    }

    if (authStatus.google.connected && authStatus.google.isValid) {
      completedSteps.push('google_auth');
    }

    // Determine current step and next action
    let currentStep: OnboardingStatus['currentStep'] = 'completed';
    let nextStep: OnboardingStatus['nextStep'] = null;

    if (!authStatus.slack.isValid) {
      currentStep = 'slack_auth';
      nextStep = {
        name: 'Connect Slack',
        url: `/auth/slack/login?workspace=${workspace.id}`,
        description: 'Connect your Slack account to detect tasks from conversations',
      };
    } else if (!authStatus.google.isValid) {
      currentStep = 'google_auth';
      nextStep = {
        name: 'Connect Google Calendar',
        url: `/auth/google/login?workspace=${workspace.id}`,
        description: 'Connect your Google Calendar to automatically schedule tasks',
      };
    }

    const isComplete = authStatus.slack.isValid && authStatus.google.isValid;

    // Get workspace user count
    const { getUserCountByWorkspace } = await import('../../models/user');
    const userCount = await getUserCountByWorkspace(workspace.id);

    const status: OnboardingStatus = {
      isComplete,
      currentStep,
      completedSteps,
      nextStep,
      user: {
        id: req.user.id,
        email: req.user.email,
        slackUserId: req.user.slackUserId,
        workspace: {
          id: workspace.id,
          name: workspace.slackTeamName,
          teamId: workspace.slackTeamId,
        },
      },
      workspace: {
        id: workspace.id,
        name: workspace.slackTeamName,
        teamId: workspace.slackTeamId,
        userCount,
      },
      authStatus: {
        slack: {
          connected: authStatus.slack.connected,
          isValid: authStatus.slack.isValid,
        },
        google: {
          connected: authStatus.google.connected,
          isValid: authStatus.google.isValid,
        },
      },
    };

    res.json({
      success: true,
      onboarding: status,
    });

  } catch (error) {
    console.error('Failed to get onboarding status:', error);
    next(error);
  }
}

/**
 * Complete onboarding setup within workspace context
 */
export async function completeOnboarding(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user || !req.workspace) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication and workspace context required' 
      });
    }

    const workspaceContext = {
      id: req.workspace.id,
      slackTeamName: req.workspace.slackTeamName,
    };

    // Verify that all required connections are in place
    const authStatus = await getUserAuthStatus(req.user.id);
    
    if (!authStatus.slack.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Incomplete onboarding',
        message: 'Slack connection required',
        missingStep: 'slack_auth',
        nextAction: {
          name: 'Connect Slack',
          url: `/auth/slack/login?workspace=${req.workspace.id}`,
        },
      });
    }

    if (!authStatus.google.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Incomplete onboarding',
        message: 'Google Calendar connection required',
        missingStep: 'google_auth',
        nextAction: {
          name: 'Connect Google Calendar',
          url: `/auth/google/login?workspace=${req.workspace.id}`,
        },
      });
    }

    // Send welcome message via Slack DM
    try {
      const { sendWelcomeMessage } = await import('../../services/slack/dmSender');
      await sendWelcomeMessage(req.user.id, req.user.slackUserId);
    } catch (error) {
      console.error('Failed to send welcome message:', error);
      // Don't fail onboarding if welcome message fails
    }

    // Initialize default work preferences
    try {
      const { initializeUserPreferences } = await import('../../services/preferences/preferences_manager');
      const user = await findUserById(req.user.id);
      const userTimezone = user?.timezone || 'UTC';
      await initializeUserPreferences(req.user.id, req.workspace.id, userTimezone);
      Logger.auth.userUpdated(req.user.id, 'preferences_initialized', workspaceContext);
    } catch (error) {
      console.error('Failed to initialize user preferences:', error);
      // Don't fail onboarding if preferences initialization fails
    }

    Logger.auth.userUpdated(req.user.id, 'onboarding_completed', workspaceContext);

    res.json({
      success: true,
      message: 'Onboarding completed successfully!',
      user: {
        id: req.user.id,
        email: req.user.email,
        slackUserId: req.user.slackUserId,
        workspace: {
          id: req.workspace.id,
          name: req.workspace.name,
          teamId: req.workspace.slackTeamId,
        },
      },
      nextSteps: [
        'Start having conversations in Slack channels where you\'re mentioned',
        'I\'ll automatically detect tasks and send you confirmation messages',
        'Confirmed tasks will be scheduled in your Google Calendar',
        'Use the dashboard to manage your tasks and preferences',
      ],
    });

  } catch (error) {
    console.error('Failed to complete onboarding:', error);
    next(error);
  }
}

/**
 * Reset onboarding for testing or troubleshooting (development only)
 */
export async function resetOnboarding(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user || !req.workspace) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication and workspace context required' 
      });
    }

    // Only allow in development environment
    if (config.isProduction) {
      return res.status(403).json({ 
        success: false,
        error: 'Operation not allowed in production',
        message: 'Onboarding reset is only available in development mode',
      });
    }

    const workspaceContext = {
      id: req.workspace.id,
      slackTeamName: req.workspace.slackTeamName,
    };

    // Remove OAuth tokens
    try {
      const { deleteSlackToken } = await import('../../models/slackToken');
      await deleteSlackToken(req.user.id);
    } catch (error) {
      // Token might not exist, that's ok
    }

    try {
      const { deleteGoogleToken } = await import('../../models/googleToken');
      await deleteGoogleToken(req.user.id);
    } catch (error) {
      // Token might not exist, that's ok
    }

    Logger.auth.userUpdated(req.user.id, 'onboarding_reset', workspaceContext);

    res.json({
      success: true,
      message: 'Onboarding reset successfully',
      nextStep: {
        name: 'Connect Slack',
        url: `/auth/slack/login?workspace=${req.workspace.id}`,
        description: 'Start the onboarding process again',
      },
    });

  } catch (error) {
    console.error('Failed to reset onboarding:', error);
    next(error);
  }
}

/**
 * Get onboarding progress for a specific user (admin only)
 */
export async function getUserOnboardingProgress(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'User ID required' 
      });
    }

    if (!req.user || !req.workspace) {
      return res.status(401).json({ 
        success: false,
        error: 'Authentication and workspace context required' 
      });
    }

    // TODO: Add admin check - for now, users can only see their own progress
    if (req.user.id !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'You can only view your own onboarding progress',
      });
    }

    // Find the user and ensure they're in the same workspace
    const user = await findUserById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    if (user.workspaceId !== req.workspace.id) {
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'User belongs to a different workspace',
      });
    }

    // Get their auth status
    const authStatus = await getUserAuthStatus(userId);

    const progress = {
      user: {
        id: user.id,
        email: user.email,
        slackUserId: user.slackUserId,
        createdAt: user.createdAt,
        status: user.status,
        workspace: {
          id: req.workspace.id,
          name: req.workspace.name,
          teamId: req.workspace.slackTeamId,
        },
      },
      onboarding: {
        slackConnected: authStatus.slack.connected,
        slackValid: authStatus.slack.isValid,
        googleConnected: authStatus.google.connected,
        googleValid: authStatus.google.isValid,
        isComplete: authStatus.slack.isValid && authStatus.google.isValid,
      },
      lastUpdated: {
        slack: authStatus.slack.lastUpdated,
        google: authStatus.google.lastUpdated,
      },
    };

    res.json({
      success: true,
      progress,
    });

  } catch (error) {
    console.error('Failed to get user onboarding progress:', error);
    next(error);
  }
}

/**
 * Handle initial user creation from Slack mentions
 */
export async function handleSlackMention(slackUserId: string, workspaceId: string, slackUserEmail?: string): Promise<{
  isNewUser: boolean;
  userId: string;
  needsOnboarding: boolean;
}> {
  try {
    // Check if user already exists
    const { findUserBySlackId } = await import('../../models/user');
    let user = await findUserBySlackId(slackUserId, workspaceId);

    if (user) {
      // Existing user - check if they need to complete onboarding
      const authStatus = await getUserAuthStatus(user.id);
      const needsOnboarding = !authStatus.slack.isValid || !authStatus.google.isValid;

      return {
        isNewUser: false,
        userId: user.id,
        needsOnboarding,
      };
    }

    // New user - create account
    if (!slackUserEmail) {
      throw new Error('Email is required for new user creation');
    }

    user = await createUser({
      workspaceId,
      email: slackUserEmail,
      slackUserId,
      timezone: 'UTC', // Will be updated during onboarding
    });

    Logger.auth.userCreated(user.id, 'slack_mention', slackUserEmail);

    return {
      isNewUser: true,
      userId: user.id,
      needsOnboarding: true,
    };

  } catch (error) {
    console.error('Failed to handle Slack mention:', error);
    throw error;
  }
}