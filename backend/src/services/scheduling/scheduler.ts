/**
 * Intelligent scheduling service
 * 
 * This module provides AI-powered intelligent scheduling for tasks, taking into account
 * user preferences, calendar availability, task priority, and workspace boundaries.
 */

import { getCalendarEvents, getUserBusyTimes, checkUserAvailability } from '../google/calendar_reader';
import { createCalendarEvent } from '../google/calendar_writer';
import { findUserById } from '../../models/user';
import { createCalendarEvent as createCalendarEventRecord } from '../../models/calendarEvent';
import { updateTask } from '../../models/task';
import { config } from '../../config';
import { Logger, LogCategory } from '../../utils/logger';
import type { Task, TaskImportance, TaskUrgency } from '@prisma/client';
import prisma from '../../models/index';

// Scheduling preferences interface
export interface SchedulingPreferences {
  workingHours: {
    [key: string]: { start: string; end: string } | null; // 'monday' -> { start: '09:00', end: '17:00' }
  };
  breakTimes: {
    [key: string]: { start: string; end: string }; // 'lunch' -> { start: '12:00', end: '13:00' }
  };
  timezone: string;
  preferredTaskDuration?: number; // Default task duration in minutes
  bufferBetweenTasks?: number; // Minutes between tasks
}

// Scheduling result interface
export interface SchedulingResult {
  success: boolean;
  scheduledTime?: {
    start: Date;
    end: Date;
  };
  calendarEventId?: string;
  calendarEventLink?: string;
  reason?: string;
  suggestions?: {
    start: Date;
    end: Date;
    confidence: number;
  }[];
}

// Time slot interface for availability analysis
export interface TimeSlot {
  start: Date;
  end: Date;
  available: boolean;
  reason?: string;
}

/**
 * Get default scheduling preferences
 */
function getDefaultPreferences(): SchedulingPreferences {
  return {
    workingHours: {
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
    timezone: 'UTC',
    preferredTaskDuration: 60, // 1 hour default
    bufferBetweenTasks: 15, // 15 minutes buffer
  };
}

/**
 * Load user scheduling preferences
 */
async function loadUserPreferences(userId: string, workspaceId: string): Promise<SchedulingPreferences> {
  try {
    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      throw new Error('User not found in workspace');
    }

    // Try to get user's work preferences
    const workPreferences = await prisma.workPreferences.findUnique({
      where: { userId },
    });
    
    if (workPreferences) {
      return {
        workingHours: workPreferences.weeklyHours as any,
        breakTimes: workPreferences.breakTimes as any,
        timezone: workPreferences.timezone,
        preferredTaskDuration: 60, // Could be extended to store in preferences
        bufferBetweenTasks: config.calendar.bufferBetweenTasks,
      };
    }

    // Return defaults if no preferences found
    return getDefaultPreferences();
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to load preferences for user ${userId}`, error as Error);
    return getDefaultPreferences();
  }
}

/**
 * Calculate task priority score for scheduling order
 */
function calculatePriorityScore(task: Task): number {
  let score = 0;

  // Importance scoring
  switch (task.importance) {
    case 'HIGH':
      score += 100;
      break;
    case 'MEDIUM':
      score += 50;
      break;
    case 'LOW':
      score += 20;
      break;
  }

  // Urgency scoring (derived from due date)
  switch (task.derivedUrgency) {
    case 'HIGH':
      score += 80;
      break;
    case 'MEDIUM':
      score += 40;
      break;
    case 'LOW':
      score += 10;
      break;
  }

  // Due date proximity (if available)
  if (task.dueDate) {
    const daysUntilDue = Math.ceil((task.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysUntilDue <= 1) score += 50;
    else if (daysUntilDue <= 3) score += 30;
    else if (daysUntilDue <= 7) score += 15;
  }

  return score;
}

/**
 * Check if a time slot is within working hours
 */
function isWithinWorkingHours(
  timeSlot: { start: Date; end: Date },
  preferences: SchedulingPreferences
): boolean {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = dayNames[timeSlot.start.getDay()];
  
  const workingHours = preferences.workingHours[dayName];
  if (!workingHours) {
    return false; // Not a working day
  }

  // Convert working hours to today's date for comparison
  const startDate = new Date(timeSlot.start);
  const endDate = new Date(timeSlot.start);
  
  const [startHour, startMin] = workingHours.start.split(':').map(Number);
  const [endHour, endMin] = workingHours.end.split(':').map(Number);
  
  startDate.setHours(startHour, startMin, 0, 0);
  endDate.setHours(endHour, endMin, 0, 0);

  return timeSlot.start >= startDate && timeSlot.end <= endDate;
}

/**
 * Check if a time slot conflicts with break times
 */
function isConflictingWithBreaks(
  timeSlot: { start: Date; end: Date },
  preferences: SchedulingPreferences
): boolean {
  for (const [, breakTime] of Object.entries(preferences.breakTimes)) {
    const breakStart = new Date(timeSlot.start);
    const breakEnd = new Date(timeSlot.start);
    
    const [startHour, startMin] = breakTime.start.split(':').map(Number);
    const [endHour, endMin] = breakTime.end.split(':').map(Number);
    
    breakStart.setHours(startHour, startMin, 0, 0);
    breakEnd.setHours(endHour, endMin, 0, 0);

    // Check for overlap
    if (timeSlot.start < breakEnd && timeSlot.end > breakStart) {
      return true;
    }
  }
  return false;
}

/**
 * Generate potential time slots for a task
 */
async function generateTimeSlots(
  userId: string,
  workspaceId: string,
  durationMinutes: number,
  preferences: SchedulingPreferences,
  startFromDate?: Date
): Promise<TimeSlot[]> {
  const slots: TimeSlot[] = [];
  const startDate = startFromDate || new Date();
  
  // Look ahead up to 14 days
  const endDate = new Date(startDate.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Get busy times for the period
  const busyTimes = await getUserBusyTimes(userId, workspaceId, startDate, endDate);

  // Generate slots day by day
  const currentDate = new Date(startDate);
  while (currentDate < endDate) {
    const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][currentDate.getDay()];
    const workingHours = preferences.workingHours[dayName];

    if (workingHours) {
      // Create working hours for this day
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      
      const [startHour, startMin] = workingHours.start.split(':').map(Number);
      const [endHour, endMin] = workingHours.end.split(':').map(Number);
      
      dayStart.setHours(startHour, startMin, 0, 0);
      dayEnd.setHours(endHour, endMin, 0, 0);

      // If it's today, start from current time if later than work start
      if (currentDate.toDateString() === new Date().toDateString()) {
        const now = new Date();
        if (now > dayStart) {
          dayStart.setTime(now.getTime());
          // Round up to next 15-minute interval
          const minutes = dayStart.getMinutes();
          const roundedMinutes = Math.ceil(minutes / 15) * 15;
          dayStart.setMinutes(roundedMinutes, 0, 0);
        }
      }

      // Generate 30-minute slots throughout the day
      const slotDuration = 30; // minutes
      let slotStart = new Date(dayStart);

      while (slotStart.getTime() + durationMinutes * 60 * 1000 <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000);
        
        const timeSlot = { start: new Date(slotStart), end: new Date(slotEnd) };
        
        // Check availability
        let available = true;
        let reason = '';

        // Check against busy times
        const isBusy = busyTimes.some(busy => 
          timeSlot.start < busy.end && timeSlot.end > busy.start
        );
        if (isBusy) {
          available = false;
          reason = 'Conflicts with existing calendar event';
        }

        // Check against break times
        if (available && isConflictingWithBreaks(timeSlot, preferences)) {
          available = false;
          reason = 'Conflicts with break time';
        }

        slots.push({
          ...timeSlot,
          available,
          reason,
        });

        // Move to next slot
        slotStart.setTime(slotStart.getTime() + slotDuration * 60 * 1000);
      }
    }

    // Move to next day
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(0, 0, 0, 0);
  }

  return slots;
}

/**
 * Find the best time slot for a task
 */
async function findBestTimeSlot(
  userId: string,
  workspaceId: string,
  task: Task,
  preferences: SchedulingPreferences
): Promise<{ start: Date; end: Date; confidence: number } | null> {
  const durationMinutes = task.estimatedDuration;
  const preferredDate = task.dueDate || new Date();

  // Generate available time slots
  const slots = await generateTimeSlots(userId, workspaceId, durationMinutes, preferences, new Date());
  
  // Filter to available slots only
  const availableSlots = slots.filter(slot => slot.available);
  
  if (availableSlots.length === 0) {
    return null;
  }

  // Score each slot based on various factors
  const scoredSlots = availableSlots.map(slot => {
    let score = 100; // Base score
    let confidence = 0.8; // Base confidence

    // Prefer earlier in the day for high importance tasks
    if (task.importance === 'HIGH') {
      const hour = slot.start.getHours();
      if (hour >= 9 && hour <= 11) score += 20; // Morning boost
    }

    // Prefer slots closer to due date
    if (task.dueDate) {
      const daysFromDue = Math.abs((slot.start.getTime() - task.dueDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysFromDue <= 1) score += 30;
      else if (daysFromDue <= 3) score += 15;
      else score -= daysFromDue * 2;
    }

    // Prefer sooner rather than later for urgent tasks
    if (task.derivedUrgency === 'HIGH') {
      const hoursFromNow = (slot.start.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursFromNow <= 24) score += 25;
      else if (hoursFromNow <= 72) score += 10;
    }

    // Avoid late Friday slots for non-urgent tasks
    if (task.derivedUrgency !== 'HIGH' && slot.start.getDay() === 5 && slot.start.getHours() >= 15) {
      score -= 10;
    }

    // Calculate confidence based on various factors
    confidence = Math.min(1.0, confidence + (score - 100) / 100);
    confidence = Math.max(0.1, confidence);

    return {
      start: slot.start,
      end: slot.end,
      score,
      confidence,
    };
  });

  // Sort by score (highest first)
  scoredSlots.sort((a, b) => b.score - a.score);

  // Return the best slot
  return scoredSlots[0] || null;
}

/**
 * Schedule a task in the user's calendar
 */
export async function scheduleTask(
  task: Task,
  userId: string,
  workspaceId: string,
  preferredStartTime?: Date
): Promise<SchedulingResult> {
  try {
    Logger.info(LogCategory.CALENDAR, `Attempting to schedule task "${task.title}" for user ${userId}`);

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      return {
        success: false,
        reason: 'User not found in workspace',
      };
    }

    // Load user preferences
    const preferences = await loadUserPreferences(userId, workspaceId);

    // If preferred time is provided, check availability
    if (preferredStartTime) {
      const preferredEnd = new Date(preferredStartTime.getTime() + task.estimatedDuration * 60 * 1000);
      const availabilityCheck = await checkUserAvailability(userId, workspaceId, preferredStartTime, preferredEnd);
      
      if (availabilityCheck.available && isWithinWorkingHours({ start: preferredStartTime, end: preferredEnd }, preferences)) {
        const calendarResult = await createCalendarEvent(userId, workspaceId, {
          summary: task.title,
          description: task.description || `Task: ${task.title}\nEstimated Duration: ${task.estimatedDuration} minutes\nImportance: ${task.importance}`,
          start: preferredStartTime,
          end: preferredEnd,
        });

        // Create calendar event record in our database
        const calendarEventRecord = await createCalendarEventRecord({
          taskId: task.id,
          googleEventId: calendarResult.eventId,
          startTime: preferredStartTime,
          endTime: preferredEnd,
        });

        // Update task status to scheduled
        await updateTask(task.id, { status: 'SCHEDULED' }, workspaceId);

        Logger.info(LogCategory.CALENDAR, `Successfully scheduled task "${task.title}" at preferred time for user ${userId}`);

        return {
          success: true,
          scheduledTime: {
            start: preferredStartTime,
            end: preferredEnd,
          },
          calendarEventId: calendarResult.eventId,
          calendarEventLink: calendarResult.htmlLink,
        };
      }
    }

    // Find best available time slot
    const bestSlot = await findBestTimeSlot(userId, workspaceId, task, preferences);
    
    if (!bestSlot) {
      Logger.warn(LogCategory.CALENDAR, `No available time slots found for task "${task.title}" for user ${userId}`);
      return {
        success: false,
        reason: 'No available time slots found in the next 14 days',
      };
    }

    // Create calendar event
    const calendarResult = await createCalendarEvent(userId, workspaceId, {
      summary: task.title,
      description: task.description || `Task: ${task.title}\nEstimated Duration: ${task.estimatedDuration} minutes\nImportance: ${task.importance}`,
      start: bestSlot.start,
      end: bestSlot.end,
    });

    // Create calendar event record in our database
    const calendarEventRecord = await createCalendarEventRecord({
      taskId: task.id,
      googleEventId: calendarResult.eventId,
      startTime: bestSlot.start,
      endTime: bestSlot.end,
    });

    // Update task status to scheduled
    await updateTask(task.id, { status: 'SCHEDULED' }, workspaceId);

    Logger.info(LogCategory.CALENDAR, `Successfully scheduled task "${task.title}" for user ${userId} from ${bestSlot.start.toISOString()} to ${bestSlot.end.toISOString()}`);

    return {
      success: true,
      scheduledTime: {
        start: bestSlot.start,
        end: bestSlot.end,
      },
      calendarEventId: calendarResult.eventId,
      calendarEventLink: calendarResult.htmlLink,
    };
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to schedule task "${task.title}" for user ${userId}`, error as Error);
    
    return {
      success: false,
      reason: `Failed to schedule task: ${error}`,
    };
  }
}

/**
 * Find alternative time slots for a task
 */
export async function findAlternativeTimeSlots(
  task: Task,
  userId: string,
  workspaceId: string,
  count: number = 3
): Promise<{ start: Date; end: Date; confidence: number }[]> {
  try {
    const preferences = await loadUserPreferences(userId, workspaceId);
    const slots = await generateTimeSlots(userId, workspaceId, task.estimatedDuration, preferences);
    
    const availableSlots = slots.filter(slot => slot.available);
    
    // Score and sort slots
    const scoredSlots = availableSlots.map(slot => {
      let score = 100;
      let confidence = 0.8;

      // Similar scoring logic as findBestTimeSlot
      if (task.importance === 'HIGH') {
        const hour = slot.start.getHours();
        if (hour >= 9 && hour <= 11) score += 20;
      }

      if (task.dueDate) {
        const daysFromDue = Math.abs((slot.start.getTime() - task.dueDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysFromDue <= 1) score += 30;
        else if (daysFromDue <= 3) score += 15;
        else score -= daysFromDue * 2;
      }

      confidence = Math.min(1.0, confidence + (score - 100) / 100);
      confidence = Math.max(0.1, confidence);

      return {
        start: slot.start,
        end: slot.end,
        confidence,
      };
    });

    return scoredSlots
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, count);
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to find alternative time slots for task "${task.title}"`, error as Error);
    return [];
  }
}

/**
 * Reschedule an existing task
 */
export async function rescheduleTask(
  taskId: string,
  userId: string,
  workspaceId: string,
  newStartTime?: Date
): Promise<SchedulingResult> {
  try {
    // Implementation would involve updating the existing calendar event
    // This is a placeholder for the full implementation
    Logger.info(LogCategory.CALENDAR, `Rescheduling task ${taskId} for user ${userId}`);
    
    // TODO: Implement full rescheduling logic
    return {
      success: false,
      reason: 'Rescheduling not yet implemented',
    };
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to reschedule task ${taskId}`, error as Error);
    return {
      success: false,
      reason: `Failed to reschedule: ${error}`,
    };
  }
}

/**
 * Get scheduling statistics for a workspace
 */
export async function getSchedulingStats(workspaceId: string) {
  try {
    // This would collect various scheduling metrics
    // Placeholder implementation
    return {
      totalTasksScheduled: 0,
      averageSchedulingTime: 0,
      successRate: 0,
    };
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to get scheduling stats for workspace ${workspaceId}`, error as Error);
    return {
      totalTasksScheduled: 0,
      averageSchedulingTime: 0,
      successRate: 0,
    };
  }
}