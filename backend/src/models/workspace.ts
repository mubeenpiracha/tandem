/**
 * Workspace model operations and business logic
 * 
 * This module provides typed database operations for Workspace entities
 * including CRUD operations and business logic validations.
 */

import prisma from './index';
import type { Workspace } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface CreateWorkspaceData {
  slackTeamId: string;
  slackTeamName: string;
  slackBotToken: string;
  isActive?: boolean;
}

export interface UpdateWorkspaceData {
  slackTeamName?: string;
  slackBotToken?: string;
  isActive?: boolean;
}

export interface WorkspaceWithUsers extends Workspace {
  users?: any[];
  slackMessages?: any[];
  _count?: {
    users: number;
    slackMessages: number;
  };
}

/**
 * Create a new workspace (during Slack app installation)
 */
export async function createWorkspace(data: CreateWorkspaceData): Promise<Workspace> {
  try {
    const workspace = await prisma.workspace.create({
      data: {
        slackTeamId: data.slackTeamId,
        slackTeamName: data.slackTeamName,
        slackBotToken: data.slackBotToken, // This should be encrypted in production
        isActive: data.isActive ?? true,
      },
    });
    return workspace;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new Error('Workspace with this Slack team ID already exists');
      }
    }
    throw error;
  }
}

/**
 * Find workspace by ID
 */
export async function findWorkspaceById(id: string): Promise<Workspace | null> {
  return await prisma.workspace.findUnique({
    where: { id },
  });
}

/**
 * Find workspace by Slack team ID
 */
export async function findWorkspaceBySlackTeamId(slackTeamId: string): Promise<Workspace | null> {
  return await prisma.workspace.findUnique({
    where: { slackTeamId },
  });
}

/**
 * Find workspace with user count and recent activity
 */
export async function findWorkspaceWithStats(id: string): Promise<WorkspaceWithUsers | null> {
  return await prisma.workspace.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          users: true,
          slackMessages: true,
        },
      },
      users: {
        where: { status: 'ACTIVE' },
        take: 10,
        orderBy: { createdAt: 'desc' },
      },
    },
  });
}

/**
 * Update workspace data
 */
export async function updateWorkspace(id: string, data: UpdateWorkspaceData): Promise<Workspace> {
  try {
    return await prisma.workspace.update({
      where: { id },
      data,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new Error('Workspace not found');
      }
    }
    throw error;
  }
}

/**
 * Update workspace bot token (for token refresh)
 */
export async function updateWorkspaceBotToken(id: string, slackBotToken: string): Promise<Workspace> {
  return await updateWorkspace(id, { slackBotToken });
}

/**
 * Deactivate workspace (uninstall)
 */
export async function deactivateWorkspace(id: string): Promise<Workspace> {
  return await updateWorkspace(id, { isActive: false });
}

/**
 * Delete workspace and all related data
 */
export async function deleteWorkspace(id: string): Promise<void> {
  try {
    await prisma.workspace.delete({
      where: { id },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new Error('Workspace not found');
      }
    }
    throw error;
  }
}

/**
 * Get all active workspaces
 */
export async function getActiveWorkspaces(): Promise<Workspace[]> {
  return await prisma.workspace.findMany({
    where: { isActive: true },
    orderBy: { installedAt: 'desc' },
  });
}

/**
 * Get workspace count for monitoring
 */
export async function getWorkspaceCount(): Promise<number> {
  return await prisma.workspace.count({
    where: { isActive: true },
  });
}

/**
 * Get workspace by bot token (for webhook routing)
 */
export async function findWorkspaceByBotToken(botToken: string): Promise<Workspace | null> {
  return await prisma.workspace.findFirst({
    where: { 
      slackBotToken: botToken,
      isActive: true,
    },
  });
}

/**
 * Check if workspace has completed setup
 */
export async function isWorkspaceSetupComplete(id: string): Promise<boolean> {
  const workspace = await prisma.workspace.findUnique({
    where: { id },
    include: {
      _count: {
        select: { users: true },
      },
    },
  });

  if (!workspace || !workspace.isActive) return false;

  // Workspace is considered setup if it has at least one user
  return workspace._count.users > 0;
}