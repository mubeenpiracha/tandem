/**
 * Slack interactions handler (button clicks, selections, etc.)
 * 
 * This module handles interactive Slack components like button clicks
 * for task confirmation and management.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { updateTaskStatus } from '../../models/task';
import { findUserBySlackId } from '../../models/user';
import { sendDirectMessage } from '../../services/slack/dmSender';
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
 * Verify Slack request signature for interactions
 */
function verifySlackInteractionSignature(req: Request): boolean {
  const slackSignature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  
  if (!slackSignature || !timestamp) {
    console.warn('Missing Slack signature headers in interaction');
    return false;
  }

  // Check timestamp (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    console.warn('Slack interaction timestamp too old');
    return false;
  }

  // Verify signature using raw body
  const rawBody = (req as any).rawBody || '';
  const sigBasestring = 'v0:' + timestamp + ':' + rawBody;
  const expectedSignature = 'v0=' + crypto
    .createHmac('sha256', config.slack.signingSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, 'utf8'),
    Buffer.from(slackSignature, 'utf8')
  );
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
    // Parse action value (format: "action:taskId")
    const [actionType, taskId] = actionValue.split(':');
    
    if (!taskId) {
      return { text: '❌ Invalid action - missing task ID.' };
    }

    // Find user in our database
    const dbUser = await findUserBySlackId(user.id, workspaceId);
    if (!dbUser) {
      return { 
        text: '❌ User not found. Please make sure you are authenticated with Tandem.' 
      };
    }

    switch (actionType) {
      case 'confirm':
        // Update task status to confirmed
        const confirmedTask = await updateTaskStatus(taskId, 'CONFIRMED');
        
        console.log(`✅ Task confirmed: ${confirmedTask.title} (ID: ${taskId}) by user ${user.id}`);
        
        // Send confirmation message
        setTimeout(async () => {
          try {
            await sendDirectMessage(dbUser.id, user.id, {
              text: `✅ Task confirmed: "${confirmedTask.title}"\n\nI'll work on scheduling this in your calendar based on your preferences.`,
              blocks: [],
            });
          } catch (error) {
            console.error('Failed to send confirmation follow-up:', error);
          }
        }, 1000);

        return {
          text: `✅ Confirmed: "${confirmedTask.title}"\n\nI'll schedule this task in your calendar and send you an update.`,
          replace_original: true,
        };

      case 'dismiss':
        // Update task status to dismissed
        const dismissedTask = await updateTaskStatus(taskId, 'DISMISSED');
        
        console.log(`❌ Task dismissed: ${dismissedTask.title} (ID: ${taskId}) by user ${user.id}`);
        
        return {
          text: `❌ Task dismissed: "${dismissedTask.title}"\n\nNo worries, I won't schedule this one.`,
          replace_original: true,
        };

      case 'modify':
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
    console.error('Task confirmation error:', error);
    
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
    if (!verifySlackInteractionSignature(req)) {
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
    
    console.log(`🎯 Received Slack interaction: ${payload.type} from user ${payload.user.id}`);

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
        case 'task_confirm':
        case 'task_dismiss':
        case 'task_modify':
          response = await handleTaskConfirmation(action, payload, req.workspaceId!);
          break;
          
        default:
          console.warn(`Unknown action_id: ${action.action_id}`);
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
    console.warn(`Unknown interaction type: ${payload.type}`);
    res.status(200).json({ text: 'Unknown interaction type.' });

  } catch (error) {
    console.error('Slack interaction handler error:', error);
    
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
      'task_confirm',
      'task_dismiss', 
      'task_modify',
    ],
  });
}