/**
 * Slack interactions handler (button clicks, selections, etc.)
 * 
 * This module handles interactive Slack components like button clicks
 * for task confirmation and management.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { updateTaskStatus, findTaskByIdInWorkspace } from '../../models/task';
import { findUserBySlackId } from '../../models/user';
import { sendDirectMessage } from '../../services/slack/dmSender';
import { verifySlackSignature } from './events';
import { addCalendarSchedulingJob, CalendarJobType } from '../../jobs/calendar_scheduling';
import { config } from '../../config';

// Slack interaction interfaces
interface SlackAction {
  type: string;
  action_id: string;
  block_id?: string;
  value?: string;
  text?: {
    type: string;
    text: string;
  };
  action_ts: string;
}

interface SlackInteractionPayload {
  type: 'block_actions' | 'interactive_message' | 'dialog_submission';
  user: {
    id: string;
    name: string;
  };
  channel: {
    id: string;
    name: string;
  };
  team: {
    id: string;
    domain: string;
  };
  actions: SlackAction[];
  message?: {
    ts: string;
    text: string;
  };
  response_url: string;
  trigger_id: string;
}

/**
 * Handle task confirmation button clicks
 */
async function handleTaskConfirmation(
  action: SlackAction,
  payload: SlackInteractionPayload,
  workspaceId: string
): Promise<{ text: string; replace_original?: boolean }> {
  
  const { user } = payload;
  const actionValue = action.value;
  
  if (!actionValue) {
    return { text: '❌ Invalid action - missing task information.' };
  }

  try {
    // The action value contains the task ID directly (from dmSender.ts)
    const taskId = actionValue;

    // Find user in our database
    const dbUser = await findUserBySlackId(user.id, workspaceId);
    if (!dbUser) {
      return { 
        text: '❌ User not found. Please make sure you are authenticated with Tandem.' 
      };
    }

    switch (action.action_id) {
      case 'confirm_task':
        // Update task status to confirmed
        const confirmedTask = await updateTaskStatus(taskId, 'CONFIRMED', workspaceId);
        
        console.log(`✅ [Workspace ID: ${workspaceId}] Task confirmed: ${confirmedTask.title} (ID: ${taskId}) by user ${user.id}`);
        
        // Trigger automatic calendar scheduling
        try {
          const jobId = await addCalendarSchedulingJob({
            jobType: CalendarJobType.SCHEDULE_TASK,
            workspaceId,
            userId: dbUser.id,
            taskId,
            sendConfirmation: true, // Send confirmation when scheduled
          }, 8); // High priority for confirmed tasks
          
          console.log(`📅 [Workspace ID: ${workspaceId}] Calendar scheduling job ${jobId} created for task ${taskId}`);
          
          // Send confirmation message with scheduling info
          setTimeout(async () => {
            try {
              await sendDirectMessage(user.id, {
                text: `✅ Task confirmed: "${confirmedTask.title}"\n\nI'm now finding the best time to schedule this in your calendar. You'll receive another message once it's scheduled!`,
                blocks: [],
              }, workspaceId);
            } catch (error) {
              console.error('Failed to send confirmation follow-up:', error);
            }
          }, 1000);

          return {
            text: `✅ Confirmed: "${confirmedTask.title}"\n\n🗓️ Scheduling in your calendar... You'll get an update when it's scheduled!`,
            replace_original: true,
          };
        } catch (schedulingError) {
          console.error(`Failed to create calendar scheduling job for task ${taskId}:`, schedulingError);
          
          // Still confirm the task even if scheduling fails
          setTimeout(async () => {
            try {
              await sendDirectMessage(user.id, {
                text: `✅ Task confirmed: "${confirmedTask.title}"\n\n⚠️ I couldn't automatically schedule this in your calendar. You can manually schedule it using the task dashboard or by asking me to schedule it later.`,
                blocks: [],
              }, workspaceId);
            } catch (error) {
              console.error('Failed to send confirmation follow-up:', error);
            }
          }, 1000);

          return {
            text: `✅ Confirmed: "${confirmedTask.title}"\n\n⚠️ Automatic scheduling failed. You can schedule it manually.`,
            replace_original: true,
          };
        }

      case 'dismiss_task':
        // Update task status to dismissed
        const dismissedTask = await updateTaskStatus(taskId, 'DISMISSED', workspaceId);
        
        console.log(`❌ [Workspace ID: ${workspaceId}] Task dismissed: ${dismissedTask.title} (ID: ${taskId}) by user ${user.id}`);
        
        return {
          text: `❌ Task dismissed: "${dismissedTask.title}"\n\nNo worries, I won't schedule this one.`,
          replace_original: true,
        };

      case 'edit_task':
        // For now, just provide a message about modification
        // In a full implementation, this could open a modal for editing
        return {
          text: `🔧 Task modification is coming soon!\n\nFor now, you can dismiss this task and create a new one, or confirm it as-is.`,
          replace_original: false,
        };

      default:
        return { text: '❌ Unknown action type.' };
    }

  } catch (error) {
    console.error(`[Workspace ID: ${workspaceId}] Task confirmation error:`, error);
    
    if (error instanceof Error) {
      if (error.message === 'Task not found') {
        return { text: '❌ Task not found. It may have already been processed.' };
      }
      if (error.message.includes('Invalid task status transition')) {
        return { text: '❌ This task has already been processed.' };
      }
    }
    
    return { text: '❌ Something went wrong. Please try again or contact support.' };
  }
}

/**
 * Handle Slack interactive components
 */
export async function handleSlackInteractions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Verify request signature
    if (!verifySlackSignature(req)) {
      console.warn('Invalid Slack interaction signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    // Parse payload from form data
    const payloadString = req.body.payload;
    if (!payloadString) {
      res.status(400).json({ error: 'Missing payload' });
      return;
    }

    const payload: SlackInteractionPayload = JSON.parse(payloadString);
    
    // Validate workspace context exists
    if (!req.workspace) {
      console.error('Workspace context missing in interaction handler');
      res.status(400).json({ error: 'Workspace context required' });
      return;
    }
    
    console.log(`🎯 [Workspace: ${req.workspace.slackTeamName}] Received Slack interaction: ${payload.type} from user ${payload.user.id}`);

    // Handle different interaction types
    if (payload.type === 'block_actions') {
      const action = payload.actions[0]; // Usually one action
      
      if (!action) {
        res.status(400).json({ error: 'No action found' });
        return;
      }

      let response: { text: string; replace_original?: boolean };

      // Route actions based on action_id
      switch (action.action_id) {
        case 'confirm_task':
        case 'dismiss_task':
        case 'edit_task':
          response = await handleTaskConfirmation(action, payload, req.workspaceId!);
          break;
          
        default:
          console.warn(`[Workspace: ${req.workspace.slackTeamName}] Unknown action_id: ${action.action_id}`);
          response = { text: '❌ Unknown action. Please try again.' };
      }

      // Send response
      res.status(200).json(response);
      return;
    }

    // Handle other interaction types (future expansion)
    if (payload.type === 'interactive_message') {
      res.status(200).json({ text: 'Interactive messages are not yet supported.' });
      return;
    }

    if (payload.type === 'dialog_submission') {
      res.status(200).json({ text: 'Dialog submissions are not yet supported.' });
      return;
    }

    // Unknown interaction type
    console.warn(`[Workspace: ${req.workspace?.slackTeamName || 'Unknown'}] Unknown interaction type: ${payload.type}`);
    res.status(200).json({ text: 'Unknown interaction type.' });

  } catch (error) {
    const workspaceContext = req.workspace ? `[Workspace: ${req.workspace.slackTeamName}]` : '[Unknown Workspace]';
    console.error(`${workspaceContext} Slack interaction handler error:`, error);
    
    // Send user-friendly error response
    try {
      res.status(200).json({ 
        text: '❌ Something went wrong processing your request. Please try again.' 
      });
    } catch (responseError) {
      // If we can't send JSON response, call next with error
      next(error);
    }
  }
}

/**
 * Middleware to parse Slack interaction webhooks
 * These come as form-encoded data, not JSON
 */
export function parseSlackInteraction(req: Request, res: Response, next: NextFunction): void {
  let rawBody = '';
  
  req.on('data', (chunk) => {
    rawBody += chunk.toString();
  });

  req.on('end', () => {
    try {
      // Store raw body for signature verification
      (req as any).rawBody = rawBody;
      
      // Parse form data
      const params = new URLSearchParams(rawBody);
      req.body = Object.fromEntries(params.entries());
      
      next();
    } catch (error) {
      console.error('Failed to parse Slack interaction body:', error);
      res.status(400).json({ error: 'Invalid form data' });
    }
  });
}

/**
 * Health check for Slack interactions
 */
export function slackInteractionsHealthCheck(req: Request, res: Response): void {
  res.status(200).json({
    status: 'healthy',
    service: 'slack-interactions',
    timestamp: new Date().toISOString(),
    supportedActions: [
      'confirm_task',
      'dismiss_task', 
      'edit_task',
    ],
  });
}