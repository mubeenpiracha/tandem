/**
 * Google Calendar writing service
 * 
 * This module provides functionality to create, update, and delete calendar events
 * in Google Calendar API for task scheduling. All operations are workspace-scoped
 * through user context.
 */

import { google, calendar_v3 } from 'googleapis';
import { findGoogleTokenByUser } from '../../models/googleToken';
import { findUserById } from '../../models/user';
import { config } from '../../config';
import { Logger, LogCategory } from '../../utils/logger';

// Calendar event input interface for creating/updating events
export interface CalendarEventInput {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  location?: string;
  attendees?: string[]; // Array of email addresses
  reminders?: {
    useDefault?: boolean;
    overrides?: Array<{
      method: 'email' | 'popup';
      minutes: number;
    }>;
  };
}

export interface UpdateCalendarEventInput extends Partial<CalendarEventInput> {
  // All fields optional for updates
}

/**
 * Create authenticated Google Calendar client for a user
 */
async function createCalendarClient(userId: string, workspaceId: string): Promise<calendar_v3.Calendar> {
  try {
    // Get user to validate workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      throw new Error('User not found in workspace');
    }

    // Get Google token for the user
    const googleToken = await findGoogleTokenByUser(userId);
    if (!googleToken) {
      throw new Error('No Google token found for user');
    }

    // Check if token is expired
    if (googleToken.expiresAt && googleToken.expiresAt < new Date()) {
      throw new Error('Google token expired');
    }

    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    oauth2Client.setCredentials({
      access_token: googleToken.accessToken,
      refresh_token: googleToken.refreshToken,
      expiry_date: googleToken.expiresAt?.getTime(),
    });

    // Create calendar client
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    Logger.info(LogCategory.CALENDAR, `Created Google Calendar client for user ${userId} in workspace ${workspaceId}`);
    
    return calendar;
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to create Google Calendar client for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Transform our event input to Google Calendar event format
 */
function transformToGoogleEvent(eventInput: CalendarEventInput): calendar_v3.Schema$Event {
  const googleEvent: calendar_v3.Schema$Event = {
    summary: eventInput.summary,
    description: eventInput.description,
    start: {
      dateTime: eventInput.start.toISOString(),
      timeZone: 'UTC', // We'll use UTC for consistency
    },
    end: {
      dateTime: eventInput.end.toISOString(),
      timeZone: 'UTC',
    },
    location: eventInput.location,
  };

  // Add attendees if provided
  if (eventInput.attendees && eventInput.attendees.length > 0) {
    googleEvent.attendees = eventInput.attendees.map(email => ({ email }));
  }

  // Add reminders if provided
  if (eventInput.reminders) {
    googleEvent.reminders = eventInput.reminders;
  } else {
    // Default reminders: 15 minutes before
    googleEvent.reminders = {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 15 },
      ],
    };
  }

  return googleEvent;
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(
  userId: string,
  workspaceId: string,
  eventInput: CalendarEventInput
): Promise<{ eventId: string; htmlLink?: string }> {
  try {
    const calendar = await createCalendarClient(userId, workspaceId);

    // Validate input
    if (eventInput.start >= eventInput.end) {
      throw new Error('Start time must be before end time');
    }

    const googleEvent = transformToGoogleEvent(eventInput);

    Logger.info(LogCategory.CALENDAR, `Creating calendar event "${eventInput.summary}" for user ${userId} from ${eventInput.start.toISOString()} to ${eventInput.end.toISOString()}`);

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: googleEvent,
      sendNotifications: true, // Send email notifications to attendees
    });

    if (!response.data.id) {
      throw new Error('Failed to create calendar event - no event ID returned');
    }

    Logger.info(LogCategory.CALENDAR, `Successfully created calendar event ${response.data.id} for user ${userId}`);

    return {
      eventId: response.data.id!,
      htmlLink: response.data.htmlLink || undefined,
    };
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to create calendar event for user ${userId}`, error as Error);
    throw new Error(`Failed to create calendar event: ${error}`);
  }
}

/**
 * Update an existing calendar event
 */
export async function updateCalendarEvent(
  userId: string,
  workspaceId: string,
  eventId: string,
  eventInput: UpdateCalendarEventInput
): Promise<{ eventId: string; htmlLink?: string }> {
  try {
    const calendar = await createCalendarClient(userId, workspaceId);

    // Validate time range if both times are provided
    if (eventInput.start && eventInput.end && eventInput.start >= eventInput.end) {
      throw new Error('Start time must be before end time');
    }

    // Get current event to merge updates
    const currentEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });

    if (!currentEvent.data) {
      throw new Error('Calendar event not found');
    }

    // Create updated event data
    const updatedEvent: calendar_v3.Schema$Event = {
      ...currentEvent.data,
    };

    // Apply updates
    if (eventInput.summary !== undefined) {
      updatedEvent.summary = eventInput.summary;
    }
    if (eventInput.description !== undefined) {
      updatedEvent.description = eventInput.description;
    }
    if (eventInput.start !== undefined) {
      updatedEvent.start = {
        dateTime: eventInput.start.toISOString(),
        timeZone: 'UTC',
      };
    }
    if (eventInput.end !== undefined) {
      updatedEvent.end = {
        dateTime: eventInput.end.toISOString(),
        timeZone: 'UTC',
      };
    }
    if (eventInput.location !== undefined) {
      updatedEvent.location = eventInput.location;
    }
    if (eventInput.attendees !== undefined) {
      updatedEvent.attendees = eventInput.attendees.map(email => ({ email }));
    }
    if (eventInput.reminders !== undefined) {
      updatedEvent.reminders = eventInput.reminders;
    }

    Logger.info(LogCategory.CALENDAR, `Updating calendar event ${eventId} for user ${userId}`);

    const response = await calendar.events.update({
      calendarId: 'primary',
      eventId: eventId,
      requestBody: updatedEvent,
      sendNotifications: true,
    });

    if (!response.data.id) {
      throw new Error('Failed to update calendar event - no event ID returned');
    }

    Logger.info(LogCategory.CALENDAR, `Successfully updated calendar event ${eventId} for user ${userId}`);

    return {
      eventId: response.data.id!,
      htmlLink: response.data.htmlLink || undefined,
    };
  } catch (error) {
    if ((error as any).code === 404) {
      Logger.warn(LogCategory.CALENDAR, `Calendar event ${eventId} not found for user ${userId}`);
      throw new Error('Calendar event not found');
    }
    
    Logger.error(LogCategory.CALENDAR, `Failed to update calendar event ${eventId} for user ${userId}`, error as Error);
    throw new Error(`Failed to update calendar event: ${error}`);
  }
}

/**
 * Delete a calendar event
 */
export async function deleteCalendarEvent(
  userId: string,
  workspaceId: string,
  eventId: string,
  sendNotifications: boolean = true
): Promise<void> {
  try {
    const calendar = await createCalendarClient(userId, workspaceId);

    Logger.info(LogCategory.CALENDAR, `Deleting calendar event ${eventId} for user ${userId}`);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: eventId,
      sendNotifications,
    });

    Logger.info(LogCategory.CALENDAR, `Successfully deleted calendar event ${eventId} for user ${userId}`);
  } catch (error) {
    if ((error as any).code === 404) {
      Logger.warn(LogCategory.CALENDAR, `Calendar event ${eventId} not found for user ${userId} - may already be deleted`);
      return; // Consider deletion successful if event doesn't exist
    }
    
    Logger.error(LogCategory.CALENDAR, `Failed to delete calendar event ${eventId} for user ${userId}`, error as Error);
    throw new Error(`Failed to delete calendar event: ${error}`);
  }
}

/**
 * Move a calendar event to a new time
 */
export async function moveCalendarEvent(
  userId: string,
  workspaceId: string,
  eventId: string,
  newStart: Date,
  newEnd: Date
): Promise<{ eventId: string; htmlLink?: string }> {
  try {
    if (newStart >= newEnd) {
      throw new Error('Start time must be before end time');
    }

    Logger.info(LogCategory.CALENDAR, `Moving calendar event ${eventId} for user ${userId} to ${newStart.toISOString()}-${newEnd.toISOString()}`);

    return await updateCalendarEvent(userId, workspaceId, eventId, {
      start: newStart,
      end: newEnd,
    });
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to move calendar event ${eventId} for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Add attendees to an existing calendar event
 */
export async function addAttendeesToEvent(
  userId: string,
  workspaceId: string,
  eventId: string,
  newAttendees: string[]
): Promise<{ eventId: string; htmlLink?: string }> {
  try {
    const calendar = await createCalendarClient(userId, workspaceId);

    // Get current event to get existing attendees
    const currentEvent = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });

    if (!currentEvent.data) {
      throw new Error('Calendar event not found');
    }

    // Combine existing and new attendees
    const existingAttendees = currentEvent.data.attendees?.map(a => a.email) || [];
    const allAttendees = [...new Set([...existingAttendees, ...newAttendees])]; // Remove duplicates

    Logger.info(LogCategory.CALENDAR, `Adding ${newAttendees.length} attendees to calendar event ${eventId} for user ${userId}`);

    return await updateCalendarEvent(userId, workspaceId, eventId, {
      attendees: allAttendees.filter((email): email is string => !!email),
    });
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to add attendees to calendar event ${eventId} for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Create a quick calendar event with minimal details
 */
export async function createQuickEvent(
  userId: string,
  workspaceId: string,
  summary: string,
  start: Date,
  durationMinutes: number
): Promise<{ eventId: string; htmlLink?: string }> {
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  return await createCalendarEvent(userId, workspaceId, {
    summary,
    start,
    end,
    description: `Created automatically by Tandem Bot`,
  });
}

/**
 * Batch create multiple calendar events
 */
export async function createMultipleEvents(
  userId: string,
  workspaceId: string,
  events: CalendarEventInput[]
): Promise<{ eventId: string; htmlLink?: string; summary: string }[]> {
  const results: { eventId: string; htmlLink?: string; summary: string }[] = [];
  const errors: { summary: string; error: string }[] = [];

  Logger.info(LogCategory.CALENDAR, `Creating ${events.length} calendar events for user ${userId}`);

  for (const event of events) {
    try {
      const result = await createCalendarEvent(userId, workspaceId, event);
      results.push({
        ...result,
        summary: event.summary,
      });
    } catch (error) {
      const errorMsg = `Failed to create event "${event.summary}": ${error}`;
      errors.push({
        summary: event.summary,
        error: errorMsg,
      });
      Logger.error(LogCategory.CALENDAR, errorMsg, error as Error);
    }
  }

  if (errors.length > 0) {
    Logger.warn(LogCategory.CALENDAR, `${errors.length} events failed to create for user ${userId}`);
  }

  Logger.info(LogCategory.CALENDAR, `Successfully created ${results.length}/${events.length} calendar events for user ${userId}`);

  return results;
}