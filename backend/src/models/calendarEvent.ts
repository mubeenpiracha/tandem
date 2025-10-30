/**
 * CalendarEvent model operations and business logic
 * 
 * This module provides typed database operations for CalendarEvent entities
 * including CRUD operations and business logic validations.
 * Note: CalendarEvent is workspace-scoped via the Task relationship.
 */

import prisma from './index';
import type { CalendarEvent } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface CreateCalendarEventData {
  taskId: string;
  googleEventId: string;
  startTime: Date;
  endTime: Date;
  isActive?: boolean;
}

export interface UpdateCalendarEventData {
  googleEventId?: string;
  startTime?: Date;
  endTime?: Date;
  isActive?: boolean;
}

export interface CalendarEventWithTask extends CalendarEvent {
  task?: any;
}

/**
 * Validate calendar event belongs to workspace (through task-user relationship)
 */
export async function validateCalendarEventWorkspace(eventId: string, workspaceId: string): Promise<boolean> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    include: { 
      task: { 
        include: { user: true } 
      } 
    },
  });

  return event?.task?.user?.workspaceId === workspaceId;
}

/**
 * Create a new calendar event
 */
export async function createCalendarEvent(data: CreateCalendarEventData): Promise<CalendarEvent> {
  try {
    // Validate that the task exists and get its workspace info
    const task = await prisma.task.findUnique({
      where: { id: data.taskId },
      include: { user: true },
    });

    if (!task) {
      throw new Error('Task not found');
    }

    // Validate time range
    if (data.startTime >= data.endTime) {
      throw new Error('Start time must be before end time');
    }

    const event = await prisma.calendarEvent.create({
      data: {
        taskId: data.taskId,
        googleEventId: data.googleEventId,
        startTime: data.startTime,
        endTime: data.endTime,
        isActive: data.isActive ?? true,
      },
    });
    return event;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new Error('Calendar event with this Google event ID already exists');
      }
      if (error.code === 'P2003') {
        throw new Error('Task not found');
      }
    }
    throw error;
  }
}

/**
 * Find calendar event by ID with workspace validation
 */
export async function findCalendarEventById(id: string, workspaceId?: string): Promise<CalendarEvent | null> {
  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    include: {
      task: {
        include: { user: true },
      },
    },
  });

  // Validate workspace if provided
  if (workspaceId && event && event.task?.user?.workspaceId !== workspaceId) {
    return null;
  }

  return event;
}

/**
 * Find calendar event by task ID
 */
export async function findCalendarEventByTaskId(taskId: string, workspaceId?: string): Promise<CalendarEvent | null> {
  const event = await prisma.calendarEvent.findUnique({
    where: { taskId },
    include: {
      task: {
        include: { user: true },
      },
    },
  });

  // Validate workspace if provided
  if (workspaceId && event && event.task?.user?.workspaceId !== workspaceId) {
    return null;
  }

  return event;
}

/**
 * Find calendar event by Google event ID within workspace
 */
export async function findCalendarEventByGoogleId(googleEventId: string, workspaceId: string): Promise<CalendarEvent | null> {
  const event = await prisma.calendarEvent.findUnique({
    where: { googleEventId },
    include: {
      task: {
        include: { user: true },
      },
    },
  });

  // Validate workspace
  if (event && event.task?.user?.workspaceId !== workspaceId) {
    return null;
  }

  return event;
}

/**
 * Get calendar events for a user within a time range (workspace-scoped)
 */
export async function getCalendarEventsForUser(
  userId: string, 
  startTime: Date, 
  endTime: Date,
  workspaceId?: string
): Promise<CalendarEvent[]> {
  return await prisma.calendarEvent.findMany({
    where: {
      task: { 
        userId,
        ...(workspaceId && {
          user: { workspaceId }
        }),
      },
      isActive: true,
      OR: [
        {
          startTime: {
            gte: startTime,
            lte: endTime,
          },
        },
        {
          endTime: {
            gte: startTime,
            lte: endTime,
          },
        },
        {
          AND: [
            { startTime: { lte: startTime } },
            { endTime: { gte: endTime } },
          ],
        },
      ],
    },
    include: {
      task: {
        include: { user: true },
      },
    },
    orderBy: { startTime: 'asc' },
  });
}

/**
 * Get all calendar events for a workspace within a time range
 */
export async function getCalendarEventsForWorkspace(
  workspaceId: string,
  startTime: Date,
  endTime: Date
): Promise<CalendarEvent[]> {
  return await prisma.calendarEvent.findMany({
    where: {
      task: {
        user: { workspaceId },
      },
      isActive: true,
      OR: [
        {
          startTime: {
            gte: startTime,
            lte: endTime,
          },
        },
        {
          endTime: {
            gte: startTime,
            lte: endTime,
          },
        },
        {
          AND: [
            { startTime: { lte: startTime } },
            { endTime: { gte: endTime } },
          ],
        },
      ],
    },
    include: {
      task: {
        include: { user: true },
      },
    },
    orderBy: { startTime: 'asc' },
  });
}

/**
 * Update calendar event (workspace-scoped)
 */
export async function updateCalendarEvent(
  id: string, 
  data: UpdateCalendarEventData,
  workspaceId?: string
): Promise<CalendarEvent> {
  try {
    // Validate workspace if provided
    if (workspaceId && !(await validateCalendarEventWorkspace(id, workspaceId))) {
      throw new Error('Calendar event not found in workspace');
    }

    // Validate time range if updating times
    if (data.startTime && data.endTime && data.startTime >= data.endTime) {
      throw new Error('Start time must be before end time');
    }

    return await prisma.calendarEvent.update({
      where: { id },
      data,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new Error('Calendar event not found');
      }
      if (error.code === 'P2002') {
        throw new Error('Calendar event with this Google event ID already exists');
      }
    }
    throw error;
  }
}

/**
 * Deactivate calendar event (soft delete)
 */
export async function deactivateCalendarEvent(id: string, workspaceId?: string): Promise<CalendarEvent> {
  return await updateCalendarEvent(id, { isActive: false }, workspaceId);
}

/**
 * Delete calendar event (workspace-scoped)
 */
export async function deleteCalendarEvent(id: string, workspaceId?: string): Promise<void> {
  try {
    // Validate workspace if provided
    if (workspaceId && !(await validateCalendarEventWorkspace(id, workspaceId))) {
      throw new Error('Calendar event not found in workspace');
    }

    await prisma.calendarEvent.delete({
      where: { id },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new Error('Calendar event not found');
      }
    }
    throw error;
  }
}

/**
 * Check for time conflicts with existing calendar events for a user
 */
export async function checkEventConflicts(
  userId: string,
  startTime: Date,
  endTime: Date,
  excludeEventId?: string,
  workspaceId?: string
): Promise<CalendarEvent[]> {
  return await prisma.calendarEvent.findMany({
    where: {
      task: { 
        userId,
        ...(workspaceId && {
          user: { workspaceId }
        }),
      },
      isActive: true,
      ...(excludeEventId && {
        id: { not: excludeEventId },
      }),
      OR: [
        {
          startTime: {
            lt: endTime,
          },
          endTime: {
            gt: startTime,
          },
        },
      ],
    },
    include: {
      task: true,
    },
    orderBy: { startTime: 'asc' },
  });
}

/**
 * Get calendar event statistics for a workspace
 */
export async function getCalendarEventStats(workspaceId: string) {
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const [totalEvents, activeEvents, thisWeekEvents] = await Promise.all([
    prisma.calendarEvent.count({
      where: {
        task: {
          user: { workspaceId },
        },
      },
    }),
    prisma.calendarEvent.count({
      where: {
        task: {
          user: { workspaceId },
        },
        isActive: true,
      },
    }),
    prisma.calendarEvent.count({
      where: {
        task: {
          user: { workspaceId },
        },
        isActive: true,
        startTime: {
          gte: weekStart,
          lt: weekEnd,
        },
      },
    }),
  ]);

  return {
    totalEvents,
    activeEvents,
    thisWeekEvents,
  };
}