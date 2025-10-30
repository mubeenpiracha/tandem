/**
 * Google Calendar reading service
 * 
 * This module provides functionality to read calendar events from Google Calendar API
 * for task scheduling and conflict detection. All operations are workspace-scoped
 * through user context.
 */

import { google, calendar_v3 } from 'googleapis';
import { findGoogleTokenByUser } from '../../models/googleToken';
import { findUserById } from '../../models/user';
import { config } from '../../config';
import { Logger, LogCategory } from '../../utils/logger';

// Calendar event interface for our application
export interface CalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: Date;
  end: Date;
  status: 'confirmed' | 'tentative' | 'cancelled';
  attendees?: {
    email: string;
    responseStatus: 'needsAction' | 'declined' | 'tentative' | 'accepted';
  }[];
  location?: string;
  hangoutLink?: string;
}

export interface CalendarListOptions {
  timeMin?: Date;
  timeMax?: Date;
  maxResults?: number;
  orderBy?: 'startTime' | 'updated';
  showDeleted?: boolean;
  singleEvents?: boolean;
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
 * Transform Google Calendar event to our internal format
 */
function transformGoogleEvent(googleEvent: calendar_v3.Schema$Event): CalendarEvent | null {
  if (!googleEvent.id || !googleEvent.start || !googleEvent.end) {
    return null;
  }

  // Handle both dateTime and date formats
  const startDate = googleEvent.start.dateTime 
    ? new Date(googleEvent.start.dateTime)
    : googleEvent.start.date 
    ? new Date(googleEvent.start.date)
    : null;

  const endDate = googleEvent.end.dateTime 
    ? new Date(googleEvent.end.dateTime)
    : googleEvent.end.date 
    ? new Date(googleEvent.end.date)
    : null;

  if (!startDate || !endDate) {
    return null;
  }

  return {
    id: googleEvent.id,
    summary: googleEvent.summary || 'Untitled Event',
    description: googleEvent.description || undefined,
    start: startDate,
    end: endDate,
    status: (googleEvent.status as 'confirmed' | 'tentative' | 'cancelled') || 'confirmed',
    attendees: googleEvent.attendees?.map(attendee => ({
      email: attendee.email || '',
      responseStatus: (attendee.responseStatus as 'needsAction' | 'declined' | 'tentative' | 'accepted') || 'needsAction',
    })),
    location: googleEvent.location || undefined,
    hangoutLink: googleEvent.hangoutLink || undefined,
  };
}

/**
 * Get calendar events for a user within a time range
 */
export async function getCalendarEvents(
  userId: string,
  workspaceId: string,
  options: CalendarListOptions = {}
): Promise<CalendarEvent[]> {
  try {
    const calendar = await createCalendarClient(userId, workspaceId);

    // Set default options
    const listOptions: calendar_v3.Params$Resource$Events$List = {
      calendarId: 'primary',
      timeMin: options.timeMin?.toISOString() || new Date().toISOString(),
      timeMax: options.timeMax?.toISOString(),
      maxResults: Math.min(options.maxResults || 100, 250), // Google API limit is 2500
      orderBy: options.orderBy || 'startTime',
      showDeleted: options.showDeleted || false,
      singleEvents: options.singleEvents ?? true,
    };

    Logger.info(LogCategory.CALENDAR, `Fetching calendar events for user ${userId} from ${listOptions.timeMin} to ${listOptions.timeMax}`);

    const response = await calendar.events.list(listOptions);
    
    if (!response.data.items) {
      return [];
    }

    // Transform and filter valid events
    const events = response.data.items
      .map(transformGoogleEvent)
      .filter((event): event is CalendarEvent => event !== null);

    Logger.info(LogCategory.CALENDAR, `Retrieved ${events.length} calendar events for user ${userId}`);

    return events;
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to get calendar events for user ${userId}`, error as Error);
    throw new Error(`Failed to retrieve calendar events: ${error}`);
  }
}

/**
 * Get a specific calendar event by ID
 */
export async function getCalendarEvent(
  userId: string,
  workspaceId: string,
  eventId: string
): Promise<CalendarEvent | null> {
  try {
    const calendar = await createCalendarClient(userId, workspaceId);

    Logger.info(LogCategory.CALENDAR, `Fetching calendar event ${eventId} for user ${userId}`);

    const response = await calendar.events.get({
      calendarId: 'primary',
      eventId: eventId,
    });

    if (!response.data) {
      return null;
    }

    const event = transformGoogleEvent(response.data);
    
    if (event) {
      Logger.info(LogCategory.CALENDAR, `Retrieved calendar event ${eventId} for user ${userId}`);
    }

    return event;
  } catch (error) {
    if ((error as any).code === 404) {
      Logger.warn(LogCategory.CALENDAR, `Calendar event ${eventId} not found for user ${userId}`);
      return null;
    }
    
    Logger.error(LogCategory.CALENDAR, `Failed to get calendar event ${eventId} for user ${userId}`, error as Error);
    throw new Error(`Failed to retrieve calendar event: ${error}`);
  }
}

/**
 * Check if a user is available during a specific time slot
 */
export async function checkUserAvailability(
  userId: string,
  workspaceId: string,
  startTime: Date,
  endTime: Date
): Promise<{ available: boolean; conflictingEvents: CalendarEvent[] }> {
  try {
    Logger.info(LogCategory.CALENDAR, `Checking availability for user ${userId} from ${startTime.toISOString()} to ${endTime.toISOString()}`);

    // Get events during the requested time period
    const events = await getCalendarEvents(userId, workspaceId, {
      timeMin: startTime,
      timeMax: endTime,
      showDeleted: false,
    });

    // Filter for confirmed events that overlap with requested time
    const conflictingEvents = events.filter(event => {
      if (event.status !== 'confirmed') return false;
      
      // Check for time overlap
      return (
        (event.start < endTime && event.end > startTime) ||
        (event.start <= startTime && event.end >= endTime)
      );
    });

    const available = conflictingEvents.length === 0;

    Logger.info(LogCategory.CALENDAR, `User ${userId} availability: ${available ? 'available' : 'busy'} (${conflictingEvents.length} conflicts)`);

    return {
      available,
      conflictingEvents,
    };
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to check availability for user ${userId}`, error as Error);
    throw new Error(`Failed to check user availability: ${error}`);
  }
}

/**
 * Get busy time slots for a user within a date range
 */
export async function getUserBusyTimes(
  userId: string,
  workspaceId: string,
  startDate: Date,
  endDate: Date
): Promise<{ start: Date; end: Date }[]> {
  try {
    const events = await getCalendarEvents(userId, workspaceId, {
      timeMin: startDate,
      timeMax: endDate,
      showDeleted: false,
    });

    // Extract busy time slots from confirmed events
    const busyTimes = events
      .filter(event => event.status === 'confirmed')
      .map(event => ({
        start: event.start,
        end: event.end,
      }))
      .sort((a, b) => a.start.getTime() - b.start.getTime());

    Logger.info(LogCategory.CALENDAR, `Found ${busyTimes.length} busy time slots for user ${userId}`);

    return busyTimes;
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to get busy times for user ${userId}`, error as Error);
    throw new Error(`Failed to get user busy times: ${error}`);
  }
}

/**
 * Get calendar list for a user
 */
export async function getUserCalendars(
  userId: string,
  workspaceId: string
): Promise<{ id: string; summary: string; primary?: boolean }[]> {
  try {
    const calendar = await createCalendarClient(userId, workspaceId);

    Logger.info(LogCategory.CALENDAR, `Fetching calendar list for user ${userId}`);

    const response = await calendar.calendarList.list({
      minAccessRole: 'reader',
    });

    if (!response.data.items) {
      return [];
    }

    const calendars = response.data.items.map(cal => ({
      id: cal.id || '',
      summary: cal.summary || 'Untitled Calendar',
      primary: cal.primary || false,
    }));

    Logger.info(LogCategory.CALENDAR, `Retrieved ${calendars.length} calendars for user ${userId}`);

    return calendars;
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to get calendar list for user ${userId}`, error as Error);
    throw new Error(`Failed to retrieve user calendars: ${error}`);
  }
}

/**
 * Test Google Calendar API connection for a user
 */
export async function testCalendarConnection(userId: string, workspaceId: string): Promise<boolean> {
  try {
    const calendar = await createCalendarClient(userId, workspaceId);
    
    // Simple test: get calendar list
    await calendar.calendarList.list({ maxResults: 1 });
    
    Logger.info(LogCategory.CALENDAR, `Google Calendar connection test successful for user ${userId}`);
    return true;
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Google Calendar connection test failed for user ${userId}`, error as Error);
    return false;
  }
}