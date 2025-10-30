/**
 * Task CRUD operations routes
 * 
 * This module provides REST API endpoints for task management
 * including creating, reading, updating, and deleting tasks.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  createTask,
  findTaskByIdInWorkspace,
  findTasksByUser,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getPendingTasks,
  getConfirmedTasks,
  getOverdueTasks,
} from '../models/task';
import { findCalendarEventByTaskId } from '../models/calendarEvent';
import { findAlternativeTimeSlots } from '../services/scheduling/scheduler';
import { detectConflicts } from '../services/scheduling/conflict_detector';
import { addCalendarSchedulingJob, CalendarJobType } from '../jobs/calendar_scheduling';
import type { TaskStatus, TaskImportance } from '@prisma/client';

const router = Router();

// Validation schemas
const CreateTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  estimatedDuration: z.number().int().min(5).max(480),
  importance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  slackMessageId: z.string().uuid().optional(),
});

const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  dueDate: z.string().datetime().optional(),
  estimatedDuration: z.number().int().min(5).max(480).optional(),
  importance: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
});

const UpdateTaskStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'DISMISSED']),
});

const ScheduleTaskSchema = z.object({
  preferredStartTime: z.string().datetime().optional(),
  sendConfirmation: z.boolean().optional(),
});

const RescheduleTaskSchema = z.object({
  newStartTime: z.string().datetime().optional(),
  reason: z.string().min(1).max(500),
});

const CheckConflictsSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime(),
  title: z.string().optional(),
});

const TaskFilterSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'DISMISSED']).optional(),
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
  offset: z.string().transform(Number).pipe(z.number().int().min(0)).optional(),
});

// Middleware to extract userId from auth token and validate workspace
// In a real implementation, this would decode JWT token
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // TODO: Implement proper JWT authentication
  // For now, use a test user ID from headers or hardcode
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }
  
  // Validate workspace context exists
  if (!req.workspace) {
    console.error(`[User: ${userId}] Workspace context missing in task route`);
    res.status(400).json({ error: 'Workspace context required' });
    return;
  }
  
  (req as any).userId = userId;
  next();
}

/**
 * GET /tasks
 * Get user's tasks with optional filtering
 */
router.get('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    
    // Validate query parameters
    const filterResult = TaskFilterSchema.safeParse(req.query);
    if (!filterResult.success) {
      res.status(400).json({ 
        error: 'Invalid query parameters', 
        details: filterResult.error.issues 
      });
      return;
    }
    
    const filters = filterResult.data;
    
    // Get tasks with pagination
    const result = await findTasksByUser(userId, req.workspace!.id, {
      status: filters.status,
      limit: filters.limit || 20,
      offset: filters.offset || 0,
    });
    
    res.status(200).json({
      tasks: result.tasks,
      pagination: {
        total: result.total,
        limit: filters.limit || 20,
        offset: filters.offset || 0,
        hasNext: (filters.offset || 0) + (filters.limit || 20) < result.total,
      },
    });
    
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks
 * Create a new task
 */
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    
    // Validate request body
    const validationResult = CreateTaskSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Invalid task data', 
        details: validationResult.error.issues 
      });
      return;
    }
    
    const taskData = validationResult.data;
    
    // Create task
    const task = await createTask({
      userId,
      title: taskData.title,
      description: taskData.description || '',
      dueDate: taskData.dueDate ? new Date(taskData.dueDate) : undefined,
      estimatedDuration: taskData.estimatedDuration,
      importance: taskData.importance as TaskImportance || 'MEDIUM',
      slackMessageId: taskData.slackMessageId,
    });
    
    console.log(`✅ [Workspace: ${req.workspace!.slackTeamName}] Task created: ${task.title} (ID: ${task.id}) for user ${userId}`);
    
    res.status(201).json(task);
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/:taskId
 * Get specific task by ID
 */
router.get('/:taskId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;
    
    // Validate UUID format
    if (!taskId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      res.status(400).json({ error: 'Invalid task ID format' });
      return;
    }
    
    const task = await findTaskByIdInWorkspace(taskId, req.workspace!.id);
    
    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    // Check if task belongs to user
    if (task.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    res.status(200).json(task);
    
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /tasks/:taskId
 * Update task data
 */
router.put('/:taskId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;
    
    // Validate UUID format
    if (!taskId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      res.status(400).json({ error: 'Invalid task ID format' });
      return;
    }
    
    // Validate request body
    const validationResult = UpdateTaskSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Invalid task data', 
        details: validationResult.error.issues 
      });
      return;
    }
    
    const updateData = validationResult.data;
    
    // Check if task exists and belongs to user
    const existingTask = await findTaskByIdInWorkspace(taskId, req.workspace!.id);
    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    if (existingTask.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Update task
    const updatedTask = await updateTask(taskId, {
      title: updateData.title,
      description: updateData.description,
      dueDate: updateData.dueDate ? new Date(updateData.dueDate) : undefined,
      estimatedDuration: updateData.estimatedDuration,
      importance: updateData.importance as TaskImportance,
    }, req.workspace!.id);
    
    console.log(`📝 [Workspace: ${req.workspace!.slackTeamName}] Task updated: ${updatedTask.title} (ID: ${taskId}) by user ${userId}`);
    
    res.status(200).json(updatedTask);
    
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /tasks/:taskId/status
 * Update task status
 */
router.patch('/:taskId/status', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;
    
    // Validate UUID format
    if (!taskId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      res.status(400).json({ error: 'Invalid task ID format' });
      return;
    }
    
    // Validate request body
    const validationResult = UpdateTaskStatusSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({ 
        error: 'Invalid status data', 
        details: validationResult.error.issues 
      });
      return;
    }
    
    const { status } = validationResult.data;
    
    // Check if task exists and belongs to user
    const existingTask = await findTaskByIdInWorkspace(taskId, req.workspace!.id);
    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    if (existingTask.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Update task status
    const updatedTask = await updateTaskStatus(taskId, status as TaskStatus, req.workspace!.id);
    
    console.log(`📋 [Workspace: ${req.workspace!.slackTeamName}] Task status updated: ${updatedTask.title} -> ${status} (ID: ${taskId}) by user ${userId}`);
    
    res.status(200).json(updatedTask);
    
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /tasks/:taskId
 * Delete task
 */
router.delete('/:taskId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const { taskId } = req.params;
    
    // Validate UUID format
    if (!taskId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      res.status(400).json({ error: 'Invalid task ID format' });
      return;
    }
    
    // Check if task exists and belongs to user
    const existingTask = await findTaskByIdInWorkspace(taskId, req.workspace!.id);
    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    if (existingTask.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Delete task
    await deleteTask(taskId, req.workspace!.id);
    
    console.log(`🗑️ [Workspace: ${req.workspace!.slackTeamName}] Task deleted: ${existingTask.title} (ID: ${taskId}) by user ${userId}`);
    
    res.status(204).send();
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/pending
 * Get tasks pending confirmation
 */
router.get('/status/pending', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const tasks = await getPendingTasks(req.workspace!.id, userId);
    
    res.status(200).json({ tasks });
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/confirmed
 * Get confirmed tasks ready for scheduling
 */
router.get('/status/confirmed', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const tasks = await getConfirmedTasks(req.workspace!.id, userId);
    
    res.status(200).json({ tasks });
    
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/overdue
 * Get overdue tasks
 */
router.get('/status/overdue', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const tasks = await getOverdueTasks(req.workspace!.id, userId);
    
    res.status(200).json({ tasks });
    
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/schedule
 * Schedule a confirmed task in the calendar
 */
router.post('/:id/schedule', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;
    
    // Validate request body
    const body = ScheduleTaskSchema.parse(req.body);
    
    // Validate task exists and belongs to workspace/user
    const task = await findTaskByIdInWorkspace(id, workspaceId);
    if (!task || task.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    // Check task status
    if (task.status !== 'CONFIRMED') {
      return res.status(400).json({
        success: false,
        error: `Task must be in CONFIRMED status to schedule (current: ${task.status})`,
      });
    }

    // Check if task is already scheduled
    const existingCalendarEvent = await findCalendarEventByTaskId(id, workspaceId);
    if (existingCalendarEvent && existingCalendarEvent.isActive) {
      return res.status(400).json({
        success: false,
        error: 'Task is already scheduled',
        calendarEvent: {
          id: existingCalendarEvent.id,
          startTime: existingCalendarEvent.startTime,
          endTime: existingCalendarEvent.endTime,
        },
      });
    }

    // Add scheduling job to queue
    const jobId = await addCalendarSchedulingJob({
      jobType: CalendarJobType.SCHEDULE_TASK,
      workspaceId,
      userId,
      taskId: id,
      preferredStartTime: body.preferredStartTime,
      sendConfirmation: body.sendConfirmation ?? true,
    }, 5); // High priority for manual scheduling

    res.status(202).json({
      success: true,
      message: 'Task scheduling initiated',
      jobId,
      taskId: id,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/:id/reschedule
 * Reschedule an existing scheduled task
 */
router.post('/:id/reschedule', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;
    
    // Validate request body
    const body = RescheduleTaskSchema.parse(req.body);
    
    // Validate task exists and belongs to workspace/user
    const task = await findTaskByIdInWorkspace(id, workspaceId);
    if (!task || task.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    // Check task status
    if (task.status !== 'SCHEDULED') {
      return res.status(400).json({
        success: false,
        error: `Task must be in SCHEDULED status to reschedule (current: ${task.status})`,
      });
    }

    // Add rescheduling job to queue
    const jobId = await addCalendarSchedulingJob({
      jobType: CalendarJobType.RESCHEDULE_TASK,
      workspaceId,
      userId,
      taskId: id,
      newStartTime: body.newStartTime,
      reason: body.reason,
    }, 5); // High priority for manual rescheduling

    res.status(202).json({
      success: true,
      message: 'Task rescheduling initiated',
      jobId,
      taskId: id,
      reason: body.reason,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/:id/calendar
 * Get calendar information for a task
 */
router.get('/:id/calendar', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;
    
    // Validate task exists and belongs to workspace/user
    const task = await findTaskByIdInWorkspace(id, workspaceId);
    if (!task || task.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    // Get calendar event for task
    const calendarEvent = await findCalendarEventByTaskId(id, workspaceId);

    if (!calendarEvent) {
      return res.status(200).json({
        success: true,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
        },
        calendarEvent: null,
        scheduled: false,
      });
    }

    res.status(200).json({
      success: true,
      task: {
        id: task.id,
        title: task.title,
        status: task.status,
      },
      calendarEvent: {
        id: calendarEvent.id,
        googleEventId: calendarEvent.googleEventId,
        startTime: calendarEvent.startTime,
        endTime: calendarEvent.endTime,
        isActive: calendarEvent.isActive,
        createdAt: calendarEvent.createdAt,
      },
      scheduled: calendarEvent.isActive,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /tasks/:id/alternatives
 * Get alternative time slots for scheduling a task
 */
router.get('/:id/alternatives', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;
    const { count = '3' } = req.query;
    
    // Validate task exists and belongs to workspace/user
    const task = await findTaskByIdInWorkspace(id, workspaceId);
    if (!task || task.userId !== userId) {
      return res.status(404).json({
        success: false,
        error: 'Task not found',
      });
    }

    // Find alternative time slots
    const alternatives = await findAlternativeTimeSlots(
      task,
      userId,
      workspaceId,
      parseInt(count as string, 10)
    );

    res.status(200).json({
      success: true,
      taskId: id,
      alternatives,
      count: alternatives.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/conflicts/check
 * Check for scheduling conflicts for a proposed time slot
 */
router.post('/conflicts/check', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;
    
    // Validate request body
    const body = CheckConflictsSchema.parse(req.body);
    
    // Detect conflicts
    const conflictResult = await detectConflicts(userId, workspaceId, {
      start: new Date(body.start),
      end: new Date(body.end),
      title: body.title || 'Proposed time slot',
    });

    res.status(200).json({
      success: true,
      timeSlot: {
        start: body.start,
        end: body.end,
        title: body.title,
      },
      ...conflictResult,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /tasks/schedule/bulk
 * Schedule multiple confirmed tasks in bulk
 */
router.post('/schedule/bulk', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;
    const { taskIds, sendConfirmations = true } = req.body;

    if (!Array.isArray(taskIds) || taskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Task IDs array is required and must not be empty',
      });
    }

    // Validate all tasks exist and belong to user
    const validTaskIds: string[] = [];
    for (const taskId of taskIds) {
      const task = await findTaskByIdInWorkspace(taskId, workspaceId);
      if (task && task.userId === userId && task.status === 'CONFIRMED') {
        validTaskIds.push(taskId);
      }
    }

    if (validTaskIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid confirmed tasks found',
      });
    }

    // Add bulk scheduling job to queue
    const jobId = await addCalendarSchedulingJob({
      jobType: CalendarJobType.BULK_SCHEDULE,
      workspaceId,
      userId,
      taskIds: validTaskIds,
      sendConfirmations,
    }, 3); // Medium priority for bulk operations

    res.status(202).json({
      success: true,
      message: 'Bulk scheduling initiated',
      jobId,
      requestedTasks: taskIds.length,
      validTasks: validTaskIds.length,
      taskIds: validTaskIds,
    });
  } catch (error) {
    next(error);
  }
});

export default router;