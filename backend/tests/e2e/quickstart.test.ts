/**
 * End-to-End Quickstart Validation Tests
 * 
 * This test suite validates that the quickstart guide works correctly
 * across multiple workspaces and scenarios.
 */

import request from 'supertest';
import app from '../../src/app';
import { PrismaClient } from '@prisma/client';
import { createTestWorkspace, createTestUser, cleanupTestData } from '../helpers/test-utils';

const prisma = new PrismaClient();

describe('Quickstart Validation - Multi-Workspace', () => {
  // Test data
  let workspace1: any, workspace2: any;
  let user1: any, user2: any, user3: any;
  let workspace1Token: string, workspace2Token: string;

  beforeAll(async () => {
    // Clean up any existing test data
    await cleanupTestData();

    // Create test workspaces
    workspace1 = await createTestWorkspace('test-workspace-1', 'Test Workspace 1');
    workspace2 = await createTestWorkspace('test-workspace-2', 'Test Workspace 2');

    // Create test users in different workspaces
    user1 = await createTestUser('user1@example.com', 'slack-user-1', workspace1.id);
    user2 = await createTestUser('user2@example.com', 'slack-user-2', workspace1.id);
    user3 = await createTestUser('user3@example.com', 'slack-user-3', workspace2.id);

    // Generate test tokens (simplified for testing)
    workspace1Token = `test-token-${workspace1.id}`;
    workspace2Token = `test-token-${workspace2.id}`;
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  describe('Health Check Endpoints', () => {
    test('should return healthy status for main health endpoint', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        services: {
          database: 'healthy',
          redis: expect.any(String),
        },
      });
      expect(response.body.timestamp).toBeDefined();
    });

    test('should return workspace-specific health status', async () => {
      const response = await request(app)
        .get(`/api/health/workspace/${workspace1.id}`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        workspaceId: workspace1.id,
        services: expect.any(Object),
      });
    });
  });

  describe('Multi-Workspace Authentication Flow', () => {
    test('should handle workspace installation for workspace 1', async () => {
      const installData = {
        slackTeamId: workspace1.slackTeamId,
        slackTeamName: workspace1.slackTeamName,
        slackBotToken: 'xoxb-test-bot-token-1',
      };

      const response = await request(app)
        .post('/api/auth/workspace/install')
        .send(installData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        workspace: {
          id: workspace1.id,
          slackTeamId: workspace1.slackTeamId,
          isActive: true,
        },
      });
    });

    test('should handle workspace installation for workspace 2', async () => {
      const installData = {
        slackTeamId: workspace2.slackTeamId,
        slackTeamName: workspace2.slackTeamName,
        slackBotToken: 'xoxb-test-bot-token-2',
      };

      const response = await request(app)
        .post('/api/auth/workspace/install')
        .send(installData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        workspace: {
          id: workspace2.id,
          slackTeamId: workspace2.slackTeamId,
          isActive: true,
        },
      });
    });

    test('should handle user authentication within workspace context', async () => {
      const authData = {
        email: user1.email,
        slackUserId: user1.slackUserId,
        workspaceId: workspace1.id,
      };

      const response = await request(app)
        .post('/api/auth/slack')
        .send(authData)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        user: {
          id: user1.id,
          email: user1.email,
          workspaceId: workspace1.id,
        },
      });
    });
  });

  describe('Slack Integration - Multi-Workspace', () => {
    test('should handle Slack events for workspace 1', async () => {
      const slackEvent = {
        token: 'verification-token',
        team_id: workspace1.slackTeamId,
        event: {
          type: 'message',
          user: user1.slackUserId,
          text: 'Can you schedule a meeting for tomorrow at 2 PM?',
          channel: 'C1234567890',
          ts: '1635724800.001',
        },
        type: 'event_callback',
      };

      const response = await request(app)
        .post('/api/webhooks/slack/events')
        .send(slackEvent)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
      });
    });

    test('should handle Slack events for workspace 2', async () => {
      const slackEvent = {
        token: 'verification-token',
        team_id: workspace2.slackTeamId,
        event: {
          type: 'message',
          user: user3.slackUserId,
          text: 'Please remind me to call the client at 3 PM',
          channel: 'C0987654321',
          ts: '1635724900.001',
        },
        type: 'event_callback',
      };

      const response = await request(app)
        .post('/api/webhooks/slack/events')
        .send(slackEvent)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
      });
    });

    test('should isolate tasks between workspaces', async () => {
      // Get tasks for workspace 1
      const workspace1Tasks = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .expect(200);

      // Get tasks for workspace 2
      const workspace2Tasks = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${workspace2Token}`)
        .set('X-Workspace-ID', workspace2.id)
        .expect(200);

      // Verify workspace isolation
      expect(workspace1Tasks.body.tasks).toBeDefined();
      expect(workspace2Tasks.body.tasks).toBeDefined();
      
      // Tasks should belong to correct workspaces
      workspace1Tasks.body.tasks.forEach((task: any) => {
        expect(task.user.workspaceId).toBe(workspace1.id);
      });

      workspace2Tasks.body.tasks.forEach((task: any) => {
        expect(task.user.workspaceId).toBe(workspace2.id);
      });
    });
  });

  describe('Task Detection and AI Integration', () => {
    test('should detect tasks from messages in workspace 1', async () => {
      const messageText = 'We need to review the quarterly reports by Friday';
      
      const response = await request(app)
        .post('/api/ai/detect-tasks')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .send({
          messageText,
          channelContext: 'business-planning',
          userContext: 'project-manager',
        })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        result: {
          isTask: expect.any(Boolean),
          confidence: expect.any(Number),
          tasks: expect.any(Array),
        },
      });

      if (response.body.result.isTask) {
        expect(response.body.result.tasks.length).toBeGreaterThan(0);
        expect(response.body.result.tasks[0]).toMatchObject({
          title: expect.any(String),
          estimatedDuration: expect.any(Number),
          importance: expect.stringMatching(/^(LOW|MEDIUM|HIGH)$/),
          confidence: expect.any(Number),
        });
      }
    });

    test('should track AI performance metrics per workspace', async () => {
      const response = await request(app)
        .get('/api/monitoring/ai-stats')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .expect(200);

      expect(response.body).toMatchObject({
        performance: {
          totalRequests: expect.any(Number),
          cacheHitRate: expect.any(String),
          averageResponseTime: expect.any(String),
          errorRate: expect.any(String),
        },
        workspaceDistribution: expect.any(Array),
        caching: {
          enabled: expect.any(Boolean),
          status: expect.any(String),
        },
      });
    });
  });

  describe('Google Calendar Integration', () => {
    test('should handle Google OAuth for workspace users', async () => {
      // Mock Google OAuth callback
      const authCode = 'mock-auth-code';
      const state = `${workspace1.id}:${user1.id}`;

      const response = await request(app)
        .get('/api/auth/google/callback')
        .query({
          code: authCode,
          state: state,
        })
        .expect(302); // Redirect expected

      // Verify redirect URL contains success indicator
      expect(response.headers.location).toContain('/dashboard');
    });

    test('should create calendar events for confirmed tasks', async () => {
      // Create a test task
      const taskData = {
        title: 'Complete project proposal',
        description: 'Draft and finalize the Q1 project proposal',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
        estimatedDuration: 120, // 2 hours
        importance: 'HIGH',
      };

      const taskResponse = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .send(taskData)
        .expect(201);

      const taskId = taskResponse.body.task.id;

      // Confirm the task (triggers calendar scheduling)
      const confirmResponse = await request(app)
        .patch(`/api/tasks/${taskId}/confirm`)
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .expect(200);

      expect(confirmResponse.body).toMatchObject({
        success: true,
        task: {
          id: taskId,
          status: 'CONFIRMED',
        },
      });
    });
  });

  describe('Work Preferences - Multi-Workspace', () => {
    test('should create preferences for user in workspace 1', async () => {
      const preferencesData = {
        weeklyHours: {
          monday: { start: '09:00', end: '17:00' },
          tuesday: { start: '09:00', end: '17:00' },
          wednesday: { start: '09:00', end: '17:00' },
          thursday: { start: '09:00', end: '17:00' },
          friday: { start: '09:00', end: '17:00' },
          saturday: null,
          sunday: null,
        },
        breakTimes: {
          lunch: { start: '12:00', end: '13:00' },
        },
        timezone: 'America/New_York',
      };

      const response = await request(app)
        .post('/api/preferences')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .send(preferencesData)
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        preferences: {
          weeklyHours: preferencesData.weeklyHours,
          breakTimes: preferencesData.breakTimes,
          timezone: preferencesData.timezone,
          hasCustomPreferences: true,
          workspaceId: workspace1.id,
        },
      });
    });

    test('should get preference templates for workspace', async () => {
      const response = await request(app)
        .get('/api/preferences/templates')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        templates: expect.any(Array),
        count: expect.any(Number),
      });

      expect(response.body.templates.length).toBeGreaterThan(0);
      expect(response.body.templates[0]).toMatchObject({
        name: expect.any(String),
        description: expect.any(String),
        weeklyHours: expect.any(Object),
        breakTimes: expect.any(Object),
        timezone: expect.any(String),
      });
    });
  });

  describe('Dashboard and Frontend Integration', () => {
    test('should serve frontend assets', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('Tandem');
    });

    test('should provide workspace-aware API endpoints', async () => {
      const response = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        summary: {
          workspaceId: workspace1.id,
          totalTasks: expect.any(Number),
          pendingTasks: expect.any(Number),
          completedTasks: expect.any(Number),
          scheduledTasks: expect.any(Number),
        },
      });
    });
  });

  describe('Monitoring and Observability', () => {
    test('should provide workspace-specific metrics', async () => {
      const response = await request(app)
        .get('/api/monitoring/workspace-metrics')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .expect(200);

      expect(response.body).toMatchObject({
        workspaceId: workspace1.id,
        metrics: {
          totalUsers: expect.any(Number),
          activeTasks: expect.any(Number),
          aiRequests: expect.any(Number),
          calendarEvents: expect.any(Number),
        },
      });
    });

    test('should provide system-wide health metrics', async () => {
      const response = await request(app)
        .get('/api/monitoring/system-health')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'healthy',
        metrics: {
          totalWorkspaces: expect.any(Number),
          totalUsers: expect.any(Number),
          systemLoad: expect.any(Object),
          databaseHealth: expect.any(Object),
          redisHealth: expect.any(Object),
        },
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle invalid workspace ID gracefully', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', 'invalid-workspace-id')
        .expect(404);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });

    test('should handle cross-workspace access attempts', async () => {
      const response = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace2.id)
        .expect(403);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringMatching(/workspace/i),
      });
    });

    test('should handle AI service failures gracefully', async () => {
      // Mock AI service failure by sending invalid data
      const response = await request(app)
        .post('/api/ai/detect-tasks')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .send({
          messageText: '', // Empty message should be handled gracefully
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('Data Isolation Verification', () => {
    test('should ensure complete data isolation between workspaces', async () => {
      // Create tasks in both workspaces
      const task1Data = {
        title: 'Workspace 1 Task',
        description: 'This task belongs to workspace 1',
        estimatedDuration: 60,
        importance: 'MEDIUM',
      };

      const task2Data = {
        title: 'Workspace 2 Task',
        description: 'This task belongs to workspace 2',
        estimatedDuration: 90,
        importance: 'HIGH',
      };

      // Create task in workspace 1
      const task1Response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .send(task1Data)
        .expect(201);

      // Create task in workspace 2
      const task2Response = await request(app)
        .post('/api/tasks')
        .set('Authorization', `Bearer ${workspace2Token}`)
        .set('X-Workspace-ID', workspace2.id)
        .send(task2Data)
        .expect(201);

      // Verify workspace 1 can only see its tasks
      const workspace1Tasks = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${workspace1Token}`)
        .set('X-Workspace-ID', workspace1.id)
        .expect(200);

      // Verify workspace 2 can only see its tasks
      const workspace2Tasks = await request(app)
        .get('/api/tasks')
        .set('Authorization', `Bearer ${workspace2Token}`)
        .set('X-Workspace-ID', workspace2.id)
        .expect(200);

      // Check that workspace 1 doesn't see workspace 2's tasks
      const workspace1TaskIds = workspace1Tasks.body.tasks.map((t: any) => t.id);
      expect(workspace1TaskIds).toContain(task1Response.body.task.id);
      expect(workspace1TaskIds).not.toContain(task2Response.body.task.id);

      // Check that workspace 2 doesn't see workspace 1's tasks
      const workspace2TaskIds = workspace2Tasks.body.tasks.map((t: any) => t.id);
      expect(workspace2TaskIds).toContain(task2Response.body.task.id);
      expect(workspace2TaskIds).not.toContain(task1Response.body.task.id);
    });
  });
});