/**
 * User onboarding flow routes
 * 
 * This module handles the complete user onboarding process,
 * including account setup and service connections.
 */

import { Request, Response } from 'express';
import { findUserById, createUser } from '../../models/user';
import { getUserAuthStatus } from '../../services/oauth/token_manager';
import { authMiddleware, optionalAuthMiddleware } from '../../middleware/auth';
import { config } from '../../config';
import { Logger } from '../../utils/logger';

// Onboarding status interface
export interface OnboardingStatus {
  isComplete: boolean;
  currentStep: 'registration' | 'slack_auth' | 'google_auth' | 'completed';
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
  };
  authStatus?: {
    slack: { connected: boolean; isValid: boolean };
    google: { connected: boolean; isValid: boolean };
  };
}

/**
 * Get user onboarding status
 */
export async function getOnboardingStatus(req: Request, res: Response): Promise<void> {
  try {
    // Use optional auth to handle both authenticated and unauthenticated users
    await optionalAuthMiddleware(req, res, () => {});

    if (!req.user) {
      // User not authenticated - start with registration
      const status: OnboardingStatus = {
        isComplete: false,
        currentStep: 'registration',
        completedSteps: [],
        nextStep: {
          name: 'Sign Up with Slack',
          url: '/api/auth/slack',
          description: 'Connect your Slack account to get started',
        },
      };

      res.json(status);
      return;
    }

    // User is authenticated - check their service connections
    const authStatus = await getUserAuthStatus(req.user.id);
    const completedSteps = ['registration'];

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
        url: '/api/auth/slack',
        description: 'Connect your Slack account to detect tasks from conversations',
      };
    } else if (!authStatus.google.isValid) {
      currentStep = 'google_auth';
      nextStep = {
        name: 'Connect Google Calendar',
        url: '/api/auth/google',
        description: 'Connect your Google Calendar to automatically schedule tasks',
      };
    }

    const isComplete = authStatus.slack.isValid && authStatus.google.isValid;

    const status: OnboardingStatus = {
      isComplete,
      currentStep,
      completedSteps,
      nextStep,
      user: {
        id: req.user.id,
        email: req.user.email,
        slackUserId: req.user.slackUserId,
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

    res.json(status);

  } catch (error) {
    console.error('Failed to get onboarding status:', error);
    res.status(500).json({
      error: 'Failed to get onboarding status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Complete onboarding setup
 */
export async function completeOnboarding(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Verify that all required connections are in place
    const authStatus = await getUserAuthStatus(req.user.id);
    
    if (!authStatus.slack.isValid) {
      res.status(400).json({
        error: 'Incomplete onboarding',
        message: 'Slack connection required',
        missingStep: 'slack_auth',
      });
      return;
    }

    if (!authStatus.google.isValid) {
      res.status(400).json({
        error: 'Incomplete onboarding',
        message: 'Google Calendar connection required',
        missingStep: 'google_auth',
      });
      return;
    }

    // Send welcome message via Slack DM
    try {
      const { sendWelcomeMessage } = await import('../../services/slack/dmSender');
      await sendWelcomeMessage(req.user.id, req.user.slackUserId);
    } catch (error) {
      console.error('Failed to send welcome message:', error);
      // Don't fail onboarding if welcome message fails
    }

    Logger.auth.userUpdated(req.user.id, 'onboarding_completed');

    res.json({
      success: true,
      message: 'Onboarding completed successfully!',
      user: {
        id: req.user.id,
        email: req.user.email,
        slackUserId: req.user.slackUserId,
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
    res.status(500).json({
      error: 'Failed to complete onboarding',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Reset onboarding for testing or troubleshooting
 */
export async function resetOnboarding(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    // Only allow in development environment
    if (config.isProduction) {
      res.status(403).json({ 
        error: 'Operation not allowed in production',
        message: 'Onboarding reset is only available in development mode',
      });
      return;
    }

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

    Logger.auth.userUpdated(req.user.id, 'onboarding_reset');

    res.json({
      success: true,
      message: 'Onboarding reset successfully',
      nextStep: {
        name: 'Connect Slack',
        url: '/api/auth/slack',
        description: 'Start the onboarding process again',
      },
    });

  } catch (error) {
    console.error('Failed to reset onboarding:', error);
    res.status(500).json({
      error: 'Failed to reset onboarding',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get onboarding progress for a specific user (admin only)
 */
export async function getUserOnboardingProgress(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({ error: 'User ID required' });
      return;
    }

    // Find the user
    const user = await findUserById(userId);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
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

    res.json(progress);

  } catch (error) {
    console.error('Failed to get user onboarding progress:', error);
    res.status(500).json({
      error: 'Failed to get user onboarding progress',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
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