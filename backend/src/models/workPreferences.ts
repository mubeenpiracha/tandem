/**
 * Work Preferences model
 * 
 * This module provides database operations for user work preferences
 * including work hours, break times, and scheduling preferences.
 */

import prisma from './index';
import type { WorkPreferences, Prisma } from '@prisma/client';
import { Logger, LogCategory } from '../utils/logger';

// Interfaces for type safety
export interface WorkHours {
  start: string; // HH:MM format
  end: string;   // HH:MM format
}

export interface WeeklyHours {
  [key: string]: WorkHours | null; // Allow any day name
}

export interface BreakTimes {
  [breakName: string]: WorkHours;
}

export interface CreateWorkPreferencesData {
  userId: string;
  weeklyHours: WeeklyHours;
  breakTimes: BreakTimes;
  timezone: string;
}

export interface UpdateWorkPreferencesData {
  weeklyHours?: WeeklyHours;
  breakTimes?: BreakTimes;
  timezone?: string;
}

/**
 * Get default work preferences
 */
export function getDefaultWorkPreferences(): Omit<CreateWorkPreferencesData, 'userId'> {
  return {
    weeklyHours: {
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
  };
}

/**
 * Create work preferences for a user
 */
export async function createWorkPreferences(data: CreateWorkPreferencesData): Promise<WorkPreferences> {
  try {
    Logger.info(LogCategory.AUTH, `Creating work preferences for user ${data.userId}`);

    const preferences = await prisma.workPreferences.create({
      data: {
        userId: data.userId,
        weeklyHours: data.weeklyHours as unknown as Prisma.InputJsonValue,
        breakTimes: data.breakTimes as unknown as Prisma.InputJsonValue,
        timezone: data.timezone,
      },
    });

    Logger.info(LogCategory.AUTH, `Created work preferences for user ${data.userId}`, {
      preferencesId: preferences.id,
      timezone: preferences.timezone,
    });

    return preferences;
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to create work preferences for user ${data.userId}`, error as Error);
    throw error;
  }
}

/**
 * Find work preferences by user ID
 */
export async function findWorkPreferencesByUserId(userId: string): Promise<WorkPreferences | null> {
  try {
    const preferences = await prisma.workPreferences.findUnique({
      where: { userId },
    });

    return preferences;
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to find work preferences for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Update work preferences
 */
export async function updateWorkPreferences(
  userId: string, 
  data: UpdateWorkPreferencesData
): Promise<WorkPreferences> {
  try {
    Logger.info(LogCategory.AUTH, `Updating work preferences for user ${userId}`);

    const preferences = await prisma.workPreferences.update({
      where: { userId },
      data: {
        ...(data.weeklyHours && { weeklyHours: data.weeklyHours as unknown as Prisma.InputJsonValue }),
        ...(data.breakTimes && { breakTimes: data.breakTimes as unknown as Prisma.InputJsonValue }),
        ...(data.timezone && { timezone: data.timezone }),
      },
    });

    Logger.info(LogCategory.AUTH, `Updated work preferences for user ${userId}`, {
      preferencesId: preferences.id,
      timezone: preferences.timezone,
    });

    return preferences;
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to update work preferences for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Create or update work preferences (upsert)
 */
export async function upsertWorkPreferences(data: CreateWorkPreferencesData): Promise<WorkPreferences> {
  try {
    Logger.info(LogCategory.AUTH, `Upserting work preferences for user ${data.userId}`);

    const preferences = await prisma.workPreferences.upsert({
      where: { userId: data.userId },
      update: {
        weeklyHours: data.weeklyHours as unknown as Prisma.InputJsonValue,
        breakTimes: data.breakTimes as unknown as Prisma.InputJsonValue,
        timezone: data.timezone,
      },
      create: {
        userId: data.userId,
        weeklyHours: data.weeklyHours as unknown as Prisma.InputJsonValue,
        breakTimes: data.breakTimes as unknown as Prisma.InputJsonValue,
        timezone: data.timezone,
      },
    });

    Logger.info(LogCategory.AUTH, `Upserted work preferences for user ${data.userId}`, {
      preferencesId: preferences.id,
      timezone: preferences.timezone,
    });

    return preferences;
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to upsert work preferences for user ${data.userId}`, error as Error);
    throw error;
  }
}

/**
 * Delete work preferences
 */
export async function deleteWorkPreferences(userId: string): Promise<void> {
  try {
    Logger.info(LogCategory.AUTH, `Deleting work preferences for user ${userId}`);

    await prisma.workPreferences.delete({
      where: { userId },
    });

    Logger.info(LogCategory.AUTH, `Deleted work preferences for user ${userId}`);
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to delete work preferences for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Check if user has work preferences
 */
export async function hasWorkPreferences(userId: string): Promise<boolean> {
  try {
    const count = await prisma.workPreferences.count({
      where: { userId },
    });

    return count > 0;
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to check work preferences for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Get work preferences with defaults if none exist
 */
export async function getWorkPreferencesWithDefaults(userId: string): Promise<{
  weeklyHours: WeeklyHours;
  breakTimes: BreakTimes;
  timezone: string;
  hasCustomPreferences: boolean;
}> {
  try {
    const preferences = await findWorkPreferencesByUserId(userId);
    
    if (preferences) {
      return {
        weeklyHours: preferences.weeklyHours as unknown as WeeklyHours,
        breakTimes: preferences.breakTimes as unknown as BreakTimes,
        timezone: preferences.timezone,
        hasCustomPreferences: true,
      };
    }

    // Return defaults if no preferences found
    const defaults = getDefaultWorkPreferences();
    return {
      ...defaults,
      hasCustomPreferences: false,
    };
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to get work preferences with defaults for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Initialize default work preferences for a user during onboarding
 */
export async function initializeDefaultWorkPreferences(userId: string, timezone: string = 'UTC'): Promise<WorkPreferences> {
  try {
    Logger.info(LogCategory.AUTH, `Initializing default work preferences for user ${userId}`);

    const defaults = getDefaultWorkPreferences();
    const preferences = await createWorkPreferences({
      userId,
      weeklyHours: defaults.weeklyHours,
      breakTimes: defaults.breakTimes,
      timezone,
    });

    Logger.info(LogCategory.AUTH, `Initialized default work preferences for user ${userId}`, {
      preferencesId: preferences.id,
      timezone: preferences.timezone,
    });

    return preferences;
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to initialize default work preferences for user ${userId}`, error as Error);
    throw error;
  }
}