/**
 * Calendar scheduling job processor
 * 
 * This module processes background jobs for calendar scheduling operations,
 * including task scheduling, rescheduling, and conflict resolution.
 * All operations are workspace-scoped.
 */

import { scheduleTask, findAlternativeTimeSlots, rescheduleTask } from '../services/scheduling/scheduler';
import { detectConflicts, findNextAvailableSlot } from '../services/scheduling/conflict_detector';
import { sendTaskConfirmation } from '../services/slack/dmSender';
import { findTaskByIdInWorkspace, updateTask } from '../models/task';
import { findUserById } from '../models/user';
import { findWorkspaceById } from '../models/workspace';
import { createCalendarEvent } from '../services/google/calendar_writer';
import { createCalendarEvent as createCalendarEventRecord } from '../models/calendarEvent';
import { Logger, LogCategory, createTimer } from '../utils/logger';
import { getCalendarSchedulingQueue } from '../services/redis';

// Job types
export enum CalendarJobType {
  SCHEDULE_TASK = 'schedule_task',
  RESCHEDULE_TASK = 'reschedule_task',
  RESOLVE_CONFLICT = 'resolve_conflict',
  BULK_SCHEDULE = 'bulk_schedule',
}

// Base job data interface
interface BaseJobData {
  workspaceId: string;
  userId: string;
  jobType: CalendarJobType;
}

// Schedule task job data
export interface ScheduleTaskJobData extends BaseJobData {
  jobType: CalendarJobType.SCHEDULE_TASK;
  taskId: string;
  preferredStartTime?: string; // ISO string
  sendConfirmation?: boolean;
}

// Reschedule task job data
export interface RescheduleTaskJobData extends BaseJobData {
  jobType: CalendarJobType.RESCHEDULE_TASK;
  taskId: string;
  newStartTime?: string; // ISO string
  reason: string;
}

// Resolve conflict job data
export interface ResolveConflictJobData extends BaseJobData {
  jobType: CalendarJobType.RESOLVE_CONFLICT;
  taskId: string;
  conflictId: string;
  resolution: 'reschedule' | 'ignore' | 'split';
  newTimeSlot?: {
    start: string; // ISO string
    end: string; // ISO string
  };
}

// Bulk schedule job data
export interface BulkScheduleJobData extends BaseJobData {
  jobType: CalendarJobType.BULK_SCHEDULE;
  taskIds: string[];
  sendConfirmations?: boolean;
}

// Union type for all job data
export type CalendarJobData = 
  | ScheduleTaskJobData 
  | RescheduleTaskJobData 
  | ResolveConflictJobData 
  | BulkScheduleJobData;

// Job result interface
export interface CalendarJobResult {
  success: boolean;
  taskId?: string;
  scheduledTime?: {
    start: Date;
    end: Date;
  };
  calendarEventId?: string;
  calendarEventLink?: string;
  error?: string;
  warnings?: string[];
  metadata?: Record<string, any>;
}

/**
 * Validate common job data requirements
 */
async function validateJobData(data: BaseJobData): Promise<{ user: any; workspace: any }> {
  // Validate workspace exists and is active
  const workspace = await findWorkspaceById(data.workspaceId);
  if (!workspace || !workspace.isActive) {
    throw new Error(`Workspace ${data.workspaceId} not found or inactive`);
  }

  // Validate user exists and belongs to workspace
  const user = await findUserById(data.userId);
  if (!user || user.workspaceId !== data.workspaceId) {
    throw new Error(`User ${data.userId} not found in workspace ${data.workspaceId}`);
  }

  return { user, workspace };
}

/**
 * Process schedule task job
 */
async function processScheduleTaskJob(data: ScheduleTaskJobData): Promise<CalendarJobResult> {
  const timer = createTimer('processScheduleTaskJob', LogCategory.CALENDAR);
  
  try {
    Logger.info(LogCategory.CALENDAR, `Processing schedule task job for task ${data.taskId}`);

    // Validate job data
    const { user, workspace } = await validateJobData(data);

    // Get task details
    const task = await findTaskByIdInWorkspace(data.taskId, data.workspaceId);
    if (!task) {
      throw new Error(`Task ${data.taskId} not found`);
    }

    if (task.status !== 'CONFIRMED') {
      throw new Error(`Task ${data.taskId} is not in CONFIRMED status (current: ${task.status})`);
    }

    // Parse preferred start time if provided
    const preferredStartTime = data.preferredStartTime ? new Date(data.preferredStartTime) : undefined;

    // Schedule the task
    const schedulingResult = await scheduleTask(task, data.userId, data.workspaceId, preferredStartTime);

    if (!schedulingResult.success) {
      // Try to find alternative time slots
      const alternatives = await findAlternativeTimeSlots(task, data.userId, data.workspaceId, 3);
      
      const result: CalendarJobResult = {
        success: false,
        taskId: data.taskId,
        error: schedulingResult.reason || 'Failed to schedule task',
        metadata: {
          alternatives: alternatives.slice(0, 3), // Limit to 3 alternatives
          processingTime: timer.complete(),
        },
      };

      // Send notification about scheduling failure with alternatives
      if (data.sendConfirmation && alternatives.length > 0) {
        try {
          await sendTaskConfirmation(
            user.slackUserId,
            {
              taskId: task.id,
              title: task.title,
              description: `Scheduling failed. Here are alternative time slots: ${alternatives.map(alt => 
                `${alt.start.toLocaleString()} (${Math.round(alt.confidence * 100)}% match)`
              ).join(', ')}`,
              estimatedDuration: task.estimatedDuration,
              importance: task.importance,
              confidence: 0.5,
            },
            data.workspaceId,
            data.userId
          );
        } catch (notificationError) {
          Logger.error(LogCategory.CALENDAR, `Failed to send scheduling failure notification`, notificationError as Error);
        }
      }

      return result;
    }

    // Send confirmation if requested
    if (data.sendConfirmation && schedulingResult.scheduledTime) {
      try {
        await sendTaskConfirmation(
          user.slackUserId,
          {
            taskId: task.id,
            title: task.title,
            description: `Successfully scheduled for ${schedulingResult.scheduledTime.start.toLocaleString()}`,
            estimatedDuration: task.estimatedDuration,
            importance: task.importance,
            confidence: 1.0,
          },
          data.workspaceId,
          data.userId
        );
      } catch (notificationError) {
        Logger.warn(LogCategory.CALENDAR, `Failed to send scheduling confirmation`, notificationError as Error);
      }
    }

    Logger.info(LogCategory.CALENDAR, `Successfully scheduled task ${data.taskId}`);

    return {
      success: true,
      taskId: data.taskId,
      scheduledTime: schedulingResult.scheduledTime,
      calendarEventId: schedulingResult.calendarEventId,
      calendarEventLink: schedulingResult.calendarEventLink,
      metadata: {
        processingTime: timer.complete(),
      },
    };
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to process schedule task job for task ${data.taskId}`, error as Error);
    
    return {
      success: false,
      taskId: data.taskId,
      error: `Failed to schedule task: ${error}`,
      metadata: {
        processingTime: timer.fail(error as Error),
      },
    };
  }
}

/**
 * Process reschedule task job
 */
async function processRescheduleTaskJob(data: RescheduleTaskJobData): Promise<CalendarJobResult> {
  const timer = createTimer('processRescheduleTaskJob', LogCategory.CALENDAR);
  
  try {
    Logger.info(LogCategory.CALENDAR, `Processing reschedule task job for task ${data.taskId}`);

    // Validate job data
    const { user, workspace } = await validateJobData(data);

    // Get task details
    const task = await findTaskByIdInWorkspace(data.taskId, data.workspaceId);
    if (!task) {
      throw new Error(`Task ${data.taskId} not found`);
    }

    if (task.status !== 'SCHEDULED') {
      throw new Error(`Task ${data.taskId} is not in SCHEDULED status (current: ${task.status})`);
    }

    // Parse new start time if provided
    const newStartTime = data.newStartTime ? new Date(data.newStartTime) : undefined;

    // Reschedule the task
    const reschedulingResult = await rescheduleTask(data.taskId, data.userId, data.workspaceId, newStartTime);

    if (!reschedulingResult.success) {
      return {
        success: false,
        taskId: data.taskId,
        error: reschedulingResult.reason || 'Failed to reschedule task',
        metadata: {
          reason: data.reason,
          processingTime: timer.complete(),
        },
      };
    }

    Logger.info(LogCategory.CALENDAR, `Successfully rescheduled task ${data.taskId}`);

    return {
      success: true,
      taskId: data.taskId,
      scheduledTime: reschedulingResult.scheduledTime,
      calendarEventId: reschedulingResult.calendarEventId,
      calendarEventLink: reschedulingResult.calendarEventLink,
      metadata: {
        reason: data.reason,
        processingTime: timer.complete(),
      },
    };
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to process reschedule task job for task ${data.taskId}`, error as Error);
    
    return {
      success: false,
      taskId: data.taskId,
      error: `Failed to reschedule task: ${error}`,
      metadata: {
        reason: data.reason,
        processingTime: timer.fail(error as Error),
      },
    };
  }
}

/**
 * Process resolve conflict job
 */
async function processResolveConflictJob(data: ResolveConflictJobData): Promise<CalendarJobResult> {
  const timer = createTimer('processResolveConflictJob', LogCategory.CALENDAR);
  
  try {
    Logger.info(LogCategory.CALENDAR, `Processing resolve conflict job for task ${data.taskId}, conflict ${data.conflictId}`);

    // Validate job data
    const { user, workspace } = await validateJobData(data);

    // Get task details
    const task = await findTaskByIdInWorkspace(data.taskId, data.workspaceId);
    if (!task) {
      throw new Error(`Task ${data.taskId} not found`);
    }

    let result: CalendarJobResult = {
      success: false,
      taskId: data.taskId,
      error: 'Unknown resolution action',
    };

    switch (data.resolution) {
      case 'reschedule':
        if (data.newTimeSlot) {
          const newStart = new Date(data.newTimeSlot.start);
          const newEnd = new Date(data.newTimeSlot.end);
          
          // Check for new conflicts
          const conflictCheck = await detectConflicts(data.userId, data.workspaceId, {
            start: newStart,
            end: newEnd,
            title: task.title,
          });

          if (conflictCheck.hasConflicts && !conflictCheck.canProceed) {
            throw new Error('New time slot still has conflicts');
          }

          // Proceed with rescheduling
          const rescheduleResult = await rescheduleTask(data.taskId, data.userId, data.workspaceId, newStart);
          result = {
            success: rescheduleResult.success,
            taskId: data.taskId,
            scheduledTime: rescheduleResult.scheduledTime,
            calendarEventId: rescheduleResult.calendarEventId,
            calendarEventLink: rescheduleResult.calendarEventLink,
            error: rescheduleResult.success ? undefined : rescheduleResult.reason,
          };
        } else {
          // Find next available slot automatically
          const nextSlot = await findNextAvailableSlot(data.userId, data.workspaceId, task.estimatedDuration);
          if (nextSlot) {
            const rescheduleResult = await rescheduleTask(data.taskId, data.userId, data.workspaceId, nextSlot.start);
            result = {
              success: rescheduleResult.success,
              taskId: data.taskId,
              scheduledTime: rescheduleResult.scheduledTime,
              calendarEventId: rescheduleResult.calendarEventId,
              calendarEventLink: rescheduleResult.calendarEventLink,
              error: rescheduleResult.success ? undefined : rescheduleResult.reason,
            };
          } else {
            throw new Error('No available time slot found');
          }
        }
        break;

      case 'ignore':
        // Just mark the conflict as resolved by updating task metadata
        await updateTask(data.taskId, { 
          // Add metadata about ignored conflict
        }, data.workspaceId);
        
        result = {
          success: true,
          taskId: data.taskId,
          metadata: {
            action: 'ignored_conflict',
            conflictId: data.conflictId,
          },
        };
        break;

      case 'split':
        // Split task into smaller time blocks (simplified implementation)
        const halfDuration = Math.ceil(task.estimatedDuration / 2);
        
        // This would involve creating multiple shorter tasks
        // For now, just find a slot for half the duration
        const shortSlot = await findNextAvailableSlot(data.userId, data.workspaceId, halfDuration);
        
        if (shortSlot) {
          result = {
            success: true,
            taskId: data.taskId,
            metadata: {
              action: 'split_task',
              suggestedDuration: halfDuration,
              suggestedSlot: shortSlot,
            },
          };
        } else {
          throw new Error('No available time slot found for split task');
        }
        break;
    }

    result.metadata = {
      ...result.metadata,
      conflictId: data.conflictId,
      resolution: data.resolution,
      processingTime: timer.complete(),
    };

    Logger.info(LogCategory.CALENDAR, `Successfully resolved conflict for task ${data.taskId}`);
    return result;
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to process resolve conflict job for task ${data.taskId}`, error as Error);
    
    return {
      success: false,
      taskId: data.taskId,
      error: `Failed to resolve conflict: ${error}`,
      metadata: {
        conflictId: data.conflictId,
        resolution: data.resolution,
        processingTime: timer.fail(error as Error),
      },
    };
  }
}

/**
 * Process bulk schedule job
 */
async function processBulkScheduleJob(data: BulkScheduleJobData): Promise<CalendarJobResult> {
  const timer = createTimer('processBulkScheduleJob', LogCategory.CALENDAR);
  
  try {
    Logger.info(LogCategory.CALENDAR, `Processing bulk schedule job for ${data.taskIds.length} tasks`);

    // Validate job data
    const { user, workspace } = await validateJobData(data);

    const results: { taskId: string; success: boolean; error?: string }[] = [];
    let successCount = 0;

    // Process each task sequentially to avoid conflicts
    for (const taskId of data.taskIds) {
      try {
        const scheduleJobData: ScheduleTaskJobData = {
          jobType: CalendarJobType.SCHEDULE_TASK,
          workspaceId: data.workspaceId,
          userId: data.userId,
          taskId,
          sendConfirmation: false, // Don't send individual confirmations for bulk
        };

        const taskResult = await processScheduleTaskJob(scheduleJobData);
        results.push({
          taskId,
          success: taskResult.success,
          error: taskResult.error,
        });

        if (taskResult.success) {
          successCount++;
        }
      } catch (error) {
        results.push({
          taskId,
          success: false,
          error: `${error}`,
        });
      }
    }

    // Send bulk confirmation if requested
    if (data.sendConfirmations && successCount > 0) {
      try {
        await sendTaskConfirmation(
          user.slackUserId,
          {
            taskId: 'bulk',
            title: 'Bulk Scheduling Complete',
            description: `Successfully scheduled ${successCount} out of ${data.taskIds.length} tasks`,
            estimatedDuration: 0,
            importance: 'MEDIUM',
            confidence: successCount / data.taskIds.length,
          },
          data.workspaceId,
          data.userId
        );
      } catch (notificationError) {
        Logger.warn(LogCategory.CALENDAR, `Failed to send bulk scheduling confirmation`, notificationError as Error);
      }
    }

    Logger.info(LogCategory.CALENDAR, `Bulk scheduling completed: ${successCount}/${data.taskIds.length} tasks scheduled`);

    return {
      success: successCount > 0,
      metadata: {
        totalTasks: data.taskIds.length,
        successfulTasks: successCount,
        failedTasks: data.taskIds.length - successCount,
        results,
        processingTime: timer.complete(),
      },
    };
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to process bulk schedule job`, error as Error);
    
    return {
      success: false,
      error: `Failed to bulk schedule: ${error}`,
      metadata: {
        totalTasks: data.taskIds.length,
        processingTime: timer.fail(error as Error),
      },
    };
  }
}

/**
 * Main job processor function
 */
async function processCalendarSchedulingJob(data: CalendarJobData): Promise<CalendarJobResult> {
  try {
    switch (data.jobType) {
      case CalendarJobType.SCHEDULE_TASK:
        return await processScheduleTaskJob(data as ScheduleTaskJobData);
      case CalendarJobType.RESCHEDULE_TASK:
        return await processRescheduleTaskJob(data as RescheduleTaskJobData);
      case CalendarJobType.RESOLVE_CONFLICT:
        return await processResolveConflictJob(data as ResolveConflictJobData);
      case CalendarJobType.BULK_SCHEDULE:
        return await processBulkScheduleJob(data as BulkScheduleJobData);
      default:
        throw new Error(`Unknown calendar job type: ${(data as any).jobType}`);
    }
  } catch (error) {
    Logger.error(LogCategory.CALENDAR, `Failed to process calendar scheduling job`, error as Error);
    return {
      success: false,
      error: `Failed to process job: ${error}`,
    };
  }
}

/**
 * Start calendar scheduling worker
 */
export async function startCalendarSchedulingWorker(): Promise<void> {
  console.log('🗓️ Starting calendar scheduling worker...');

  // Process jobs continuously
  setInterval(async () => {
    try {
      const job = await getCalendarSchedulingQueue().getNextJob();
      if (job) {
        const result = await processCalendarSchedulingJob(job.data);
        
        if (result.success) {
          await getCalendarSchedulingQueue().completeJob(job.id, result);
        } else {
          await getCalendarSchedulingQueue().failJob(job.id, result.error || 'Unknown error');
        }
      }
    } catch (error) {
      console.error('Calendar scheduling worker error:', error);
    }
  }, 2000); // Check for jobs every 2 seconds

  console.log('✅ Calendar scheduling worker started');
}

/**
 * Add calendar scheduling job to queue
 */
export async function addCalendarSchedulingJob(data: CalendarJobData, priority: number = 0): Promise<string> {
  try {
    const jobId = await getCalendarSchedulingQueue().addJob(`calendar-${data.jobType}`, data, { priority });
    console.log(`📅 Added calendar scheduling job ${jobId} (${data.jobType})`);
    return jobId;
  } catch (error) {
    console.error('Failed to add calendar scheduling job:', error);
    throw error;
  }
}

/**
 * Get calendar scheduling queue statistics
 */
export async function getCalendarSchedulingStats() {
  try {
    return await getCalendarSchedulingQueue().getStats();
  } catch (error) {
    console.error('Failed to get calendar scheduling stats:', error);
    return {
      pending: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
      total: 0,
    };
  }
}