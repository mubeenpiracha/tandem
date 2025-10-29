/**
 * Task detection job processor
 * 
 * This module processes background jobs for AI-powered task detection
 * from Slack messages, handling the workflow from message analysis
 * to user confirmation via DM.
 */

import { getTaskDetectionQueue } from '../services/redis';
import { detectTasksFromMessage } from '../services/ai/taskDetector';
import { sendTaskConfirmation } from '../services/slack/dmSender';
import { createSlackMessage, updateSlackMessage, isMessageProcessed } from '../models/slackMessage';
import { createTask } from '../models/task';
import { findUserBySlackId } from '../models/user';
import { config } from '../config';
import {
  validateTaskDetectionData,
  sanitizeMessageText,
  shouldProcessMessage,
  TaskDetectionError,
  ValidationError,
  SlackAPIError,
  OpenAIError,
} from '../utils/validation';
import { Logger, createTimer, LogCategory } from '../utils/logger';

// Job data interface
export interface TaskDetectionJobData {
  workspaceId: string;
  messageId: string;
  channelId: string;
  threadId?: string;
  userId: string; // Slack user ID
  messageText: string;
  messageTimestamp: string;
}

// Job result interface
export interface TaskDetectionJobResult {
  processed: boolean;
  tasksDetected: number;
  tasksCreated: number;
  confirmationsSent: number;
  errors?: string[];
}

/**
 * Process task detection job
 */
async function processTaskDetection(data: TaskDetectionJobData): Promise<TaskDetectionJobResult> {
  const timer = createTimer('processTaskDetection', LogCategory.TASK_DETECTION);
  const result: TaskDetectionJobResult = {
    processed: false,
    tasksDetected: 0,
    tasksCreated: 0,
    confirmationsSent: 0,
    errors: [],
  };

  // Extract data for use in catch block
  const { workspaceId, messageId, channelId, threadId, userId: slackUserId, messageText, messageTimestamp } = data;

  try {
    // Validate input data
    validateTaskDetectionData(data);

    // Check if this message has already been processed to avoid duplicates
    const existingMessage = await isMessageProcessed(messageId, workspaceId);
    if (existingMessage) {
      Logger.taskDetection.completed(messageId, slackUserId, { 
        tasksDetected: 0, 
        tasksCreated: 0, 
        processingTime: timer.complete() 
      });
      result.processed = true;
      return result;
    }

    // Find user by Slack ID
    const user = await findUserBySlackId(slackUserId, workspaceId);
    if (!user) {
      throw new ValidationError(
        `User not found for Slack ID: ${slackUserId}`,
        'userId',
        slackUserId
      );
    }

    // Create SlackMessage record for tracking
    const slackMessage = await createSlackMessage({
      workspaceId,
      slackMessageId: messageId,
      slackChannelId: channelId,
      slackThreadId: threadId,
      messageTimestamp: new Date(messageTimestamp),
    });

    try {
      // Sanitize message text
      const sanitizedText = sanitizeMessageText(messageText);
      
      // Detect tasks using AI
      const detectionResult = await detectTasksFromMessage(sanitizedText, channelId, user.id);

      result.tasksDetected = detectionResult.tasks.length;

      // If no tasks detected, mark as processed
      if (!detectionResult.isTask || detectionResult.tasks.length === 0) {
        await updateSlackMessage(slackMessage.id, { 
          status: 'IGNORED',
          processedAt: new Date(),
        });
        result.processed = true;
        
        Logger.taskDetection.completed(messageId, user.id, {
          tasksDetected: 0,
          tasksCreated: 0,
          processingTime: timer.complete({ confidence: detectionResult.confidence }),
          confidence: detectionResult.confidence,
        });
        
        return result;
      }

      // Create tasks for each detected task
      const createdTasks = [];
      for (const detectedTask of detectionResult.tasks) {
        // Only create tasks above confidence threshold
        if (detectedTask.confidence >= config.taskDetection.confidenceThreshold) {
          try {
            const task = await createTask({
              userId: user.id,
              title: detectedTask.title.substring(0, 255), // Ensure title length limit
              description: detectedTask.description?.substring(0, 1000) || '', // Ensure description length limit
              dueDate: detectedTask.dueDate ? new Date(detectedTask.dueDate) : undefined,
              estimatedDuration: Math.min(Math.max(detectedTask.estimatedDuration, 5), 480), // Clamp duration
              importance: detectedTask.importance,
              slackMessageId: slackMessage.id,
            });
            
            createdTasks.push({ task, confidence: detectedTask.confidence });
            result.tasksCreated++;
            
            Logger.taskDetection.taskCreated(task.id, user.id, task.title, detectedTask.confidence);
          } catch (error) {
            const errorMsg = `Failed to create task "${detectedTask.title}": ${error}`;
            result.errors?.push(errorMsg);
            Logger.error(LogCategory.TASK_DETECTION, errorMsg, error as Error);
          }
        }
      }

      // Send confirmation messages for created tasks
      for (const { task, confidence } of createdTasks) {
        try {
          const confirmationMessageId = await sendTaskConfirmation(user.id, slackUserId, {
            taskId: task.id,
            title: task.title,
            description: task.description || '',
            dueDate: task.dueDate?.toISOString(),
            estimatedDuration: task.estimatedDuration,
            importance: task.importance,
            confidence,
          });
          
          result.confirmationsSent++;
          Logger.taskDetection.confirmationSent(task.id, user.id, confirmationMessageId);
        } catch (error) {
          const errorMsg = `Failed to send confirmation for task "${task.title}": ${error}`;
          result.errors?.push(errorMsg);
          Logger.error(LogCategory.TASK_DETECTION, errorMsg, error as Error);
        }
      }

      // Update SlackMessage status
      await updateSlackMessage(slackMessage.id, { 
        status: result.tasksCreated > 0 ? 'PROCESSED' : 'IGNORED',
        processedAt: new Date(),
      });
      result.processed = true;

      // Log successful completion
      Logger.taskDetection.completed(messageId, user.id, {
        tasksDetected: result.tasksDetected,
        tasksCreated: result.tasksCreated,
        processingTime: timer.complete({
          tasksDetected: result.tasksDetected,
          tasksCreated: result.tasksCreated,
          confirmationsSent: result.confirmationsSent,
        }),
      });

    } catch (error) {
      // Update SlackMessage status on error
      await updateSlackMessage(slackMessage.id, { 
        status: 'ERROR',
        processedAt: new Date(),
      });
      throw error;
    }

  } catch (error) {
    let errorMsg: string;
    let userId = slackUserId; // Default to slack user ID
    
    try {
      // Try to get user ID if we can find the user
      const user = await findUserBySlackId(slackUserId, workspaceId);
      if (user) userId = user.id;
    } catch {
      // Ignore error finding user for logging
    }
    
    if (error instanceof ValidationError) {
      errorMsg = `Validation error for message ${messageId}: ${error.message}`;
    } else if (error instanceof TaskDetectionError) {
      errorMsg = `Task detection error for message ${messageId}: ${error.message}`;
    } else if (error instanceof SlackAPIError) {
      errorMsg = `Slack API error for message ${messageId}: ${error.message}`;
    } else if (error instanceof OpenAIError) {
      errorMsg = `OpenAI error for message ${messageId}: ${error.message}`;
    } else {
      errorMsg = `Unexpected error for message ${messageId}: ${error}`;
    }
    
    result.errors?.push(errorMsg);
    
    // Log error and complete timing
    Logger.taskDetection.failed(messageId, userId, error as Error, timer.fail(error as Error));
  }

  return result;
}

/**
 * Start task detection worker
 */
export async function startTaskDetectionWorker(): Promise<void> {
  console.log('🚀 Starting task detection worker...');

  // Process jobs continuously
  setInterval(async () => {
    try {
      const job = await getTaskDetectionQueue().getNextJob();
      if (job) {
        const result = await processTaskDetection(job.data);
        
        if (result.errors && result.errors.length > 0) {
          await getTaskDetectionQueue().failJob(job.id, result.errors.join('; '));
        } else {
          await getTaskDetectionQueue().completeJob(job.id, result);
        }
      }
    } catch (error) {
      console.error('Task detection worker error:', error);
    }
  }, 1000); // Check for jobs every second

  console.log('✅ Task detection worker started');
}

/**
 * Add task detection job to queue
 */
export async function addTaskDetectionJob(data: TaskDetectionJobData): Promise<string> {
  try {
    const jobId = await getTaskDetectionQueue().addJob('detect-tasks', data);
    console.log(`📋 Added task detection job ${jobId} for message ${data.messageId}`);
    return jobId;
  } catch (error) {
    console.error('Failed to add task detection job:', error);
    throw error;
  }
}

/**
 * Get task detection queue statistics
 */
export async function getTaskDetectionStats() {
  try {
    return await getTaskDetectionQueue().getStats();
  } catch (error) {
    console.error('Failed to get task detection stats:', error);
    return {
      pending: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
      total: 0,
    };
  }
}