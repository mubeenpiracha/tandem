/**
 * User Preferences Routes
 * 
 * This module provides REST API endpoints for managing user work preferences
 * including work hours, break times, and scheduling preferences with workspace context.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { workspaceMiddleware } from '../middleware/workspace';
import {
  getUserPreferences,
  updateUserPreferences,
  createUserPreferences,
  resetUserPreferences,
  initializeUserPreferences,
  validatePreferences,
  getWorkspacePreferenceTemplates,
  applyPreferenceTemplate,
} from '../services/preferences/preferences_manager';
import { Logger, LogCategory } from '../utils/logger';

const router = Router();

// Validation schemas
const WorkHoursSchema = z.object({
  start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
  end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)'),
});

const WeeklyHoursSchema = z.record(
  z.string(),
  z.union([WorkHoursSchema, z.null()])
);

const BreakTimesSchema = z.record(
  z.string(),
  WorkHoursSchema
);

const CreatePreferencesSchema = z.object({
  weeklyHours: WeeklyHoursSchema,
  breakTimes: BreakTimesSchema,
  timezone: z.string().min(1, 'Timezone is required'),
});

const UpdatePreferencesSchema = z.object({
  weeklyHours: WeeklyHoursSchema.optional(),
  breakTimes: BreakTimesSchema.optional(),
  timezone: z.string().min(1).optional(),
});

const ApplyTemplateSchema = z.object({
  templateName: z.string().min(1, 'Template name is required'),
  timezone: z.string().optional(),
});

// Middleware to extract userId from auth token
function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // In a real implementation, this would decode JWT token
  // For now, we'll use a placeholder
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: 'Authentication required',
    });
    return;
  }

  // Mock user ID extraction - replace with real JWT decoding
  (req as any).userId = 'mock-user-id';
  next();
}

/**
 * GET /preferences
 * Get user's work preferences
 */
router.get('/', authMiddleware, workspaceMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;

    Logger.info(LogCategory.AUTH, `Getting preferences for user ${userId} in workspace ${workspaceId}`);

    const preferences = await getUserPreferences(userId, workspaceId);

    res.status(200).json({
      success: true,
      preferences,
    });
  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Failed to get user preferences', error as Error);
    next(error);
  }
});

/**
 * POST /preferences
 * Create user's work preferences
 */
router.post('/', authMiddleware, workspaceMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;

    // Validate request body
    const validation = CreatePreferencesSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const { weeklyHours, breakTimes, timezone } = validation.data;

    Logger.info(LogCategory.AUTH, `Creating preferences for user ${userId} in workspace ${workspaceId}`);

    const preferences = await createUserPreferences(userId, workspaceId, {
      weeklyHours,
      breakTimes,
      timezone,
    });

    res.status(201).json({
      success: true,
      preferences,
      message: 'Work preferences created successfully',
    });
  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Failed to create user preferences', error as Error);
    
    if ((error as Error).message.includes('Validation failed')) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: (error as Error).message,
      });
    }
    
    next(error);
  }
});

/**
 * PUT /preferences
 * Update user's work preferences
 */
router.put('/', authMiddleware, workspaceMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;

    // Validate request body
    const validation = UpdatePreferencesSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const updateData = validation.data;

    Logger.info(LogCategory.AUTH, `Updating preferences for user ${userId} in workspace ${workspaceId}`);

    const preferences = await updateUserPreferences(userId, workspaceId, updateData);

    res.status(200).json({
      success: true,
      preferences,
      message: 'Work preferences updated successfully',
    });
  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Failed to update user preferences', error as Error);
    
    if ((error as Error).message.includes('Validation failed')) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: (error as Error).message,
      });
    }
    
    next(error);
  }
});

/**
 * POST /preferences/reset
 * Reset user's preferences to defaults
 */
router.post('/reset', authMiddleware, workspaceMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;
    const { timezone = 'UTC' } = req.body;

    Logger.info(LogCategory.AUTH, `Resetting preferences for user ${userId} in workspace ${workspaceId}`);

    const preferences = await resetUserPreferences(userId, workspaceId, timezone);

    res.status(200).json({
      success: true,
      preferences,
      message: 'Work preferences reset to defaults',
    });
  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Failed to reset user preferences', error as Error);
    next(error);
  }
});

/**
 * POST /preferences/validate
 * Validate preferences without saving
 */
router.post('/validate', authMiddleware, workspaceMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const validation = CreatePreferencesSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const { weeklyHours, breakTimes, timezone } = validation.data;

    Logger.info(LogCategory.AUTH, 'Validating preferences');

    const validationResult = validatePreferences(weeklyHours, breakTimes, timezone);

    res.status(200).json({
      success: true,
      validation: validationResult,
      message: validationResult.isValid ? 'Preferences are valid' : 'Validation errors found',
    });
  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Failed to validate preferences', error as Error);
    next(error);
  }
});

/**
 * GET /preferences/templates
 * Get available preference templates
 */
router.get('/templates', authMiddleware, workspaceMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    Logger.info(LogCategory.AUTH, 'Getting preference templates');

    const templates = getWorkspacePreferenceTemplates();

    res.status(200).json({
      success: true,
      templates,
      count: templates.length,
    });
  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Failed to get preference templates', error as Error);
    next(error);
  }
});

/**
 * POST /preferences/templates/apply
 * Apply a preference template
 */
router.post('/templates/apply', authMiddleware, workspaceMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;

    // Validate request body
    const validation = ApplyTemplateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request data',
        details: validation.error.flatten().fieldErrors,
      });
    }

    const { templateName, timezone } = validation.data;

    Logger.info(LogCategory.AUTH, `Applying template "${templateName}" for user ${userId} in workspace ${workspaceId}`);

    const preferences = await applyPreferenceTemplate(userId, workspaceId, templateName, timezone);

    res.status(200).json({
      success: true,
      preferences,
      message: `Template "${templateName}" applied successfully`,
    });
  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Failed to apply preference template', error as Error);
    
    if ((error as Error).message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: (error as Error).message,
      });
    }
    
    next(error);
  }
});

/**
 * POST /preferences/initialize
 * Initialize default preferences for a new user (used during onboarding)
 */
router.post('/initialize', authMiddleware, workspaceMiddleware, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = (req as any).userId;
    const workspaceId = req.workspace!.id;
    const { timezone = 'UTC' } = req.body;

    Logger.info(LogCategory.AUTH, `Initializing preferences for user ${userId} in workspace ${workspaceId}`);

    const preferences = await initializeUserPreferences(userId, workspaceId, timezone);

    res.status(201).json({
      success: true,
      preferences,
      message: 'Default work preferences initialized',
    });
  } catch (error) {
    Logger.error(LogCategory.AUTH, 'Failed to initialize user preferences', error as Error);
    next(error);
  }
});

export default router;