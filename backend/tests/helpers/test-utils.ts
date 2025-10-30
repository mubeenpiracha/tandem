/**
 * Test utilities for end-to-end testing
 */

import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

export interface TestWorkspace {
  id: string;
  slackTeamId: string;
  slackTeamName: string;
  slackBotToken: string;
  isActive: boolean;
}

export interface TestUser {
  id: string;
  email: string;
  slackUserId: string;
  workspaceId: string;
  timezone: string;
  status: string;
}

/**
 * Create a test workspace
 */
export async function createTestWorkspace(
  slackTeamId: string,
  slackTeamName: string
): Promise<TestWorkspace> {
  return await prisma.workspace.create({
    data: {
      slackTeamId,
      slackTeamName,
      slackBotToken: `xoxb-test-${slackTeamId}`,
      isActive: true,
    },
  });
}

/**
 * Create a test user in a workspace
 */
export async function createTestUser(
  email: string,
  slackUserId: string,
  workspaceId: string
): Promise<TestUser> {
  return await prisma.user.create({
    data: {
      email,
      slackUserId,
      workspaceId,
      timezone: 'UTC',
      status: 'ACTIVE',
    },
  });
}

/**
 * Create a test task
 */
export async function createTestTask(
  userId: string,
  title: string,
  options: {
    description?: string;
    dueDate?: Date;
    estimatedDuration?: number;
    importance?: 'LOW' | 'MEDIUM' | 'HIGH';
    status?: 'PENDING' | 'CONFIRMED' | 'SCHEDULED' | 'COMPLETED' | 'DISMISSED';
  } = {}
) {
  return await prisma.task.create({
    data: {
      userId,
      title,
      description: options.description || null,
      dueDate: options.dueDate || null,
      estimatedDuration: options.estimatedDuration || 60,
      importance: options.importance || 'MEDIUM',
      status: options.status || 'PENDING',
    },
  });
}

/**
 * Create test work preferences
 */
export async function createTestPreferences(
  userId: string,
  options: {
    timezone?: string;
    weeklyHours?: any;
    breakTimes?: any;
  } = {}
) {
  const defaultWeeklyHours = {
    monday: { start: '09:00', end: '17:00' },
    tuesday: { start: '09:00', end: '17:00' },
    wednesday: { start: '09:00', end: '17:00' },
    thursday: { start: '09:00', end: '17:00' },
    friday: { start: '09:00', end: '17:00' },
    saturday: null,
    sunday: null,
  };

  const defaultBreakTimes = {
    lunch: { start: '12:00', end: '13:00' },
  };

  return await prisma.workPreferences.create({
    data: {
      userId,
      weeklyHours: options.weeklyHours || defaultWeeklyHours,
      breakTimes: options.breakTimes || defaultBreakTimes,
      timezone: options.timezone || 'UTC',
    },
  });
}

/**
 * Clean up all test data
 */
export async function cleanupTestData(): Promise<void> {
  // Delete in order of dependencies
  await prisma.calendarEvent.deleteMany({
    where: {
      task: {
        user: {
          workspace: {
            slackTeamId: {
              startsWith: 'test-workspace-',
            },
          },
        },
      },
    },
  });

  await prisma.workPreferences.deleteMany({
    where: {
      user: {
        workspace: {
          slackTeamId: {
            startsWith: 'test-workspace-',
          },
        },
      },
    },
  });

  await prisma.task.deleteMany({
    where: {
      user: {
        workspace: {
          slackTeamId: {
            startsWith: 'test-workspace-',
          },
        },
      },
    },
  });

  await prisma.slackMessage.deleteMany({
    where: {
      workspace: {
        slackTeamId: {
          startsWith: 'test-workspace-',
        },
      },
    },
  });

  await prisma.googleToken.deleteMany({
    where: {
      user: {
        workspace: {
          slackTeamId: {
            startsWith: 'test-workspace-',
          },
        },
      },
    },
  });

  await prisma.slackToken.deleteMany({
    where: {
      user: {
        workspace: {
          slackTeamId: {
            startsWith: 'test-workspace-',
          },
        },
      },
    },
  });

  await prisma.user.deleteMany({
    where: {
      workspace: {
        slackTeamId: {
          startsWith: 'test-workspace-',
        },
      },
    },
  });

  await prisma.workspace.deleteMany({
    where: {
      slackTeamId: {
        startsWith: 'test-workspace-',
      },
    },
  });
}

/**
 * Wait for a specified amount of time
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a random test ID
 */
export function generateTestId(): string {
  return `test-${uuidv4().substring(0, 8)}`;
}

/**
 * Create a mock Slack event
 */
export function createMockSlackEvent(
  teamId: string,
  userId: string,
  messageText: string,
  options: {
    channel?: string;
    eventType?: string;
    timestamp?: string;
    threadTs?: string;
  } = {}
) {
  return {
    token: 'test-verification-token',
    team_id: teamId,
    event: {
      type: options.eventType || 'message',
      user: userId,
      text: messageText,
      channel: options.channel || 'C1234567890',
      ts: options.timestamp || Date.now().toString(),
      thread_ts: options.threadTs,
    },
    type: 'event_callback',
    event_id: generateTestId(),
    event_time: Math.floor(Date.now() / 1000),
  };
}

/**
 * Create a mock Slack interaction
 */
export function createMockSlackInteraction(
  teamId: string,
  userId: string,
  actionType: string = 'button',
  actionValue: string = 'confirm_task'
) {
  return {
    type: 'interactive_message',
    token: 'test-verification-token',
    team: {
      id: teamId,
      domain: 'test-workspace',
    },
    user: {
      id: userId,
      name: 'testuser',
    },
    channel: {
      id: 'C1234567890',
      name: 'general',
    },
    message: {
      type: 'message',
      user: 'B1234567890',
      ts: Date.now().toString(),
    },
    actions: [
      {
        type: actionType,
        name: 'task_action',
        value: actionValue,
      },
    ],
    callback_id: 'task_confirmation',
    trigger_id: generateTestId(),
    response_url: 'https://hooks.slack.com/actions/test',
  };
}

/**
 * Assert workspace isolation - verify data belongs to correct workspace
 */
export async function assertWorkspaceIsolation(
  data: any[],
  expectedWorkspaceId: string,
  pathToWorkspaceId: string = 'workspaceId'
): Promise<void> {
  for (const item of data) {
    const workspaceId = pathToWorkspaceId.split('.').reduce((obj, key) => obj?.[key], item);
    if (workspaceId !== expectedWorkspaceId) {
      throw new Error(
        `Workspace isolation violation: Expected ${expectedWorkspaceId}, got ${workspaceId}`
      );
    }
  }
}

/**
 * Create a complete test scenario with workspace, users, and tasks
 */
export async function createCompleteTestScenario(workspaceId: string) {
  const workspace = await createTestWorkspace(workspaceId, `Test Workspace ${workspaceId}`);
  
  const user1 = await createTestUser(
    `user1@${workspaceId}.com`,
    `slack-user-1-${workspaceId}`,
    workspace.id
  );
  
  const user2 = await createTestUser(
    `user2@${workspaceId}.com`,
    `slack-user-2-${workspaceId}`,
    workspace.id
  );

  const task1 = await createTestTask(user1.id, 'Complete project proposal', {
    description: 'Draft and finalize Q1 project proposal',
    importance: 'HIGH',
    estimatedDuration: 120,
  });

  const task2 = await createTestTask(user2.id, 'Team meeting preparation', {
    description: 'Prepare agenda and materials for team meeting',
    importance: 'MEDIUM',
    estimatedDuration: 60,
  });

  const preferences1 = await createTestPreferences(user1.id, {
    timezone: 'America/New_York',
  });

  const preferences2 = await createTestPreferences(user2.id, {
    timezone: 'Europe/London',
  });

  return {
    workspace,
    users: [user1, user2],
    tasks: [task1, task2],
    preferences: [preferences1, preferences2],
  };
}