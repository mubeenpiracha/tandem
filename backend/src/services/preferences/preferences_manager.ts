/**
 * Preferences Manager Service
 * 
 * This service manages user work preferences with workspace context,
 * including validation, smart defaults, and workspace-level templates.
 */

import { findUserById } from '../../models/user';
import { findWorkspaceById } from '../../models/workspace';
import {
  createWorkPreferences,
  findWorkPreferencesByUserId,
  updateWorkPreferences,
  upsertWorkPreferences,
  deleteWorkPreferences,
  getWorkPreferencesWithDefaults,
  initializeDefaultWorkPreferences,
  getDefaultWorkPreferences,
  type WeeklyHours,
  type BreakTimes,
  type WorkHours,
  type CreateWorkPreferencesData,
  type UpdateWorkPreferencesData,
} from '../../models/workPreferences';
import { Logger, LogCategory } from '../../utils/logger';

// Extended interfaces for service layer
export interface ValidatedPreferences {
  weeklyHours: WeeklyHours;
  breakTimes: BreakTimes;
  timezone: string;
  isValid: boolean;
  validationErrors: string[];
}

export interface PreferencesWithMeta {
  weeklyHours: WeeklyHours;
  breakTimes: BreakTimes;
  timezone: string;
  hasCustomPreferences: boolean;
  workspaceId: string;
  userId: string;
  lastUpdated?: Date;
}

export interface WorkspacePreferenceTemplate {
  name: string;
  description: string;
  weeklyHours: WeeklyHours;
  breakTimes: BreakTimes;
  timezone: string;
}

/**
 * Validate time format (HH:MM)
 */
function isValidTimeFormat(time: string): boolean {
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return timeRegex.test(time);
}

/**
 * Validate work hours
 */
function validateWorkHours(workHours: WorkHours): string[] {
  const errors: string[] = [];

  if (!isValidTimeFormat(workHours.start)) {
    errors.push(`Invalid start time format: ${workHours.start}. Expected HH:MM format.`);
  }

  if (!isValidTimeFormat(workHours.end)) {
    errors.push(`Invalid end time format: ${workHours.end}. Expected HH:MM format.`);
  }

  if (errors.length === 0) {
    // Check if start time is before end time
    const [startHour, startMin] = workHours.start.split(':').map(Number);
    const [endHour, endMin] = workHours.end.split(':').map(Number);
    
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (startMinutes >= endMinutes) {
      errors.push(`Start time (${workHours.start}) must be before end time (${workHours.end}).`);
    }

    // Check for reasonable work hours (minimum 1 hour, maximum 16 hours)
    const duration = endMinutes - startMinutes;
    if (duration < 60) {
      errors.push(`Work day too short. Minimum 1 hour required.`);
    } else if (duration > 16 * 60) {
      errors.push(`Work day too long. Maximum 16 hours allowed.`);
    }
  }

  return errors;
}

/**
 * Validate weekly hours
 */
function validateWeeklyHours(weeklyHours: WeeklyHours): string[] {
  const errors: string[] = [];
  const validDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  for (const [day, hours] of Object.entries(weeklyHours)) {
    if (!validDays.includes(day.toLowerCase())) {
      errors.push(`Invalid day name: ${day}. Valid days are: ${validDays.join(', ')}.`);
      continue;
    }

    if (hours !== null) {
      const hourErrors = validateWorkHours(hours);
      errors.push(...hourErrors.map(error => `${day}: ${error}`));
    }
  }

  // Check if at least one working day is defined
  const hasWorkingDays = Object.values(weeklyHours).some(hours => hours !== null);
  if (!hasWorkingDays) {
    errors.push('At least one working day must be defined.');
  }

  return errors;
}

/**
 * Validate break times
 */
function validateBreakTimes(breakTimes: BreakTimes, weeklyHours: WeeklyHours): string[] {
  const errors: string[] = [];

  for (const [breakName, breakHours] of Object.entries(breakTimes)) {
    const hourErrors = validateWorkHours(breakHours);
    errors.push(...hourErrors.map(error => `Break "${breakName}": ${error}`));

    if (hourErrors.length === 0) {
      // Check if break time is within working hours for any working day
      let isWithinWorkingHours = false;
      
      for (const dayHours of Object.values(weeklyHours)) {
        if (dayHours !== null) {
          const [breakStart] = breakHours.start.split(':').map(Number);
          const [breakEnd] = breakHours.end.split(':').map(Number);
          const [workStart] = dayHours.start.split(':').map(Number);
          const [workEnd] = dayHours.end.split(':').map(Number);
          
          const breakStartMinutes = breakStart * 60 + parseInt(breakHours.start.split(':')[1]);
          const breakEndMinutes = breakEnd * 60 + parseInt(breakHours.end.split(':')[1]);
          const workStartMinutes = workStart * 60 + parseInt(dayHours.start.split(':')[1]);
          const workEndMinutes = workEnd * 60 + parseInt(dayHours.end.split(':')[1]);
          
          if (breakStartMinutes >= workStartMinutes && breakEndMinutes <= workEndMinutes) {
            isWithinWorkingHours = true;
            break;
          }
        }
      }
      
      if (!isWithinWorkingHours) {
        errors.push(`Break "${breakName}" (${breakHours.start}-${breakHours.end}) must be within working hours.`);
      }
    }
  }

  return errors;
}

/**
 * Validate timezone
 */
function validateTimezone(timezone: string): string[] {
  const errors: string[] = [];
  
  try {
    // Test if timezone is valid by creating a date
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch (error) {
    errors.push(`Invalid timezone: ${timezone}. Must be a valid IANA timezone (e.g., 'America/New_York', 'Europe/London').`);
  }
  
  return errors;
}

/**
 * Validate complete preferences
 */
export function validatePreferences(
  weeklyHours: WeeklyHours,
  breakTimes: BreakTimes,
  timezone: string
): ValidatedPreferences {
  const validationErrors: string[] = [];

  validationErrors.push(...validateWeeklyHours(weeklyHours));
  validationErrors.push(...validateBreakTimes(breakTimes, weeklyHours));
  validationErrors.push(...validateTimezone(timezone));

  return {
    weeklyHours,
    breakTimes,
    timezone,
    isValid: validationErrors.length === 0,
    validationErrors,
  };
}

/**
 * Get user preferences with workspace context
 */
export async function getUserPreferences(
  userId: string, 
  workspaceId: string
): Promise<PreferencesWithMeta> {
  try {
    Logger.info(LogCategory.AUTH, `Getting preferences for user ${userId} in workspace ${workspaceId}`);

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      throw new Error('User not found in workspace');
    }

    // Get preferences with defaults
    const preferencesData = await getWorkPreferencesWithDefaults(userId);

    const preferences: PreferencesWithMeta = {
      ...preferencesData,
      workspaceId,
      userId,
    };

    // Add lastUpdated if custom preferences exist
    if (preferencesData.hasCustomPreferences) {
      const dbPreferences = await findWorkPreferencesByUserId(userId);
      if (dbPreferences) {
        preferences.lastUpdated = dbPreferences.updatedAt;
      }
    }

    Logger.info(LogCategory.AUTH, `Retrieved preferences for user ${userId}`, {
      hasCustomPreferences: preferencesData.hasCustomPreferences,
      timezone: preferencesData.timezone,
    });

    return preferences;
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to get preferences for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Update user preferences with validation
 */
export async function updateUserPreferences(
  userId: string,
  workspaceId: string,
  data: UpdateWorkPreferencesData
): Promise<PreferencesWithMeta> {
  try {
    Logger.info(LogCategory.AUTH, `Updating preferences for user ${userId} in workspace ${workspaceId}`);

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      throw new Error('User not found in workspace');
    }

    // Get current preferences for validation context
    const currentPreferences = await getWorkPreferencesWithDefaults(userId);
    
    // Merge with current preferences for validation
    const mergedData = {
      weeklyHours: data.weeklyHours || currentPreferences.weeklyHours,
      breakTimes: data.breakTimes || currentPreferences.breakTimes,
      timezone: data.timezone || currentPreferences.timezone,
    };

    // Validate the merged preferences
    const validation = validatePreferences(
      mergedData.weeklyHours,
      mergedData.breakTimes,
      mergedData.timezone
    );

    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.validationErrors.join(', ')}`);
    }

    // Update preferences
    const updatedPreferences = await updateWorkPreferences(userId, data);

    Logger.info(LogCategory.AUTH, `Updated preferences for user ${userId}`, {
      preferencesId: updatedPreferences.id,
      timezone: updatedPreferences.timezone,
    });

    // Return updated preferences with metadata
    return {
      weeklyHours: updatedPreferences.weeklyHours as unknown as WeeklyHours,
      breakTimes: updatedPreferences.breakTimes as unknown as BreakTimes,
      timezone: updatedPreferences.timezone,
      hasCustomPreferences: true,
      workspaceId,
      userId,
      lastUpdated: updatedPreferences.updatedAt,
    };
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to update preferences for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Create user preferences with validation
 */
export async function createUserPreferences(
  userId: string,
  workspaceId: string,
  data: Omit<CreateWorkPreferencesData, 'userId'>
): Promise<PreferencesWithMeta> {
  try {
    Logger.info(LogCategory.AUTH, `Creating preferences for user ${userId} in workspace ${workspaceId}`);

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      throw new Error('User not found in workspace');
    }

    // Validate preferences
    const validation = validatePreferences(data.weeklyHours, data.breakTimes, data.timezone);
    if (!validation.isValid) {
      throw new Error(`Validation failed: ${validation.validationErrors.join(', ')}`);
    }

    // Create preferences
    const preferences = await createWorkPreferences({
      userId,
      ...data,
    });

    Logger.info(LogCategory.AUTH, `Created preferences for user ${userId}`, {
      preferencesId: preferences.id,
      timezone: preferences.timezone,
    });

    return {
      weeklyHours: preferences.weeklyHours as unknown as WeeklyHours,
      breakTimes: preferences.breakTimes as unknown as BreakTimes,
      timezone: preferences.timezone,
      hasCustomPreferences: true,
      workspaceId,
      userId,
      lastUpdated: preferences.updatedAt,
    };
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to create preferences for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Reset user preferences to defaults
 */
export async function resetUserPreferences(
  userId: string,
  workspaceId: string,
  timezone: string = 'UTC'
): Promise<PreferencesWithMeta> {
  try {
    Logger.info(LogCategory.AUTH, `Resetting preferences for user ${userId} in workspace ${workspaceId}`);

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      throw new Error('User not found in workspace');
    }

    // Get defaults and apply user's timezone
    const defaults = getDefaultWorkPreferences();
    const preferencesData = {
      userId,
      weeklyHours: defaults.weeklyHours,
      breakTimes: defaults.breakTimes,
      timezone,
    };

    // Upsert with defaults
    const preferences = await upsertWorkPreferences(preferencesData);

    Logger.info(LogCategory.AUTH, `Reset preferences for user ${userId}`, {
      preferencesId: preferences.id,
      timezone: preferences.timezone,
    });

    return {
      weeklyHours: preferences.weeklyHours as unknown as WeeklyHours,
      breakTimes: preferences.breakTimes as unknown as BreakTimes,
      timezone: preferences.timezone,
      hasCustomPreferences: true,
      workspaceId,
      userId,
      lastUpdated: preferences.updatedAt,
    };
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to reset preferences for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Initialize preferences for new user during onboarding
 */
export async function initializeUserPreferences(
  userId: string,
  workspaceId: string,
  timezone: string = 'UTC'
): Promise<PreferencesWithMeta> {
  try {
    Logger.info(LogCategory.AUTH, `Initializing preferences for new user ${userId} in workspace ${workspaceId}`);

    // Validate user belongs to workspace
    const user = await findUserById(userId);
    if (!user || user.workspaceId !== workspaceId) {
      throw new Error('User not found in workspace');
    }

    // Initialize with defaults
    const preferences = await initializeDefaultWorkPreferences(userId, timezone);

    Logger.info(LogCategory.AUTH, `Initialized preferences for user ${userId}`, {
      preferencesId: preferences.id,
      timezone: preferences.timezone,
    });

    return {
      weeklyHours: preferences.weeklyHours as unknown as WeeklyHours,
      breakTimes: preferences.breakTimes as unknown as BreakTimes,
      timezone: preferences.timezone,
      hasCustomPreferences: true,
      workspaceId,
      userId,
      lastUpdated: preferences.updatedAt,
    };
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to initialize preferences for user ${userId}`, error as Error);
    throw error;
  }
}

/**
 * Get predefined workspace preference templates
 */
export function getWorkspacePreferenceTemplates(): WorkspacePreferenceTemplate[] {
  return [
    {
      name: 'Standard Business Hours',
      description: '9 AM to 5 PM, Monday through Friday with 1-hour lunch',
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
    },
    {
      name: 'Flexible Hours',
      description: '8 AM to 4 PM with flexible lunch and break times',
      weeklyHours: {
        monday: { start: '08:00', end: '16:00' },
        tuesday: { start: '08:00', end: '16:00' },
        wednesday: { start: '08:00', end: '16:00' },
        thursday: { start: '08:00', end: '16:00' },
        friday: { start: '08:00', end: '16:00' },
        saturday: null,
        sunday: null,
      },
      breakTimes: {
        morning: { start: '10:00', end: '10:15' },
        lunch: { start: '12:30', end: '13:30' },
        afternoon: { start: '15:00', end: '15:15' },
      },
      timezone: 'UTC',
    },
    {
      name: 'Extended Hours',
      description: '7 AM to 6 PM, Monday through Friday for longer workdays',
      weeklyHours: {
        monday: { start: '07:00', end: '18:00' },
        tuesday: { start: '07:00', end: '18:00' },
        wednesday: { start: '07:00', end: '18:00' },
        thursday: { start: '07:00', end: '18:00' },
        friday: { start: '07:00', end: '18:00' },
        saturday: null,
        sunday: null,
      },
      breakTimes: {
        morning: { start: '09:30', end: '09:45' },
        lunch: { start: '12:00', end: '13:00' },
        afternoon: { start: '15:30', end: '15:45' },
      },
      timezone: 'UTC',
    },
    {
      name: 'Four Day Week',
      description: 'Tuesday through Friday, 9 AM to 6 PM for compressed schedule',
      weeklyHours: {
        monday: null,
        tuesday: { start: '09:00', end: '18:00' },
        wednesday: { start: '09:00', end: '18:00' },
        thursday: { start: '09:00', end: '18:00' },
        friday: { start: '09:00', end: '18:00' },
        saturday: null,
        sunday: null,
      },
      breakTimes: {
        lunch: { start: '12:00', end: '13:00' },
        afternoon: { start: '15:00', end: '15:15' },
      },
      timezone: 'UTC',
    },
  ];
}

/**
 * Apply a workspace template to user preferences
 */
export async function applyPreferenceTemplate(
  userId: string,
  workspaceId: string,
  templateName: string,
  timezone?: string
): Promise<PreferencesWithMeta> {
  try {
    Logger.info(LogCategory.AUTH, `Applying template "${templateName}" for user ${userId} in workspace ${workspaceId}`);

    const templates = getWorkspacePreferenceTemplates();
    const template = templates.find(t => t.name === templateName);
    
    if (!template) {
      throw new Error(`Template "${templateName}" not found. Available templates: ${templates.map(t => t.name).join(', ')}`);
    }

    // Apply template with optional timezone override
    const templateData = {
      weeklyHours: template.weeklyHours,
      breakTimes: template.breakTimes,
      timezone: timezone || template.timezone,
    };

    return await createUserPreferences(userId, workspaceId, templateData);
  } catch (error) {
    Logger.error(LogCategory.AUTH, `Failed to apply template for user ${userId}`, error as Error);
    throw error;
  }
}