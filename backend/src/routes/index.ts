/**
 * Route setup and configuration
 * 
 * This module sets up all API routes and their middleware for the application.
 */

import { Express, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { slackWebhookWorkspaceMiddleware } from '../middleware/workspace';
import taskRoutes from './tasks';
import workspaceRoutes from './workspace';
import { 
  handleSlackEvents, 
  parseSlackWebhook, 
  slackHealthCheck 
} from './slack/events';
import { 
  handleSlackInteractions, 
  parseSlackInteraction, 
  slackInteractionsHealthCheck 
} from './slack/interactions';

// Auth routes
import { 
  initiateSlackOAuth, 
  handleSlackOAuthCallback, 
  revokeSlackAuth,
  getSlackAuthStatus 
} from './auth/slack';
import { 
  initiateGoogleOAuth, 
  handleGoogleOAuthCallback, 
  revokeGoogleAuth,
  getGoogleAuthStatus 
} from './auth/google';
import {
  getOnboardingStatus,
  completeOnboarding,
  resetOnboarding,
  getUserOnboardingProgress
} from './auth/onboarding';
import {
  getAuthStatus,
  getSlackStatus,
  getGoogleStatus,
  refreshTokens,
  testConnections,
  getUserProfile,
  updateUserProfile
} from './auth/status';

import { Logger } from '../utils/logger';

/**
 * Setup all application routes
 */
export function setupRoutes(app: Express): void {
  // API base path
  const API_PREFIX = '/api';

  // Slack webhook routes (public, with signature verification)
  app.post('/webhooks/slack/events', parseSlackWebhook, slackWebhookWorkspaceMiddleware, handleSlackEvents);
  app.post('/webhooks/slack/interactions', parseSlackInteraction, slackWebhookWorkspaceMiddleware, handleSlackInteractions);
  app.get('/webhooks/slack/health', slackHealthCheck);
  app.get('/webhooks/slack/interactions/health', slackInteractionsHealthCheck);
  
  // Authentication routes (public)
  app.get(`${API_PREFIX}/auth/slack`, initiateSlackOAuth);
  app.get(`${API_PREFIX}/auth/slack/callback`, handleSlackOAuthCallback);
  app.post(`${API_PREFIX}/auth/slack/revoke`, authMiddleware, revokeSlackAuth);
  app.get(`${API_PREFIX}/auth/slack/status`, authMiddleware, getSlackAuthStatus);
  
  app.get(`${API_PREFIX}/auth/google`, authMiddleware, initiateGoogleOAuth);
  app.get(`${API_PREFIX}/auth/google/callback`, handleGoogleOAuthCallback);
  app.post(`${API_PREFIX}/auth/google/revoke`, authMiddleware, revokeGoogleAuth);
  app.get(`${API_PREFIX}/auth/google/status`, authMiddleware, getGoogleAuthStatus);
  
  // Onboarding routes
  app.get(`${API_PREFIX}/auth/onboarding`, getOnboardingStatus);
  app.post(`${API_PREFIX}/auth/onboarding/complete`, authMiddleware, completeOnboarding);
  app.post(`${API_PREFIX}/auth/onboarding/reset`, authMiddleware, resetOnboarding);
  app.get(`${API_PREFIX}/auth/onboarding/:userId`, getUserOnboardingProgress); // Admin only
  
  // Status and profile routes
  app.get(`${API_PREFIX}/auth/status`, authMiddleware, getAuthStatus);
  app.get(`${API_PREFIX}/auth/services/slack`, authMiddleware, getSlackStatus);
  app.get(`${API_PREFIX}/auth/services/google`, authMiddleware, getGoogleStatus);
  app.post(`${API_PREFIX}/auth/refresh/:provider`, authMiddleware, refreshTokens);
  app.get(`${API_PREFIX}/auth/test`, authMiddleware, testConnections);
  app.get(`${API_PREFIX}/auth/profile`, authMiddleware, getUserProfile);
  app.put(`${API_PREFIX}/auth/profile`, authMiddleware, updateUserProfile);
  
  // Task management routes
  app.use(`${API_PREFIX}/tasks`, taskRoutes);
  
  // Workspace management routes  
  app.use(`${API_PREFIX}/workspace`, workspaceRoutes);
  
  // User preferences routes - TODO: Implement when T057 is reached  
  app.get(`${API_PREFIX}/preferences`, authMiddleware, (req: Request, res: Response) => {
    res.status(501).json({ error: 'Preferences not yet implemented' });
  });
  
  // Placeholder API info endpoint
  app.get(`${API_PREFIX}`, (req, res) => {
    res.json({
      name: 'Tandem Slack Bot API',
      version: '1.0.0',
      description: 'AI-powered task detection and calendar scheduling',
      endpoints: {
        health: '/health',
        api: API_PREFIX,
        tasks: `${API_PREFIX}/tasks`,
        slack: {
          events: '/webhooks/slack/events',
          interactions: '/webhooks/slack/interactions',
          health: '/webhooks/slack/health',
        },
        auth: {
          slack: `${API_PREFIX}/auth/slack`,
          google: `${API_PREFIX}/auth/google`,
          status: `${API_PREFIX}/auth/status`,
          onboarding: `${API_PREFIX}/auth/onboarding`,
          profile: `${API_PREFIX}/auth/profile`,
        },
        workspace: {
          install: `${API_PREFIX}/workspace/install`,
          callback: `${API_PREFIX}/workspace/callback`,
          management: `${API_PREFIX}/workspace/:workspaceId`,
        },
        preferences: `${API_PREFIX}/preferences`,
      },
      documentation: 'See /specs/001-tandem-slack-bot/contracts/api.yaml',
    });
  });

  // 404 handler for unmatched API routes
  app.use(`${API_PREFIX}/*`, (req: Request, res: Response) => {
    res.status(404).json({
      error: 'Endpoint not found',
      path: req.path,
      method: req.method,
    });
  });

  Logger.system.startup();
  console.log('✅ Routes configured - User Story 3 (Authentication) implementation complete');
}