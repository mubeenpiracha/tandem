/**
 * Slack event webhook handler
 * 
 * This module handles incoming webhook events from Slack,
 * including message events for task detection processing.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { addTaskDetectionJob } from '../../jobs/taskDetection';
import { config } from '../../config';

// Slack event interfaces
interface SlackEvent {
  type: string;
  event_ts: string;
  user?: string;
  text?: string;
  channel?: string;
  channel_type?: string;
  ts?: string;
  thread_ts?: string;
  subtype?: string;
  bot_id?: string;
}

interface SlackEventPayload {
  token: string;
  team_id: string;
  api_app_id: string;
  event: SlackEvent;
  type: 'event_callback' | 'url_verification';
  challenge?: string;
  event_id: string;
  event_time: number;
}

/**
 * Verify Slack request signature
 */
function verifySlackSignature(req: Request): boolean {
  const slackSignature = req.headers['x-slack-signature'] as string;
  const timestamp = req.headers['x-slack-request-timestamp'] as string;
  
  if (!slackSignature || !timestamp) {
    console.warn('Missing Slack signature headers');
    return false;
  }

  // Check timestamp to prevent replay attacks (should be within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) {
    console.warn('Slack request timestamp too old');
    return false;
  }

  // Verify signature
  const sigBasestring = 'v0:' + timestamp + ':' + JSON.stringify(req.body);
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
 * Check if message should be processed for task detection
 */
function shouldProcessMessage(event: SlackEvent): boolean {
  // Skip bot messages
  if (event.bot_id || event.subtype === 'bot_message') {
    return false;
  }

  // Skip certain subtypes
  const skipSubtypes = ['channel_join', 'channel_leave', 'message_changed', 'message_deleted'];
  if (event.subtype && skipSubtypes.includes(event.subtype)) {
    return false;
  }

  // Must have text and user
  if (!event.text || !event.user) {
    return false;
  }

  // Skip very short messages (likely not tasks)
  if (event.text.length < 10) {
    return false;
  }

  // Skip messages that are just links or mentions
  const linkOnlyPattern = /^(<https?:\/\/[^>]+>\s*)+$/;
  const mentionOnlyPattern = /^(<@[A-Z0-9]+>\s*)+$/;
  if (linkOnlyPattern.test(event.text) || mentionOnlyPattern.test(event.text)) {
    return false;
  }

  return true;
}

/**
 * Handle Slack event webhook
 */
export async function handleSlackEvents(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Verify request signature
    if (!verifySlackSignature(req)) {
      console.warn('Invalid Slack signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    const payload = req.body as SlackEventPayload;

    // Handle URL verification challenge
    if (payload.type === 'url_verification') {
      console.log('✅ Slack URL verification challenge received');
      res.status(200).json({ challenge: payload.challenge });
      return;
    }

    // Handle event callbacks
    if (payload.type === 'event_callback') {
      const event = payload.event;

      console.log(`📨 Received Slack event: ${event.type} from user ${event.user} in channel ${event.channel}`);

      // Handle message events
      if (event.type === 'message' && shouldProcessMessage(event)) {
        console.log(`🔍 Processing message for task detection: "${event.text?.substring(0, 100)}..."`);

        try {
          // Add to task detection queue
          await addTaskDetectionJob({
            workspaceId: req.workspaceId!,
            messageId: event.ts!,
            channelId: event.channel!,
            threadId: event.thread_ts,
            userId: event.user!,
            messageText: event.text!,
            messageTimestamp: new Date(parseFloat(event.ts!) * 1000).toISOString(),
          });

          console.log(`✅ Task detection job queued for message ${event.ts}`);
        } catch (error) {
          console.error('Failed to queue task detection job:', error);
          // Don't return error to Slack - we don't want them to retry
        }
      } else {
        console.log(`⚠️ Skipping message: type=${event.type}, shouldProcess=${shouldProcessMessage(event)}`);
      }

      // Always respond with 200 to acknowledge receipt
      res.status(200).json({ status: 'ok' });
      return;
    }

    // Unknown event type
    console.warn(`Unknown Slack event type: ${payload.type}`);
    res.status(200).json({ status: 'ignored' });

  } catch (error) {
    console.error('Slack event handler error:', error);
    next(error);
  }
}

/**
 * Middleware to parse Slack webhook body as JSON
 */
export function parseSlackWebhook(req: Request, res: Response, next: NextFunction): void {
  // Store raw body for signature verification
  let rawBody = '';
  
  req.on('data', (chunk) => {
    rawBody += chunk.toString();
  });

  req.on('end', () => {
    try {
      req.body = JSON.parse(rawBody);
      next();
    } catch (error) {
      console.error('Failed to parse Slack webhook body:', error);
      res.status(400).json({ error: 'Invalid JSON' });
    }
  });
}

/**
 * Health check endpoint for Slack
 */
export function slackHealthCheck(req: Request, res: Response): void {
  res.status(200).json({
    status: 'healthy',
    service: 'slack-events',
    timestamp: new Date().toISOString(),
    features: {
      taskDetection: config.features.taskDetection,
    },
  });
}

/**
 * Get Slack event statistics
 */
export async function getSlackEventStats(req: Request, res: Response): Promise<void> {
  try {
    // This would typically come from a database or redis
    // For now, return placeholder stats
    const stats = {
      eventsReceived: 0, // Would track in redis or db
      messagesProcessed: 0,
      tasksDetected: 0,
      lastEventTime: null,
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error('Error getting Slack event stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}