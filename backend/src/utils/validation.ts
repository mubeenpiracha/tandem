/**
 * Validation utilities for task detection workflow
 * 
 * This module provides validation functions and error handling
 * for the task detection and confirmation process.
 */

import { z } from 'zod';
import type { TaskStatus } from '@prisma/client';

// Common validation schemas
export const SlackUserIdSchema = z.string().regex(/^[A-Z0-9]+$/, 'Invalid Slack user ID format');
export const SlackChannelIdSchema = z.string().regex(/^[A-Z0-9]+$/, 'Invalid Slack channel ID format');
export const SlackMessageIdSchema = z.string().regex(/^\d+\.\d+$/, 'Invalid Slack message ID format');
export const SlackTeamIdSchema = z.string().regex(/^[A-Z0-9]+$/, 'Invalid Slack team ID format');
export const UuidSchema = z.string().uuid('Invalid UUID format');

// Workspace validation schemas
export const WorkspaceContextSchema = z.object({
  id: UuidSchema,
  slackTeamId: SlackTeamIdSchema,
  slackTeamName: z.string().min(1, 'Workspace name cannot be empty'),
});

export const WorkspaceScopedOperationSchema = z.object({
  workspaceId: UuidSchema,
  userId: SlackUserIdSchema.optional(),
  resourceId: UuidSchema.optional(),
});

// Task detection validation schemas
export const TaskDetectionInputSchema = z.object({
  messageId: SlackMessageIdSchema,
  channelId: SlackChannelIdSchema,
  threadId: SlackMessageIdSchema.optional(),
  userId: SlackUserIdSchema,
  messageText: z.string().min(1, 'Message text cannot be empty').max(4000, 'Message text too long'),
  messageTimestamp: z.string().datetime('Invalid timestamp format'),
});

export const DetectedTaskSchema = z.object({
  title: z.string().min(1, 'Task title cannot be empty').max(255, 'Task title too long'),
  description: z.string().max(1000, 'Task description too long').optional(),
  dueDate: z.string().datetime().optional(),
  estimatedDuration: z.number().int().min(5, 'Duration must be at least 5 minutes').max(480, 'Duration cannot exceed 8 hours'),
  importance: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  confidence: z.number().min(0, 'Confidence must be between 0 and 1').max(1, 'Confidence must be between 0 and 1'),
});

export const TaskDetectionResultSchema = z.object({
  isTask: z.boolean(),
  confidence: z.number().min(0).max(1),
  tasks: z.array(DetectedTaskSchema),
  reasoning: z.string().optional(),
});

// Task confirmation validation schemas
export const TaskConfirmationSchema = z.object({
  taskId: UuidSchema,
  action: z.enum(['confirm', 'dismiss', 'modify']),
  userId: SlackUserIdSchema,
});

// Custom error classes
export class TaskDetectionError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'TaskDetectionError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public value: any
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class WorkspaceValidationError extends Error {
  constructor(
    message: string,
    public workspaceId?: string,
    public code: string = 'WORKSPACE_VALIDATION_ERROR'
  ) {
    super(message);
    this.name = 'WorkspaceValidationError';
  }
}

export class WorkspaceAccessError extends Error {
  constructor(
    message: string,
    public workspaceId: string,
    public userId?: string,
    public resourceId?: string
  ) {
    super(message);
    this.name = 'WorkspaceAccessError';
  }
}

export class SlackAPIError extends Error {
  constructor(
    message: string,
    public slackError: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'SlackAPIError';
  }
}

export class OpenAIError extends Error {
  constructor(
    message: string,
    public openaiError: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'OpenAIError';
  }
}

/**
 * Validate workspace context exists and is properly formed
 */
export function validateWorkspaceContext(workspace: any): asserts workspace is z.infer<typeof WorkspaceContextSchema> {
  if (!workspace) {
    throw new WorkspaceValidationError('Workspace context is required', undefined, 'MISSING_WORKSPACE_CONTEXT');
  }
  
  const result = WorkspaceContextSchema.safeParse(workspace);
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new WorkspaceValidationError(
      `Invalid workspace context: ${firstError.message}`,
      workspace.id,
      'INVALID_WORKSPACE_CONTEXT'
    );
  }
}

/**
 * Validate workspace-scoped operation parameters
 */
export function validateWorkspaceScopedOperation(data: any): asserts data is z.infer<typeof WorkspaceScopedOperationSchema> {
  const result = WorkspaceScopedOperationSchema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new ValidationError(
      `Invalid workspace-scoped operation: ${firstError.message}`,
      firstError.path.join('.'),
      data
    );
  }
}

/**
 * Validate that a user belongs to a specific workspace
 */
export function validateUserWorkspaceAccess(
  userId: string,
  userWorkspaceId: string,
  requestedWorkspaceId: string,
  resourceType: string = 'resource'
): void {
  if (userWorkspaceId !== requestedWorkspaceId) {
    throw new WorkspaceAccessError(
      `Access denied: User does not have access to ${resourceType} in this workspace`,
      requestedWorkspaceId,
      userId
    );
  }
}

/**
 * Validate that a resource belongs to a specific workspace
 */
export function validateResourceWorkspaceAccess(
  resourceId: string,
  resourceWorkspaceId: string,
  requestedWorkspaceId: string,
  resourceType: string = 'resource'
): void {
  if (resourceWorkspaceId !== requestedWorkspaceId) {
    throw new WorkspaceAccessError(
      `Access denied: ${resourceType} does not belong to this workspace`,
      requestedWorkspaceId,
      undefined,
      resourceId
    );
  }
}

/**
 * Validate Slack team ID format and workspace consistency
 */
export function validateSlackTeamId(teamId: string, workspaceTeamId?: string): void {
  const result = SlackTeamIdSchema.safeParse(teamId);
  if (!result.success) {
    throw new ValidationError(
      'Invalid Slack team ID format',
      'slackTeamId',
      teamId
    );
  }
  
  if (workspaceTeamId && teamId !== workspaceTeamId) {
    throw new WorkspaceValidationError(
      'Slack team ID does not match workspace',
      undefined,
      'TEAM_ID_MISMATCH'
    );
  }
}

/**
 * Validate task detection job data
 */
export function validateTaskDetectionData(data: any): asserts data is z.infer<typeof TaskDetectionInputSchema> {
  const result = TaskDetectionInputSchema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new ValidationError(
      `Invalid task detection data: ${firstError.message}`,
      firstError.path.join('.'),
      data
    );
  }
}

/**
 * Validate detected task data from AI
 */
export function validateDetectedTasks(data: any): asserts data is z.infer<typeof TaskDetectionResultSchema> {
  const result = TaskDetectionResultSchema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new TaskDetectionError(
      `Invalid AI response: ${firstError.message}`,
      'INVALID_AI_RESPONSE',
      result.error.issues
    );
  }
}

/**
 * Validate task confirmation data
 */
export function validateTaskConfirmation(data: any): asserts data is z.infer<typeof TaskConfirmationSchema> {
  const result = TaskConfirmationSchema.safeParse(data);
  if (!result.success) {
    const firstError = result.error.issues[0];
    throw new ValidationError(
      `Invalid task confirmation: ${firstError.message}`,
      firstError.path.join('.'),
      data
    );
  }
}

/**
 * Sanitize message text for AI processing
 */
export function sanitizeMessageText(text: string): string {
  // Remove excessive whitespace
  text = text.replace(/\s+/g, ' ').trim();
  
  // Remove Slack formatting that might confuse AI
  text = text.replace(/<@[A-Z0-9]+>/g, '@user'); // Replace user mentions
  text = text.replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1'); // Replace channel mentions
  text = text.replace(/<https?:\/\/[^>]+\|([^>]+)>/g, '$1'); // Replace links with titles
  text = text.replace(/<https?:\/\/[^>]+>/g, '[link]'); // Replace bare links
  
  // Remove excessive emoji sequences
  text = text.replace(/[\u{1F600}-\u{1F64F}]{3,}/gu, '😊'); // Emoticons
  text = text.replace(/[\u{1F300}-\u{1F5FF}]{3,}/gu, '🔗'); // Symbols
  text = text.replace(/[\u{1F680}-\u{1F6FF}]{3,}/gu, '🚀'); // Transport
  
  return text;
}

/**
 * Check if message should be processed for task detection
 */
export function shouldProcessMessage(
  messageText: string,
  userId: string,
  channelType?: string
): { shouldProcess: boolean; reason?: string } {
  
  // Skip empty messages
  if (!messageText.trim()) {
    return { shouldProcess: false, reason: 'Empty message' };
  }
  
  // Skip very short messages (likely not tasks)
  if (messageText.length < 10) {
    return { shouldProcess: false, reason: 'Message too short' };
  }
  
  // Skip messages that are just links
  const linkOnlyPattern = /^(<https?:\/\/[^>]+>\s*)+$/;
  if (linkOnlyPattern.test(messageText)) {
    return { shouldProcess: false, reason: 'Link-only message' };
  }
  
  // Skip messages that are just mentions
  const mentionOnlyPattern = /^(<@[A-Z0-9]+>\s*)+$/;
  if (mentionOnlyPattern.test(messageText)) {
    return { shouldProcess: false, reason: 'Mention-only message' };
  }
  
  // Skip messages that are just emoji
  const emojiOnlyPattern = /^[\u{1F600}-\u{1F6FF}\s]+$/u;
  if (emojiOnlyPattern.test(messageText)) {
    return { shouldProcess: false, reason: 'Emoji-only message' };
  }
  
  // Skip messages in DM channels for now (to avoid processing bot responses)
  if (channelType === 'im') {
    return { shouldProcess: false, reason: 'Direct message channel' };
  }
  
  return { shouldProcess: true };
}

/**
 * Validate task status transition
 */
export function validateTaskStatusTransition(
  currentStatus: TaskStatus,
  newStatus: TaskStatus
): { isValid: boolean; error?: string } {
  
  const validTransitions: Record<TaskStatus, TaskStatus[]> = {
    PENDING: ['CONFIRMED', 'DISMISSED'],
    CONFIRMED: ['SCHEDULED', 'DISMISSED'],
    SCHEDULED: ['COMPLETED', 'DISMISSED'],
    COMPLETED: [], // No transitions from completed
    DISMISSED: [], // No transitions from dismissed
  };
  
  const allowedTransitions = validTransitions[currentStatus];
  
  if (!allowedTransitions.includes(newStatus)) {
    return {
      isValid: false,
      error: `Invalid status transition from ${currentStatus} to ${newStatus}`,
    };
  }
  
  return { isValid: true };
}

/**
 * Create standardized error response for API
 */
export function createErrorResponse(error: Error) {
  if (error instanceof ValidationError) {
    return {
      error: 'Validation error',
      message: error.message,
      field: error.field,
      code: 'VALIDATION_ERROR',
    };
  }
  
  if (error instanceof WorkspaceValidationError) {
    return {
      error: 'Workspace validation error',
      message: error.message,
      workspaceId: error.workspaceId,
      code: error.code,
    };
  }
  
  if (error instanceof WorkspaceAccessError) {
    return {
      error: 'Workspace access denied',
      message: error.message,
      workspaceId: error.workspaceId,
      userId: error.userId,
      resourceId: error.resourceId,
      code: 'WORKSPACE_ACCESS_DENIED',
    };
  }
  
  if (error instanceof TaskDetectionError) {
    return {
      error: 'Task detection error',
      message: error.message,
      code: error.code,
      details: error.details,
    };
  }
  
  if (error instanceof SlackAPIError) {
    return {
      error: 'Slack API error',
      message: error.message,
      slackError: error.slackError,
      code: 'SLACK_API_ERROR',
    };
  }
  
  if (error instanceof OpenAIError) {
    return {
      error: 'AI service error',
      message: error.message,
      code: 'AI_SERVICE_ERROR',
    };
  }
  
  // Generic error
  return {
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong',
    code: 'INTERNAL_ERROR',
  };
}

/**
 * Rate limiting validation
 */
export function validateRateLimit(
  userId: string,
  action: string,
  maxPerMinute: number = 10
): { allowed: boolean; retryAfter?: number } {
  // TODO: Implement actual rate limiting with Redis
  // For now, always allow
  return { allowed: true };
}

/**
 * Generic validation result type
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: Array<{
    path: string;
    message: string;
  }>;
}

/**
 * Generic validation function using Zod schemas
 */
export function validate<T>(schema: z.ZodSchema<T>, data: any): ValidationResult<T> {
  try {
    const result = schema.safeParse(data);
    
    if (result.success) {
      return {
        success: true,
        data: result.data,
      };
    } else {
      return {
        success: false,
        errors: result.error.issues.map((issue: any) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      };
    }
  } catch (error) {
    return {
      success: false,
      errors: [{
        path: 'root',
        message: error instanceof Error ? error.message : 'Validation failed',
      }],
    };
  }
}

/**
 * Log task detection metrics for monitoring with workspace context
 */
export function logTaskDetectionMetrics(
  userId: string,
  messageId: string,
  result: {
    tasksDetected: number;
    tasksCreated: number;
    processingTime: number;
    confidence?: number;
  },
  workspaceContext?: { id: string; slackTeamName: string }
): void {
  const workspaceInfo = workspaceContext 
    ? `[Workspace: ${workspaceContext.slackTeamName}]` 
    : '[Unknown Workspace]';
    
  console.log(`📊 ${workspaceInfo} Task Detection Metrics [${messageId}]:`, {
    userId,
    workspaceId: workspaceContext?.id,
    ...result,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log workspace validation events for security monitoring
 */
export function logWorkspaceValidation(
  event: 'access_granted' | 'access_denied' | 'validation_failed',
  details: {
    userId?: string;
    workspaceId?: string;
    resourceType?: string;
    resourceId?: string;
    reason?: string;
  }
): void {
  const level = event === 'access_denied' ? '🚨' : event === 'validation_failed' ? '⚠️' : '✅';
  
  console.log(`${level} Workspace Validation [${event}]:`, {
    ...details,
    timestamp: new Date().toISOString(),
  });
}