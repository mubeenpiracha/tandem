/**
 * User model operations and business logic
 * 
 * This module provides typed database operations for User entities
 * including CRUD operations and business logic validations.
 */

import prisma from './index';
import type { User, UserStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface CreateUserData {
  workspaceId: string;
  email: string;
  slackUserId: string;
  timezone?: string;
  status?: UserStatus;
}

export interface UpdateUserData {
  email?: string;
  timezone?: string;
  status?: UserStatus;
}

export interface UserWithRelations extends User {
  tasks?: any[];
  workPreferences?: any;
  slackToken?: any;
  googleToken?: any;
}

/**
 * Create a new user within a workspace
 */
export async function createUser(data: CreateUserData): Promise<User> {
  try {
    const user = await prisma.user.create({
      data: {
        workspaceId: data.workspaceId,
        email: data.email,
        slackUserId: data.slackUserId,
        timezone: data.timezone || 'UTC',
        status: data.status || 'ACTIVE',
      },
    });
    return user;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new Error('User with this email or Slack ID already exists in this workspace');
      }
    }
    throw error;
  }
}

/**
 * Find user by ID
 */
export async function findUserById(id: string): Promise<User | null> {
  return await prisma.user.findUnique({
    where: { id },
  });
}

/**
 * Find user by email within a workspace
 */
export async function findUserByEmail(email: string, workspaceId: string): Promise<User | null> {
  return await prisma.user.findFirst({
    where: { 
      email,
      workspaceId
    },
  });
}

/**
 * Find user by Slack user ID within a workspace
 */
export async function findUserBySlackId(slackUserId: string, workspaceId: string): Promise<User | null> {
  return await prisma.user.findFirst({
    where: { 
      slackUserId,
      workspaceId
    },
  });
}

/**
 * Find user with all relations
 */
export async function findUserWithRelations(id: string): Promise<UserWithRelations | null> {
  return await prisma.user.findUnique({
    where: { id },
    include: {
      tasks: {
        orderBy: { createdAt: 'desc' },
        take: 10, // Limit to recent tasks for performance
      },
      workPreferences: true,
      slackToken: true,
      googleToken: true,
    },
  });
}

/**
 * Update user data
 */
export async function updateUser(id: string, data: UpdateUserData): Promise<User> {
  try {
    return await prisma.user.update({
      where: { id },
      data,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new Error('User with this email already exists');
      }
      if (error.code === 'P2025') {
        throw new Error('User not found');
      }
    }
    throw error;
  }
}

/**
 * Delete user and all related data
 */
export async function deleteUser(id: string): Promise<void> {
  try {
    await prisma.user.delete({
      where: { id },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new Error('User not found');
      }
    }
    throw error;
  }
}

/**
 * Get user count for monitoring
 */
export async function getUserCount(): Promise<number> {
  return await prisma.user.count();
}

/**
 * Get active users
 */
export async function getActiveUsers(): Promise<User[]> {
  return await prisma.user.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Check if user has completed onboarding
 */
export async function isUserOnboarded(id: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      slackToken: true,
      googleToken: true,
      workPreferences: true,
    },
  });

  if (!user) return false;

  return !!(user.slackToken && user.googleToken && user.workPreferences);
}