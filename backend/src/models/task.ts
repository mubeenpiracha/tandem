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
 * Validate task belongs to workspace (through user)
 */
export async function validateTaskWorkspace(taskId: string, workspaceId: string): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { user: true },
  });

  return task?.user?.workspaceId === workspaceId;
}

/**
 * Find task by ID with workspace validation
 */
export async function findTaskByIdInWorkspace(id: string, workspaceId: string): Promise<Task | null> {
  return await prisma.task.findFirst({
    where: { 
      id,
      user: {
        workspaceId
      }
    },
  });
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
 * Find tasks by user ID with filtering (workspace-scoped)
 */
export async function findTasksByUser(
  userId: string,
  workspaceId: string,
  filters?: {
    status?: TaskStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ tasks: Task[]; total: number }> {
  const where: Prisma.TaskWhereInput = { 
    userId,
    user: {
      workspaceId
    }
  };
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
 * Update task data (workspace-scoped)
 */
export async function updateTask(id: string, data: UpdateTaskData, workspaceId?: string): Promise<Task> {
  try {
    // Validate workspace if provided
    if (workspaceId && !(await validateTaskWorkspace(id, workspaceId))) {
      throw new Error('Task not found in workspace');
    }

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
 * Update task status with validation (workspace-scoped)
 */
export async function updateTaskStatus(id: string, status: TaskStatus, workspaceId?: string): Promise<Task> {
  // Validate workspace if provided
  if (workspaceId) {
    const task = await findTaskByIdInWorkspace(id, workspaceId);
    if (!task) {
      throw new Error('Task not found in workspace');
    }
  } else {
    const task = await findTaskById(id);
    if (!task) {
      throw new Error('Task not found');
    }
  }

  const task = workspaceId ? await findTaskByIdInWorkspace(id, workspaceId) : await findTaskById(id);

  // Validate status transitions
  const validTransitions: Record<TaskStatus, TaskStatus[]> = {
    PENDING: ['CONFIRMED', 'DISMISSED'],
    CONFIRMED: ['SCHEDULED', 'DISMISSED'],
    SCHEDULED: ['COMPLETED', 'DISMISSED'],
    COMPLETED: ['DISMISSED'], // Allow dismissing completed tasks
    DISMISSED: [], // No transitions from dismissed
  };

  if (!validTransitions[task!.status].includes(status)) {
    throw new Error(`Invalid status transition from ${task!.status} to ${status}`);
  }

  return await updateTask(id, { status }, workspaceId);
}

/**
 * Delete task (workspace-scoped)
 */
export async function deleteTask(id: string, workspaceId?: string): Promise<void> {
  try {
    // Validate workspace if provided
    if (workspaceId && !(await validateTaskWorkspace(id, workspaceId))) {
      throw new Error('Task not found in workspace');
    }

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
 * Get tasks pending confirmation (workspace-scoped)
 */
export async function getPendingTasks(workspaceId: string, userId?: string): Promise<Task[]> {
  const where: Prisma.TaskWhereInput = { 
    status: 'PENDING',
    user: {
      workspaceId
    }
  };
  if (userId) {
    where.userId = userId;
  }

  return await prisma.task.findMany({
    where,
    orderBy: { createdAt: 'asc' },
  });
}

/**
 * Get tasks ready for scheduling (workspace-scoped)
 */
export async function getConfirmedTasks(workspaceId: string, userId?: string): Promise<Task[]> {
  const where: Prisma.TaskWhereInput = { 
    status: 'CONFIRMED',
    user: {
      workspaceId
    }
  };
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
 * Get overdue tasks (workspace-scoped)
 */
export async function getOverdueTasks(workspaceId: string, userId?: string): Promise<Task[]> {
  const now = new Date();
  const where: Prisma.TaskWhereInput = {
    dueDate: { lt: now },
    status: { in: ['PENDING', 'CONFIRMED', 'SCHEDULED'] },
    user: {
      workspaceId
    }
  };
  if (userId) {
    where.userId = userId;
  }

  return await prisma.task.findMany({
    where,
    orderBy: { dueDate: 'asc' },
  });
}