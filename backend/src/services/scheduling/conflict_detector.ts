/**
 * Conflict detection service
 * 
 * This module provides functionality to detect and resolve scheduling conflicts
 * for tasks and calendar events. All operations are workspace-scoped through
 * user context.
 */

import { getCalendarEvents, getUserBusyTimes, checkUserAvailability } from '../google/calendar_reader';
import { getCalendarEventsForUser, checkEventConflicts } from '../../models/calendarEvent';
import { findUserById } from '../../models/user';
import { Logger, LogCategory } from '../../utils/logger';
import type { Task } from '@prisma/client';
import prisma from '../../models/index';

// Conflict types
export enum ConflictType {
  CALENDAR_EVENT = 'calendar_event',
  SCHEDULED_TASK = 'scheduled_task',
  WORK_HOURS = 'work_hours',
  BREAK_TIME = 'break_time',
  OVERLAP = 'overlap',
}

// Conflict severity levels
export enum ConflictSeverity {
  LOW = 'low',       // Minor overlap, can be adjusted
  MEDIUM = 'medium', // Significant overlap, requires attention
  HIGH = 'high',     // Major conflict, must be resolved
  CRITICAL = 'critical', // Complete overlap, cannot proceed
}

// Conflict interface
export interface Conflict {
  id: string;
  type: ConflictType;
  severity: ConflictSeverity;
  description: string;
  conflictingEvent?: {
    id: string;
    title: string;
    start: Date;
    end: Date;
    source: 'google_calendar' | 'tandem_task' | 'proposed';
  };
  suggestedResolution?: {
    action: 'reschedule' | 'shorten' | 'split' | 'ignore';
    newTimeSlot?: {
      start: Date;
      end: Date;
    };
    reason: string;
  };
}

// Conflict detection result
export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflicts: Conflict[];
  canProceed: boolean;
  recommendations: string[];
}

// Time slot interface for conflict analysis
export interface TimeSlot {
  start: Date;
  end: Date;
  title?: string;
  source: 'google_calendar' | 'tandem_task' | 'proposed';
  eventId?: string;
}

/**
 * Generate a unique conflict ID
 */
function generateConflictId(): string {
  return `conflict_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Calculate time overlap between two time slots
 */
function calculateOverlap(slot1: TimeSlot, slot2: TimeSlot): number {
  const overlapStart = Math.max(slot1.start.getTime(), slot2.start.getTime());
  const overlapEnd = Math.min(slot1.end.getTime(), slot2.end.getTime());
  
  if (overlapStart >= overlapEnd) {
    return 0; // No overlap
  }
  
  return overlapEnd - overlapStart; // Overlap in milliseconds
}

/**
 * Determine conflict severity based on overlap percentage
 */
function determineConflictSeverity(overlapMs: number, totalDurationMs: number): ConflictSeverity {
  const overlapPercentage = (overlapMs / totalDurationMs) * 100;
  
  if (overlapPercentage >= 90) return ConflictSeverity.CRITICAL;
  if (overlapPercentage >= 50) return ConflictSeverity.HIGH;
  if (overlapPercentage >= 20) return ConflictSeverity.MEDIUM;
  return ConflictSeverity.LOW;
}

/**
 * Get all time slots for a user within a given period
 */
async function getAllUserTimeSlots(
  userId: string,
  workspaceId: string,
  startTime: Date,
  endTime: Date
): Promise<TimeSlot[]> {
  const slots: TimeSlot[] = [];

  try {
    // Get Google Calendar events
    const calendarEvents = await getCalendarEvents(userId, workspaceId, {
      timeMin: startTime,
      timeMax: endTime,
      showDeleted: false,
    });

    // Convert calendar events to time slots
    calendarEvents.forEach(event => {
      if (event.status === 'confirmed') {
        slots.push({
          start: event.start,
          end: event.end,
          title: event.summary,
          source: 'google_calendar',
          eventId: event.id,
        });
      }
    });

    // Get scheduled Tandem tasks
    const scheduledTasks = await prisma.calendarEvent.findMany({
      where: {
        task: { 
          userId,
          user: { workspaceId }
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
        task: true,
      },
    });
    
    scheduledTasks.forEach(taskEvent => {
      if (taskEvent.isActive && taskEvent.task) {
        slots.push({
          start: taskEvent.startTime,
          end: taskEvent.endTime,
          title: taskEvent.task.title,
          source: 'tandem_task',
          eventId: taskEvent.id,
        });
      }
    });

    return slots.sort((a, b) => a.start.getTime() - b.start.getTime());
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to get user time slots for user ${userId}`, error as Error);
    return [];
  }
}

/**
 * Detect conflicts for a proposed time slot
 */
export async function detectConflicts(
  userId: string,
  workspaceId: string,
  proposedSlot: { start: Date; end: Date; title?: string },
  excludeEventId?: string
): Promise<ConflictDetectionResult> {
  try {
    Logger.info(LogCategory.CALENDAR, `Detecting conflicts for user ${userId} from ${proposedSlot.start.toISOString()} to ${proposedSlot.end.toISOString()}`);

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      throw new Error('User not found in workspace');
    }

    const conflicts: Conflict[] = [];
    const recommendations: string[] = [];

    // Get existing time slots
    const existingSlots = await getAllUserTimeSlots(
      userId,
      workspaceId,
      new Date(proposedSlot.start.getTime() - 24 * 60 * 60 * 1000), // 1 day before
      new Date(proposedSlot.end.getTime() + 24 * 60 * 60 * 1000)     // 1 day after
    );

    // Filter out the excluded event if provided
    const relevantSlots = excludeEventId 
      ? existingSlots.filter(slot => slot.eventId !== excludeEventId)
      : existingSlots;

    // Check for time overlaps
    relevantSlots.forEach(existingSlot => {
      const overlapMs = calculateOverlap(
        { start: proposedSlot.start, end: proposedSlot.end, source: 'proposed' },
        existingSlot
      );

      if (overlapMs > 0) {
        const proposedDurationMs = proposedSlot.end.getTime() - proposedSlot.start.getTime();
        const severity = determineConflictSeverity(overlapMs, proposedDurationMs);

        let conflictType = ConflictType.OVERLAP;
        if (existingSlot.source === 'google_calendar') {
          conflictType = ConflictType.CALENDAR_EVENT;
        } else if (existingSlot.source === 'tandem_task') {
          conflictType = ConflictType.SCHEDULED_TASK;
        }

        const conflict: Conflict = {
          id: generateConflictId(),
          type: conflictType,
          severity,
          description: `Overlaps with "${existingSlot.title}" by ${Math.round(overlapMs / (1000 * 60))} minutes`,
          conflictingEvent: {
            id: existingSlot.eventId || '',
            title: existingSlot.title || 'Untitled Event',
            start: existingSlot.start,
            end: existingSlot.end,
            source: existingSlot.source,
          },
        };

        // Add suggested resolution based on severity
        if (severity === ConflictSeverity.LOW || severity === ConflictSeverity.MEDIUM) {
          // Find next available slot
          const bufferTime = 15 * 60 * 1000; // 15 minutes buffer
          const suggestedStart = new Date(existingSlot.end.getTime() + bufferTime);
          const suggestedEnd = new Date(suggestedStart.getTime() + proposedDurationMs);

          conflict.suggestedResolution = {
            action: 'reschedule',
            newTimeSlot: {
              start: suggestedStart,
              end: suggestedEnd,
            },
            reason: 'Move to next available time slot after the conflicting event',
          };
        } else if (severity === ConflictSeverity.HIGH) {
          conflict.suggestedResolution = {
            action: 'split',
            reason: 'Consider splitting the task into smaller time blocks',
          };
        } else {
          conflict.suggestedResolution = {
            action: 'reschedule',
            reason: 'Complete overlap detected - must choose a different time',
          };
        }

        conflicts.push(conflict);
      }
    });

    // Generate recommendations based on conflicts found
    if (conflicts.length === 0) {
      recommendations.push('No conflicts detected - safe to schedule');
    } else {
      const criticalConflicts = conflicts.filter(c => c.severity === ConflictSeverity.CRITICAL);
      const highConflicts = conflicts.filter(c => c.severity === ConflictSeverity.HIGH);
      
      if (criticalConflicts.length > 0) {
        recommendations.push('Critical conflicts detected - must reschedule to a different time');
      } else if (highConflicts.length > 0) {
        recommendations.push('Significant conflicts detected - consider adjusting the timing');
        recommendations.push('Alternative: Split the task into smaller time blocks');
      } else {
        recommendations.push('Minor conflicts detected - can proceed with caution');
        recommendations.push('Consider adjusting start time by 15-30 minutes if possible');
      }
    }

    const hasConflicts = conflicts.length > 0;
    const canProceed = !conflicts.some(c => c.severity === ConflictSeverity.CRITICAL);

    Logger.info(LogCategory.CALENDAR, `Conflict detection completed for user ${userId}: ${conflicts.length} conflicts found, can proceed: ${canProceed}`);

    return {
      hasConflicts,
      conflicts,
      canProceed,
      recommendations,
    };
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to detect conflicts for user ${userId}`, error as Error);
    
    return {
      hasConflicts: false,
      conflicts: [],
      canProceed: false,
      recommendations: [`Error detecting conflicts: ${error}`],
    };
  }
}

/**
 * Find the next available time slot after conflicts
 */
export async function findNextAvailableSlot(
  userId: string,
  workspaceId: string,
  durationMinutes: number,
  startFromTime?: Date
): Promise<{ start: Date; end: Date } | null> {
  try {
    const startTime = startFromTime || new Date();
    const endTime = new Date(startTime.getTime() + 14 * 24 * 60 * 60 * 1000); // 14 days ahead

    // Get all existing time slots
    const existingSlots = await getAllUserTimeSlots(userId, workspaceId, startTime, endTime);

    // Find gaps between existing appointments
    let currentTime = new Date(Math.max(startTime.getTime(), Date.now()));
    
    // Round up to next 15-minute interval
    const minutes = currentTime.getMinutes();
    const roundedMinutes = Math.ceil(minutes / 15) * 15;
    currentTime.setMinutes(roundedMinutes, 0, 0);

    const durationMs = durationMinutes * 60 * 1000;
    const bufferMs = 15 * 60 * 1000; // 15-minute buffer

    while (currentTime.getTime() + durationMs <= endTime.getTime()) {
      const proposedEnd = new Date(currentTime.getTime() + durationMs);
      
      // Check if this slot conflicts with any existing appointments
      const hasConflict = existingSlots.some(slot => {
        const slotStart = slot.start.getTime() - bufferMs; // Include buffer before
        const slotEnd = slot.end.getTime() + bufferMs;     // Include buffer after
        
        return (currentTime.getTime() < slotEnd && proposedEnd.getTime() > slotStart);
      });

      if (!hasConflict) {
        // Check if it's within reasonable working hours (9 AM - 6 PM)
        const hour = currentTime.getHours();
        const day = currentTime.getDay();
        
        if (day >= 1 && day <= 5 && hour >= 9 && hour < 18) { // Monday-Friday, 9 AM - 6 PM
          return {
            start: new Date(currentTime),
            end: proposedEnd,
          };
        }
      }

      // Move to next 15-minute slot
      currentTime.setTime(currentTime.getTime() + 15 * 60 * 1000);
      
      // Skip weekends - jump to Monday 9 AM if we hit weekend
      if (currentTime.getDay() === 6) { // Saturday
        currentTime.setDate(currentTime.getDate() + 2); // Move to Monday
        currentTime.setHours(9, 0, 0, 0);
      } else if (currentTime.getDay() === 0) { // Sunday
        currentTime.setDate(currentTime.getDate() + 1); // Move to Monday
        currentTime.setHours(9, 0, 0, 0);
      }
      
      // Skip outside working hours - jump to next day 9 AM
      if (currentTime.getHours() >= 18) {
        currentTime.setDate(currentTime.getDate() + 1);
        currentTime.setHours(9, 0, 0, 0);
      } else if (currentTime.getHours() < 9) {
        currentTime.setHours(9, 0, 0, 0);
      }
    }

    return null; // No available slot found
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to find next available slot for user ${userId}`, error as Error);
    return null;
  }
}

/**
 * Batch conflict detection for multiple proposed time slots
 */
export async function detectBatchConflicts(
  userId: string,
  workspaceId: string,
  proposedSlots: Array<{ start: Date; end: Date; title?: string; id?: string }>
): Promise<{ [slotId: string]: ConflictDetectionResult }> {
  const results: { [slotId: string]: ConflictDetectionResult } = {};

  for (let i = 0; i < proposedSlots.length; i++) {
    const slot = proposedSlots[i];
    const slotId = slot.id || `slot_${i}`;
    
    try {
      results[slotId] = await detectConflicts(userId, workspaceId, slot);
    } catch (error) {
      Logger.error(LogCategory.CALENDAR, `Failed to detect conflicts for slot ${slotId}`, error as Error);
      results[slotId] = {
        hasConflicts: false,
        conflicts: [],
        canProceed: false,
        recommendations: [`Error: ${error}`],
      };
    }
  }

  return results;
}

/**
 * Get conflict statistics for a user
 */
export async function getConflictStats(userId: string, workspaceId: string, days: number = 30) {
  try {
    const startTime = new Date();
    const endTime = new Date(startTime.getTime() + days * 24 * 60 * 60 * 1000);

    const slots = await getAllUserTimeSlots(userId, workspaceId, startTime, endTime);
    
    let totalConflicts = 0;
    let overlapMinutes = 0;

    // Check each slot against all others for overlaps
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const overlapMs = calculateOverlap(slots[i], slots[j]);
        if (overlapMs > 0) {
          totalConflicts++;
          overlapMinutes += Math.round(overlapMs / (1000 * 60));
        }
      }
    }

    return {
      totalEvents: slots.length,
      totalConflicts,
      overlapMinutes,
      conflictRate: slots.length > 0 ? (totalConflicts / slots.length) * 100 : 0,
    };
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to get conflict stats for user ${userId}`, error as Error);
    return {
      totalEvents: 0,
      totalConflicts: 0,
      overlapMinutes: 0,
      conflictRate: 0,
    };
  }
}