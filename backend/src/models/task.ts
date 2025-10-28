/**
 * Task model operations and business logic
 * 
 * This module provides typed database operations for Task entities
 * including CRUD operations, state transitions, and business logic.
 */

import prisma from './index';
import type { Task, TaskStatus, TaskImportance, TaskUrgency } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface CreateTaskData {
  userId: string;
  title: string;
  description?: string;
  dueDate?: Date;
  estimatedDuration: number;
  importance?: TaskImportance;
  slackMessageId?: string;
}

export interface UpdateTaskData {
  title?: string;
  description?: string;
  dueDate?: Date;
  estimatedDuration?: number;
  importance?: TaskImportance;
  status?: TaskStatus;
}

export interface TaskWithRelations extends Task {
  user?: any;
  slackMessage?: any;
  calendarEvent?: any;
}

/**
 * Calculate derived urgency based on due date
 */
export function calculateDerivedUrgency(dueDate?: Date): TaskUrgency {
  if (!dueDate) return 'LOW';

  const now = new Date();
  const diffInDays = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffInDays <= 2) return 'HIGH';
  if (diffInDays <= 7) return 'MEDIUM';
  return 'LOW';
}

/**
 * Create a new task
 */
export async function createTask(data: CreateTaskData): Promise<Task> {
  try {
    const derivedUrgency = calculateDerivedUrgency(data.dueDate);
    
    const task = await prisma.task.create({
      data: {
        userId: data.userId,
        title: data.title,
        description: data.description,
        dueDate: data.dueDate,
        estimatedDuration: data.estimatedDuration,
        importance: data.importance || 'MEDIUM',
        derivedUrgency,
        slackMessageId: data.slackMessageId,
        status: 'PENDING',
      },
    });
    return task;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw new Error('Invalid user ID or Slack message ID');
      }
    }
    throw error;
  }
}

/**
 * Find task by ID
 */
export async function findTaskById(id: string): Promise<Task | null> {
  return await prisma.task.findUnique({
    where: { id },
  });
}

/**
 * Find task with all relations
 */
export async function findTaskWithRelations(id: string): Promise<TaskWithRelations | null> {
  return await prisma.task.findUnique({
    where: { id },
    include: {
      user: true,
      slackMessage: true,
      calendarEvent: true,
    },
  });
}

/**
 * Find tasks by user ID with filtering
 */
export async function findTasksByUser(
  userId: string,
  filters?: {
    status?: TaskStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ tasks: Task[]; total: number }> {
  const where: Prisma.TaskWhereInput = { userId };
  if (filters?.status) {
    where.status = filters.status;
  }

  const [tasks, total] = await prisma.$transaction([
    prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 20,
      skip: filters?.offset || 0,
    }),
    prisma.task.count({ where }),
  ]);

  return { tasks, total };
}

/**
 * Update task data
 */
export async function updateTask(id: string, data: UpdateTaskData): Promise<Task> {
  try {
    const updateData: any = { ...data };
    
    // Recalculate derived urgency if due date changes
    if (data.dueDate !== undefined) {
      updateData.derivedUrgency = calculateDerivedUrgency(data.dueDate);
    }

    return await prisma.task.update({
      where: { id },
      data: updateData,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new Error('Task not found');
      }
    }
    throw error;
  }
}

/**
 * Update task status with validation
 */
export async function updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  const task = await findTaskById(id);
  if (!task) {
    throw new Error('Task not found');
  }

  // Validate status transitions
  const validTransitions: Record<TaskStatus, TaskStatus[]> = {
    PENDING: ['CONFIRMED', 'DISMISSED'],
    CONFIRMED: ['SCHEDULED', 'DISMISSED'],
    SCHEDULED: ['COMPLETED', 'DISMISSED'],
    COMPLETED: ['DISMISSED'], // Allow dismissing completed tasks
    DISMISSED: [], // No transitions from dismissed
  };

  if (!validTransitions[task.status].includes(status)) {
    throw new Error(`Invalid status transition from ${task.status} to ${status}`);
  }

  return await updateTask(id, { status });
}

/**
 * Delete task
 */
export async function deleteTask(id: string): Promise<void> {
  try {
    await prisma.task.delete({
      where: { id },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new Error('Task not found');
      }
    }
    throw error;
  }
}

/**
 * Get tasks pending confirmation
 */
export async function getPendingTasks(userId?: string): Promise<Task[]> {
  const where: Prisma.TaskWhereInput = { status: 'PENDING' };
  if (userId) {
    where.userId = userId;
  }

  return await prisma.task.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Get tasks ready for scheduling
 */
export async function getConfirmedTasks(userId?: string): Promise<Task[]> {
  const where: Prisma.TaskWhereInput = { status: 'CONFIRMED' };
  if (userId) {
    where.userId = userId;
  }

  return await prisma.task.findMany({
    where,
    orderBy: [
      { derivedUrgency: 'desc' },
      { importance: 'desc' },
      { createdAt: 'asc' },
    ],
  });
}

/**
 * Get overdue tasks
 */
export async function getOverdueTasks(userId?: string): Promise<Task[]> {
  const now = new Date();
  const where: Prisma.TaskWhereInput = {
    dueDate: { lt: now },
    status: { in: ['PENDING', 'CONFIRMED', 'SCHEDULED'] },
  };
  if (userId) {
    where.userId = userId;
  }

  return await prisma.task.findMany({
    where,
    orderBy: { dueDate: 'asc' },
  });
}