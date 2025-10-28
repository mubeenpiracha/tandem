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
  findTaskById,
  findTasksByUser,
  updateTask,
  updateTaskStatus,
  deleteTask,
  getPendingTasks,
  getConfirmedTasks,
  getOverdueTasks,
} from '../models/task';
import { findUserById } from '../models/user';
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

const TaskFilterSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'DISMISSED']).optional(),
  limit: z.string().transform(Number).pipe(z.number().int().min(1).max(100)).optional(),
  offset: z.string().transform(Number).pipe(z.number().int().min(0)).optional(),
});

// Middleware to extract userId from auth token (placeholder)
// In a real implementation, this would decode JWT token
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // TODO: Implement proper JWT authentication
  // For now, use a test user ID from headers or hardcode
  const userId = req.headers['x-user-id'] as string;
  
  if (!userId) {
    res.status(401).json({ error: 'Authentication required' });
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
    const result = await findTasksByUser(userId, {
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
    
    console.log(`✅ Task created: ${task.title} (ID: ${task.id}) for user ${userId}`);
    
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
    
    const task = await findTaskById(taskId);
    
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
    const existingTask = await findTaskById(taskId);
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
    });
    
    console.log(`📝 Task updated: ${updatedTask.title} (ID: ${taskId}) by user ${userId}`);
    
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
    const existingTask = await findTaskById(taskId);
    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    if (existingTask.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Update task status
    const updatedTask = await updateTaskStatus(taskId, status as TaskStatus);
    
    console.log(`📋 Task status updated: ${updatedTask.title} -> ${status} (ID: ${taskId}) by user ${userId}`);
    
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
    const existingTask = await findTaskById(taskId);
    if (!existingTask) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }
    
    if (existingTask.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }
    
    // Delete task
    await deleteTask(taskId);
    
    console.log(`🗑️ Task deleted: ${existingTask.title} (ID: ${taskId}) by user ${userId}`);
    
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
    const tasks = await getPendingTasks(userId);
    
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
    const tasks = await getConfirmedTasks(userId);
    
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
    const tasks = await getOverdueTasks(userId);
    
    res.status(200).json({ tasks });
    
  } catch (error) {
    next(error);
  }
});

export default router;