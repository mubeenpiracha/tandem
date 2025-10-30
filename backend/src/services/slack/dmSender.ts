/**
 * Slack DM (Direct Message) sending service
 * 
 * This module provides functionality to send direct messages
 * and interactive messages to Slack users with workspace-aware token management.
 */

import { WebClient, Block, KnownBlock } from '@slack/web-api';
import { getDecryptedSlackToken } from '../../models/slackToken';
import { findWorkspaceById } from '../../models/workspace';

export interface DMMessage {
  text: string;
  blocks?: (KnownBlock | Block)[];
  attachments?: any[];
}

export interface TaskConfirmationMessage {
  taskId: string;
  title: string;
  description?: string;
  dueDate?: string;
  estimatedDuration: number;
  importance: string;
  confidence: number;
}

/**
 * Create Slack client for a specific user (user token)
 */
async function createSlackClientForUser(userId: string): Promise<WebClient> {
  const token = await getDecryptedSlackToken(userId);
  if (!token) {
    throw new Error('Slack token not found for user');
  }

  return new WebClient(token);
}

/**
 * Create Slack client for workspace operations (bot token)
 */
async function createSlackClientForWorkspace(workspaceId: string): Promise<WebClient> {
  const workspace = await findWorkspaceById(workspaceId);
  if (!workspace || !workspace.isActive) {
    throw new Error(`Workspace not found or inactive: ${workspaceId}`);
  }

  return new WebClient(workspace.slackBotToken);
}

/**
 * Send a direct message to a user (workspace-aware)
 */
export async function sendDirectMessage(
  toSlackUserId: string,
  message: DMMessage,
  workspaceId: string,
  fallbackUserId?: string
): Promise<string> {
  try {
    // Use workspace bot token when possible, fall back to user token if provided
    const slack = fallbackUserId 
      ? await createSlackClientForUser(fallbackUserId)
      : await createSlackClientForWorkspace(workspaceId);
    
    console.log(`📧 [Workspace ID: ${workspaceId}] Sending DM to user ${toSlackUserId} using ${fallbackUserId ? 'user' : 'bot'} token`);
    
    // Open a DM channel with the user
    const dmResult = await slack.conversations.open({
      users: toSlackUserId,
    });

    if (!dmResult.ok || !dmResult.channel?.id) {
      throw new Error(`Failed to open DM channel: ${dmResult.error}`);
    }

    const channelId = dmResult.channel.id;

    // Send the message
    const result = await slack.chat.postMessage({
      channel: channelId,
      text: message.text,
      blocks: message.blocks,
      attachments: message.attachments,
    });

    if (!result.ok || !result.ts) {
      throw new Error(`Failed to send message: ${result.error}`);
    }

    console.log(`📧 [Workspace ID: ${workspaceId}] Successfully sent DM to ${toSlackUserId}, message timestamp: ${result.ts}`);
    return result.ts;
  } catch (error) {
    console.error(`[Workspace ID: ${workspaceId}] Failed to send direct message:`, error);
    throw error;
  }
}

/**
 * Send task confirmation message with interactive buttons (workspace-aware)
 */
export async function sendTaskConfirmation(
  toSlackUserId: string,
  task: TaskConfirmationMessage,
  workspaceId: string,
  fallbackUserId?: string
): Promise<string> {
  try {
    const dueDateText = task.dueDate 
      ? `📅 Due: ${new Date(task.dueDate).toLocaleDateString()}`
      : '📅 No due date specified';

    const durationText = `⏱️ Estimated: ${task.estimatedDuration} minutes`;
    const importanceText = `🎯 Priority: ${task.importance}`;
    const confidenceText = `🤖 AI Confidence: ${Math.round(task.confidence * 100)}%`;

    const blocks: (KnownBlock | Block)[] = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🤖 Task Detected!',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${task.title}*${task.description ? `\n${task.description}` : ''}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: dueDateText,
          },
          {
            type: 'mrkdwn',
            text: durationText,
          },
          {
            type: 'mrkdwn',
            text: importanceText,
          },
          {
            type: 'mrkdwn',
            text: confidenceText,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'Would you like me to add this to your calendar?',
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✅ Confirm',
              emoji: true,
            },
            style: 'primary',
            action_id: 'confirm_task',
            value: task.taskId,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '✏️ Edit',
              emoji: true,
            },
            action_id: 'edit_task',
            value: task.taskId,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '❌ Dismiss',
              emoji: true,
            },
            style: 'danger',
            action_id: 'dismiss_task',
            value: task.taskId,
          },
        ],
      },
    ];

    const message: DMMessage = {
      text: `Task detected: ${task.title}`,
      blocks,
    };

    return await sendDirectMessage(toSlackUserId, message, workspaceId, fallbackUserId);
  } catch (error) {
    console.error(`[Workspace ID: ${workspaceId}] Failed to send task confirmation:`, error);
    throw error;
  }
}

/**
 * Send task status update message (workspace-aware)
 */
export async function sendTaskStatusUpdate(
  toSlackUserId: string,
  taskTitle: string,
  status: 'confirmed' | 'scheduled' | 'completed' | 'dismissed',
  workspaceId: string,
  additionalInfo?: string,
  fallbackUserId?: string
): Promise<string> {
  const statusEmojis = {
    confirmed: '✅',
    scheduled: '📅',
    completed: '🎉',
    dismissed: '❌',
  };

  const statusMessages = {
    confirmed: 'confirmed and will be scheduled',
    scheduled: 'scheduled in your calendar',
    completed: 'marked as completed',
    dismissed: 'dismissed',
  };

  const emoji = statusEmojis[status];
  const statusText = statusMessages[status];

  const message: DMMessage = {
    text: `${emoji} Task "${taskTitle}" has been ${statusText}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *Task Update*\n"${taskTitle}" has been ${statusText}${additionalInfo ? `\n\n${additionalInfo}` : ''}`,
        },
      },
    ],
  };

  return await sendDirectMessage(toSlackUserId, message, workspaceId, fallbackUserId);
}

/**
 * Send error notification to user (workspace-aware)
 */
export async function sendErrorNotification(
  toSlackUserId: string,
  errorMessage: string,
  workspaceId: string,
  context?: string,
  fallbackUserId?: string
): Promise<string> {
  const message: DMMessage = {
    text: `⚠️ Error: ${errorMessage}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚠️ *Something went wrong*\n${errorMessage}${context ? `\n\n_Context: ${context}_` : ''}`,
        },
      },
    ],
  };

  return await sendDirectMessage(toSlackUserId, message, workspaceId, fallbackUserId);
}

/**
 * Send welcome message to new user (workspace-aware)
 */
export async function sendWelcomeMessage(
  toSlackUserId: string,
  workspaceId: string,
  fallbackUserId?: string
): Promise<string> {
  const message: DMMessage = {
    text: 'Welcome to Tandem! 🎉',
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🎉 Welcome to Tandem!',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'I\'m your AI-powered task assistant! I can help you:\n\n• 🤖 Detect tasks from your Slack conversations\n• 📅 Automatically schedule them in your Google Calendar\n• ⏰ Send you reminders\n• 📊 Track your productivity',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'To get started, just mention me in channels or send me a direct message when you have tasks to track!',
        },
      },
    ],
  };

  return await sendDirectMessage(toSlackUserId, message, workspaceId, fallbackUserId);
}

/**
 * Send calendar conflict notification (workspace-aware)
 */
export async function sendCalendarConflictNotification(
  toSlackUserId: string,
  taskTitle: string,
  conflictDetails: string,
  workspaceId: string,
  fallbackUserId?: string
): Promise<string> {
  const message: DMMessage = {
    text: `⚠️ Calendar conflict detected for task: ${taskTitle}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `⚠️ *Calendar Conflict Detected*\n\nTask: "${taskTitle}"\n\n${conflictDetails}\n\nPlease check your calendar and let me know when you'd like to reschedule this task.`,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Reschedule',
              emoji: true,
            },
            style: 'primary',
            action_id: 'reschedule_task',
            value: taskTitle,
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Keep Conflict',
              emoji: true,
            },
            action_id: 'keep_conflict',
            value: taskTitle,
          },
        ],
      },
    ],
  };

  return await sendDirectMessage(toSlackUserId, message, workspaceId, fallbackUserId);
}

/**
 * Check if user has DM permissions (workspace-aware)
 */
export async function canSendDM(
  toSlackUserId: string,
  workspaceId: string,
  fallbackUserId?: string
): Promise<boolean> {
  try {
    // Use workspace bot token when possible, fall back to user token if provided
    const slack = fallbackUserId 
      ? await createSlackClientForUser(fallbackUserId)
      : await createSlackClientForWorkspace(workspaceId);
    
    const result = await slack.conversations.open({
      users: toSlackUserId,
    });

    return result.ok === true;
  } catch (error) {
    console.error(`[Workspace ID: ${workspaceId}] Failed to check DM permissions:`, error);
    return false;
  }
}