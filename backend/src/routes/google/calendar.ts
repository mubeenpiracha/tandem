/**
 * Google Calendar webhook handlers
 * 
 * This module handles Google Calendar webhook notifications for calendar changes,
 * enabling real-time updates and conflict detection. All operations are workspace-scoped.
 */

import express from 'express';
import { getCalendarEvent, getCalendarEvents } from '../../services/google/calendar_reader';
import { detectConflicts } from '../../services/scheduling/conflict_detector';
import { sendTaskConfirmation, sendCalendarConflictNotification } from '../../services/slack/dmSender';
import { findUserById } from '../../models/user';
import { findCalendarEventByGoogleId, updateCalendarEvent, deactivateCalendarEvent } from '../../models/calendarEvent';
import { findTaskById, findTaskByIdInWorkspace, updateTask } from '../../models/task';
import { Logger, LogCategory } from '../../utils/logger';
import { workspaceMiddleware } from '../../middleware/workspace';
import { config } from '../../config';

const router = express.Router();

// Google Calendar webhook notification interface
interface GoogleCalendarNotification {
  kind: string;
  id: string;
  resourceId: string;
  resourceUri: string;
  channelId: string;
  channelToken?: string;
  channelExpiration?: string;
  eventType?: string;
  eventId?: string;
}

/**
 * GET /calendar/auth
 * Redirect to Google Calendar OAuth for calendar access
 */
router.get('/auth', workspaceMiddleware, async (req, res) => {
  try {
    const { workspaceId } = req;
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      return res.status(404).json({
        success: false,
        error: 'User not found in workspace',
      });
    }

    // Generate Google OAuth URL for calendar access
    const scopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
    ];

    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: config.google.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: JSON.stringify({ userId, workspaceId, type: 'calendar' }),
    });

    res.json({
      success: true,
      authUrl,
      message: 'Redirect user to this URL for Google Calendar authorization',
    });
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, 'Failed to generate calendar auth URL', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authorization URL',
    });
  }
});

/**
 * POST /calendar/webhook
 * Handle Google Calendar push notifications
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const notification: GoogleCalendarNotification = JSON.parse(req.body.toString());
    
    Logger.info(LogCategory.CALENDAR, `Received Google Calendar webhook notification: ${notification.eventType} for resource ${notification.resourceId}`);

    // Acknowledge the webhook immediately
    res.status(200).send('OK');

    // Process the notification asynchronously
    setImmediate(async () => {
      try {
        await processCalendarNotification(notification);
      } catch (error) {
        Logger.error(LogCategory.CALENDAR, 'Failed to process calendar notification', error as Error);
      }
    });
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, 'Failed to parse calendar webhook', error as Error);
    res.status(400).json({
      success: false,
      error: 'Invalid webhook payload',
    });
  }
});

/**
 * GET /calendar/events/:userId
 * Get calendar events for a user (workspace-scoped)
 */
router.get('/events/:userId', workspaceMiddleware, async (req, res) => {
  try {
    const { workspaceId } = req;
    const { userId } = req.params;
    const { timeMin, timeMax, maxResults } = req.query;

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      return res.status(404).json({
        success: false,
        error: 'User not found in workspace',
      });
    }

    // Parse query parameters
    const options: any = {};
    if (timeMin) options.timeMin = new Date(timeMin as string);
    if (timeMax) options.timeMax = new Date(timeMax as string);
    if (maxResults) options.maxResults = parseInt(maxResults as string, 10);

    // Get calendar events
    const events = await getCalendarEvents(userId, workspaceId!, options);

    res.json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to get calendar events for user ${req.params.userId}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve calendar events',
    });
  }
});

/**
 * GET /calendar/conflicts/:userId
 * Check for scheduling conflicts for a user
 */
router.get('/conflicts/:userId', workspaceMiddleware, async (req, res) => {
  try {
    const { workspaceId } = req;
    const { userId } = req.params;
    const { start, end, title } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        error: 'Start and end time parameters are required',
      });
    }

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      return res.status(404).json({
        success: false,
        error: 'User not found in workspace',
      });
    }

    // Detect conflicts
    const conflictResult = await detectConflicts(userId, workspaceId!, {
      start: new Date(start as string),
      end: new Date(end as string),
      title: title as string,
    });

    res.json({
      success: true,
      ...conflictResult,
    });
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to check conflicts for user ${req.params.userId}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to check for conflicts',
    });
  }
});

/**
 * POST /calendar/watch/:userId
 * Set up Google Calendar watch notifications for a user
 */
router.post('/watch/:userId', workspaceMiddleware, async (req, res) => {
  try {
    const { workspaceId } = req;
    const { userId } = req.params;
    const { channelId, address } = req.body;

    if (!channelId || !address) {
      return res.status(400).json({
        success: false,
        error: 'Channel ID and webhook address are required',
      });
    }

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      return res.status(404).json({
        success: false,
        error: 'User not found in workspace',
      });
    }

    // TODO: Implement Google Calendar watch setup
    // This would involve calling the Google Calendar API to set up push notifications
    
    Logger.info(LogCategory.CALENDAR, `Setting up calendar watch for user ${userId} with channel ${channelId}`);

    res.json({
      success: true,
      message: 'Calendar watch setup initiated',
      channelId,
      address,
    });
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to set up calendar watch for user ${req.params.userId}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to set up calendar watch',
    });
  }
});

/**
 * DELETE /calendar/watch/:channelId
 * Stop Google Calendar watch notifications
 */
router.delete('/watch/:channelId', async (req, res) => {
  try {
    const { channelId } = req.params;

    // TODO: Implement Google Calendar watch teardown
    // This would involve calling the Google Calendar API to stop push notifications
    
    Logger.info(LogCategory.CALENDAR, `Stopping calendar watch for channel ${channelId}`);

    res.json({
      success: true,
      message: 'Calendar watch stopped',
      channelId,
    });
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to stop calendar watch for channel ${req.params.channelId}`, error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop calendar watch',
    });
  }
});

/**
 * Process Google Calendar notification
 */
async function processCalendarNotification(notification: GoogleCalendarNotification): Promise<void> {
  try {
    Logger.info(LogCategory.CALENDAR, `Processing calendar notification: ${notification.eventType} for event ${notification.eventId}`);

    // Extract user information from channel token (if available)
    let userId: string | undefined;
    let workspaceId: string | undefined;

    if (notification.channelToken) {
      try {
        const tokenData = JSON.parse(notification.channelToken);
        userId = tokenData.userId;
        workspaceId = tokenData.workspaceId;
      } catch (error) {
        Logger.warn(LogCategory.CALENDAR, 'Failed to parse channel token', error as Error);
      }
    }

    if (!userId || !workspaceId) {
      Logger.warn(LogCategory.CALENDAR, 'Missing user or workspace information in calendar notification');
      return;
    }

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      Logger.warn(LogCategory.CALENDAR, `User ${userId} not found in workspace ${workspaceId}`);
      return;
    }

    switch (notification.eventType) {
      case 'created':
      case 'updated':
        await handleCalendarEventUpdate(userId, workspaceId, notification.eventId);
        break;
      case 'deleted':
        await handleCalendarEventDelete(userId, workspaceId, notification.eventId);
        break;
      default:
        Logger.info(LogCategory.CALENDAR, `Unhandled calendar event type: ${notification.eventType}`);
    }
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, 'Failed to process calendar notification', error as Error);
  }
}

/**
 * Handle calendar event creation/update
 */
async function handleCalendarEventUpdate(userId: string, workspaceId: string, eventId?: string): Promise<void> {
  if (!eventId) return;

  try {
    // Get the updated event from Google Calendar
    const googleEvent = await getCalendarEvent(userId, workspaceId, eventId);
    if (!googleEvent) {
      Logger.warn(LogCategory.CALENDAR, `Google Calendar event ${eventId} not found`);
      return;
    }

    // Check if this is a Tandem-managed event
    const calendarEvent = await findCalendarEventByGoogleId(eventId, workspaceId);
    
    if (calendarEvent) {
      // Update our local record
      await updateCalendarEvent(calendarEvent.id, {
        startTime: googleEvent.start,
        endTime: googleEvent.end,
      }, workspaceId);

      // Check for new conflicts
      const conflicts = await detectConflicts(userId, workspaceId, {
        start: googleEvent.start,
        end: googleEvent.end,
        title: googleEvent.summary,
      }, calendarEvent.id);

      if (conflicts.hasConflicts && !conflicts.canProceed) {
        // Notify user about conflicts using dedicated conflict notification
        const user = await findUserById(userId);
        if (user) {
          const conflictDetails = conflicts.conflicts.map(c => `• ${c.description}`).join('\n');
          await sendCalendarConflictNotification(
            user.slackUserId,
            googleEvent.summary,
            conflictDetails,
            workspaceId,
            userId
          );
        }
      }

      Logger.info(LogCategory.CALENDAR, `Updated calendar event ${eventId} for user ${userId}`);
    } else {
      // This is an external event - check if it conflicts with our scheduled tasks
      const currentTime = new Date();
      const dayEnd = new Date(currentTime);
      dayEnd.setHours(23, 59, 59, 999);

      // Only check conflicts for events today or in the future
      if (googleEvent.start >= currentTime) {
        const conflicts = await detectConflicts(userId, workspaceId, {
          start: googleEvent.start,
          end: googleEvent.end,
          title: googleEvent.summary,
        });

        if (conflicts.hasConflicts) {
          // Notify user about conflicts with their scheduled tasks using dedicated conflict notification
          const user = await findUserById(userId);
          if (user) {
            const conflictDetails = conflicts.conflicts.map(c => `• ${c.description}`).join('\n');
            await sendCalendarConflictNotification(
              user.slackUserId,
              googleEvent.summary,
              `Your new calendar event conflicts with scheduled tasks:\n${conflictDetails}`,
              workspaceId,
              userId
            );
          }
        }
      }

      Logger.info(LogCategory.CALENDAR, `Processed external calendar event ${eventId} for user ${userId}`);
    }
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to handle calendar event update for ${eventId}`, error as Error);
  }
}

/**
 * Handle calendar event deletion
 */
async function handleCalendarEventDelete(userId: string, workspaceId: string, eventId?: string): Promise<void> {
  if (!eventId) return;

  try {
    // Check if this was a Tandem-managed event
    const calendarEvent = await findCalendarEventByGoogleId(eventId, workspaceId);
    
    if (calendarEvent) {
      // Deactivate our local record
      await deactivateCalendarEvent(calendarEvent.id, workspaceId);

      // Update the associated task status back to CONFIRMED
      if (calendarEvent.taskId) {
        const task = await findTaskByIdInWorkspace(calendarEvent.taskId, workspaceId);
        if (task && task.status === 'SCHEDULED') {
          await updateTask(calendarEvent.taskId, { status: 'CONFIRMED' }, workspaceId);

          // Notify user that their task is no longer scheduled
          const user = await findUserById(userId);
          if (user && task) {
            await sendTaskConfirmation(
              user.slackUserId,
              {
                taskId: task.id,
                title: `🗑️ Task Unscheduled`,
                description: `Your task "${task.title}" is no longer scheduled due to calendar event deletion`,
                estimatedDuration: task.estimatedDuration,
                importance: task.importance,
                confidence: 1.0,
              },
              workspaceId,
              userId
            );
          }
        }
      }

      Logger.info(LogCategory.CALENDAR, `Handled deletion of Tandem calendar event ${eventId} for user ${userId}`);
    }
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to handle calendar event deletion for ${eventId}`, error as Error);
  }
}

export default router;