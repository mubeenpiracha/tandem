/**
 * AI-powered task detection service using OpenAI
 * 
 * This module provides intelligent task detection from Slack messages
 * using OpenAI's GPT models to identify actionable tasks with workspace isolation
 * and performance optimizations.
 */

import OpenAI from 'openai';
import { config } from '../../config';
import { Logger, LogCategory } from '../../utils/logger';
import { createHash } from 'crypto';

// Redis for caching
let redis: any = null;
try {
  redis = require('../redis').client;
} catch (error) {
  Logger.error(LogCategory.SYSTEM, 'Redis not available for AI caching', error as Error);
}

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
});

// Task detection response interface
export interface DetectedTask {
  title: string;
  description?: string;
  dueDate?: string; // ISO date string
  estimatedDuration: number; // minutes
  importance: 'LOW' | 'MEDIUM' | 'HIGH';
  confidence: number; // 0-1 confidence score
}

export interface TaskDetectionResult {
  isTask: boolean;
  confidence: number;
  tasks: DetectedTask[];
  reasoning?: string;
  cached?: boolean;
  processingTime?: number;
}

// Performance metrics interface
export interface AIPerformanceMetrics {
  requestCount: number;
  cacheHitRate: number;
  averageResponseTime: number;
  errorRate: number;
  workspaceRequestCounts: Record<string, number>;
}

// Global performance tracking
const performanceMetrics: AIPerformanceMetrics = {
  requestCount: 0,
  cacheHitRate: 0,
  averageResponseTime: 0,
  errorRate: 0,
  workspaceRequestCounts: {},
};

// Request batching for workspace isolation
const workspaceBatches = new Map<string, Array<{
  resolve: (value: TaskDetectionResult) => void;
  reject: (error: Error) => void;
  messageText: string;
  channelContext?: string;
  userContext?: string;
  requestId: string;
}>>();

// Batch processing timeout
const BATCH_TIMEOUT = 2000; // 2 seconds
const MAX_BATCH_SIZE = 5; // Maximum messages per batch

// System prompt for task detection
const TASK_DETECTION_PROMPT = `You are an expert assistant that identifies actionable tasks from Slack messages. Analyze the message and determine if it contains any actionable tasks.

CRITERIA FOR TASKS:
- Must be actionable (something someone can do)
- Should have a clear outcome or deliverable
- Can be completed by a person
- Is not just information sharing or discussion

RESPONSE FORMAT (JSON only):
{
  "isTask": boolean,
  "confidence": number (0-1),
  "tasks": [
    {
      "title": "Clear, concise task title",
      "description": "Optional detailed description",
      "dueDate": "ISO date string if mentioned, null otherwise",
      "estimatedDuration": number in minutes (15-480),
      "importance": "LOW|MEDIUM|HIGH",
      "confidence": number (0-1)
    }
  ],
  "reasoning": "Brief explanation of your analysis"
}

GUIDELINES:
- Be conservative - only identify clear, actionable tasks
- Estimate duration realistically (15 min to 8 hours)
- Importance based on urgency indicators, impact, or explicit priority
- Include due dates only if explicitly mentioned or strongly implied
- Multiple tasks can be extracted from one message
- Confidence should reflect certainty of task identification`;

/**
 * Optimized task detection with caching and workspace isolation
 */
export async function detectTasksFromMessage(
  messageText: string,
  workspaceId: string,
  channelContext?: string,
  userContext?: string
): Promise<TaskDetectionResult> {
  const startTime = Date.now();
  const requestId = generateRequestId(messageText, workspaceId);
  
  try {
    // Update metrics
    performanceMetrics.requestCount++;
    performanceMetrics.workspaceRequestCounts[workspaceId] = 
      (performanceMetrics.workspaceRequestCounts[workspaceId] || 0) + 1;

    Logger.info(LogCategory.SYSTEM, `Starting task detection for workspace ${workspaceId}`, {
      requestId,
      messageLength: messageText.length,
    });

    // Try cache first
    const cacheKey = generateCacheKey(messageText, channelContext, userContext);
    const cachedResult = await getCachedResult(cacheKey);
    
    if (cachedResult) {
      Logger.info(LogCategory.SYSTEM, `Cache hit for request ${requestId}`);
      performanceMetrics.cacheHitRate = 
        (performanceMetrics.cacheHitRate * (performanceMetrics.requestCount - 1) + 1) / performanceMetrics.requestCount;
      
      return {
        ...cachedResult,
        cached: true,
        processingTime: Date.now() - startTime,
      };
    }

    // Use batching for workspace isolation
    const result = await processBatchedRequest(
      messageText,
      workspaceId,
      channelContext,
      userContext,
      requestId
    );

    // Cache the result
    await cacheResult(cacheKey, result);

    // Update metrics
    const processingTime = Date.now() - startTime;
    performanceMetrics.averageResponseTime = 
      (performanceMetrics.averageResponseTime * (performanceMetrics.requestCount - 1) + processingTime) / performanceMetrics.requestCount;

    Logger.info(LogCategory.SYSTEM, `Task detection completed for workspace ${workspaceId}`, {
      requestId,
      processingTime,
      tasksFound: result.tasks.length,
      confidence: result.confidence,
    });

    return {
      ...result,
      cached: false,
      processingTime,
    };
  } catch (error) {
    performanceMetrics.errorRate = 
      (performanceMetrics.errorRate * (performanceMetrics.requestCount - 1) + 1) / performanceMetrics.requestCount;

    Logger.error(LogCategory.SYSTEM, `Task detection failed for workspace ${workspaceId}`, error as Error, {
      requestId,
      messageLength: messageText.length,
    });
    
    // Return safe fallback result
    return {
      isTask: false,
      confidence: 0,
      tasks: [],
      reasoning: `Error during analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
      cached: false,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Process batched requests for workspace isolation
 */
async function processBatchedRequest(
  messageText: string,
  workspaceId: string,
  channelContext?: string,
  userContext?: string,
  requestId?: string
): Promise<TaskDetectionResult> {
  return new Promise((resolve, reject) => {
    // Get or create batch for workspace
    let batch = workspaceBatches.get(workspaceId);
    if (!batch) {
      batch = [];
      workspaceBatches.set(workspaceId, batch);
    }

    // Add request to batch
    batch.push({
      resolve,
      reject,
      messageText,
      channelContext,
      userContext,
      requestId: requestId || 'unknown',
    });

    // Process batch if it's full or after timeout
    if (batch.length >= MAX_BATCH_SIZE) {
      processBatch(workspaceId);
    } else if (batch.length === 1) {
      // Set timeout for first request in batch
      setTimeout(() => processBatch(workspaceId), BATCH_TIMEOUT);
    }
  });
}

/**
 * Process a batch of requests for a workspace
 */
async function processBatch(workspaceId: string): Promise<void> {
  const batch = workspaceBatches.get(workspaceId);
  if (!batch || batch.length === 0) return;

  // Clear the batch
  workspaceBatches.delete(workspaceId);

  Logger.info(LogCategory.SYSTEM, `Processing batch for workspace ${workspaceId}`, {
    batchSize: batch.length,
  });

  try {
    // Process requests in parallel but rate-limited
    const results = await Promise.allSettled(
      batch.map(request => 
        processIndividualRequest(
          request.messageText,
          request.channelContext,
          request.userContext
        )
      )
    );

    // Resolve each request with its result
    results.forEach((result, index) => {
      const request = batch[index];
      if (result.status === 'fulfilled') {
        request.resolve(result.value);
      } else {
        request.reject(new Error(`Batch processing failed: ${result.reason}`));
      }
    });
  } catch (error) {
    // Reject all requests in batch
    batch.forEach(request => {
      request.reject(error as Error);
    });
  }
}

/**
 * Process individual request (original logic)
 */
async function processIndividualRequest(
  messageText: string,
  channelContext?: string,
  userContext?: string
): Promise<TaskDetectionResult> {
  // Prepare the message for analysis
  const context = buildContextualPrompt(messageText, channelContext, userContext);

  const completion = await openai.chat.completions.create({
    model: config.openai.model,
    messages: [
      {
        role: 'system',
        content: TASK_DETECTION_PROMPT,
      },
      {
        role: 'user',
        content: context,
      },
    ],
    max_tokens: config.openai.maxTokens,
    temperature: config.openai.temperature,
    response_format: { type: 'json_object' },
  });

  const response = completion.choices[0]?.message?.content;
  if (!response) {
    throw new Error('No response from OpenAI');
  }

  // Parse and validate the response
  const result = JSON.parse(response) as TaskDetectionResult;
  
  // Validate and sanitize the result
  return validateAndSanitizeResult(result);
}

/**
 * Generate cache key for request
 */
function generateCacheKey(
  messageText: string,
  channelContext?: string,
  userContext?: string
): string {
  const content = `${messageText}|${channelContext || ''}|${userContext || ''}`;
  return `task_detection:${createHash('sha256').update(content).digest('hex')}`;
}

/**
 * Generate request ID for tracking
 */
function generateRequestId(messageText: string, workspaceId: string): string {
  const hash = createHash('md5').update(`${messageText}_${workspaceId}_${Date.now()}`).digest('hex');
  return hash.substring(0, 8);
}

/**
 * Get cached result
 */
async function getCachedResult(cacheKey: string): Promise<TaskDetectionResult | null> {
  if (!redis) return null;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (error) {
    Logger.error(LogCategory.SYSTEM, 'Cache read failed', error as Error);
  }
  
  return null;
}

/**
 * Cache result with TTL
 */
async function cacheResult(cacheKey: string, result: TaskDetectionResult): Promise<void> {
  if (!redis) return;

  try {
    // Cache for 1 hour
    await redis.setex(cacheKey, 3600, JSON.stringify(result));
  } catch (error) {
    Logger.error(LogCategory.SYSTEM, 'Cache write failed', error as Error);
  }
}

/**
 * Get performance metrics
 */
export function getPerformanceMetrics(): AIPerformanceMetrics {
  return { ...performanceMetrics };
}

/**
 * Reset performance metrics
 */
export function resetPerformanceMetrics(): void {
  performanceMetrics.requestCount = 0;
  performanceMetrics.cacheHitRate = 0;
  performanceMetrics.averageResponseTime = 0;
  performanceMetrics.errorRate = 0;
  performanceMetrics.workspaceRequestCounts = {};
}

/**
 * Get workspace-specific metrics
 */
export function getWorkspaceMetrics(workspaceId: string): {
  requestCount: number;
  percentageOfTotal: number;
} {
  const workspaceCount = performanceMetrics.workspaceRequestCounts[workspaceId] || 0;
  const totalCount = performanceMetrics.requestCount || 1;
  
  return {
    requestCount: workspaceCount,
    percentageOfTotal: (workspaceCount / totalCount) * 100,
  };
}

/**
 * Build contextual prompt with additional information
 */
function buildContextualPrompt(
  messageText: string,
  channelContext?: string,
  userContext?: string
): string {
  let prompt = `MESSAGE TO ANALYZE:\n"${messageText}"`;

  if (channelContext) {
    prompt += `\n\nCHANNEL CONTEXT:\n${channelContext}`;
  }

  if (userContext) {
    prompt += `\n\nUSER CONTEXT:\n${userContext}`;
  }

  return prompt;
}

/**
 * Validate and sanitize the AI response
 */
function validateAndSanitizeResult(result: any): TaskDetectionResult {
  // Ensure basic structure
  if (typeof result !== 'object' || result === null) {
    throw new Error('Invalid response format');
  }

  // Validate isTask
  if (typeof result.isTask !== 'boolean') {
    result.isTask = false;
  }

  // Validate confidence
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
    result.confidence = 0;
  }

  // Validate tasks array
  if (!Array.isArray(result.tasks)) {
    result.tasks = [];
  }

  // Validate each task
  result.tasks = result.tasks
    .filter((task: any) => task && typeof task === 'object')
    .map((task: any) => validateAndSanitizeTask(task))
    .filter((task: DetectedTask | null) => task !== null);

  // Ensure reasoning is a string
  if (typeof result.reasoning !== 'string') {
    result.reasoning = 'No reasoning provided';
  }

  // Apply confidence threshold
  if (result.confidence < config.taskDetection.confidenceThreshold) {
    result.isTask = false;
    result.tasks = [];
  }

  return result as TaskDetectionResult;
}

/**
 * Validate and sanitize a single task
 */
function validateAndSanitizeTask(task: any): DetectedTask | null {
  try {
    // Validate title
    if (!task.title || typeof task.title !== 'string' || task.title.trim().length === 0) {
      return null;
    }

    // Sanitize and validate fields
    const sanitizedTask: DetectedTask = {
      title: task.title.trim().substring(0, 255), // Limit title length
      estimatedDuration: validateDuration(task.estimatedDuration),
      importance: validateImportance(task.importance),
      confidence: validateConfidence(task.confidence),
    };

    // Optional description
    if (task.description && typeof task.description === 'string') {
      sanitizedTask.description = task.description.trim().substring(0, 1000); // Limit description
    }

    // Optional due date
    if (task.dueDate && typeof task.dueDate === 'string') {
      const parsedDate = new Date(task.dueDate);
      if (!isNaN(parsedDate.getTime()) && parsedDate > new Date()) {
        sanitizedTask.dueDate = parsedDate.toISOString();
      }
    }

    return sanitizedTask;
  } catch (error) {
    console.error('Task validation failed:', error);
    return null;
  }
}

/**
 * Validate duration (15 minutes to 8 hours)
 */
function validateDuration(duration: any): number {
  if (typeof duration === 'number' && duration >= 15 && duration <= 480) {
    return duration;
  }
  return 60; // Default to 1 hour
}

/**
 * Validate importance level
 */
function validateImportance(importance: any): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (typeof importance === 'string' && ['LOW', 'MEDIUM', 'HIGH'].includes(importance.toUpperCase())) {
    return importance.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH';
  }
  return 'MEDIUM'; // Default importance
}

/**
 * Validate confidence score
 */
function validateConfidence(confidence: any): number {
  if (typeof confidence === 'number' && confidence >= 0 && confidence <= 1) {
    return confidence;
  }
  return 0.5; // Default confidence
}

/**
 * Check if OpenAI service is available
 */
export async function checkOpenAIHealth(): Promise<boolean> {
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Test' }],
      max_tokens: 5,
    });
    
    return completion.choices.length > 0;
  } catch (error) {
    console.error('OpenAI health check failed:', error);
    return false;
  }
}

/**
 * Get comprehensive AI service statistics
 */
export async function getAIServiceStats() {
  const isHealthy = await checkOpenAIHealth();
  const metrics = getPerformanceMetrics();
  
  return {
    // Configuration
    model: config.openai.model,
    maxTokens: config.openai.maxTokens,
    temperature: config.openai.temperature,
    confidenceThreshold: config.taskDetection.confidenceThreshold,
    
    // Health
    available: isHealthy,
    
    // Performance metrics
    performance: {
      totalRequests: metrics.requestCount,
      cacheHitRate: `${(metrics.cacheHitRate * 100).toFixed(2)}%`,
      averageResponseTime: `${metrics.averageResponseTime.toFixed(0)}ms`,
      errorRate: `${(metrics.errorRate * 100).toFixed(2)}%`,
    },
    
    // Workspace distribution
    workspaceDistribution: Object.entries(metrics.workspaceRequestCounts)
      .map(([workspaceId, count]) => ({
        workspaceId,
        requestCount: count,
        percentage: `${((count / metrics.requestCount) * 100).toFixed(1)}%`,
      }))
      .sort((a, b) => b.requestCount - a.requestCount),
    
    // System status
    caching: {
      enabled: redis !== null,
      status: redis ? 'Available' : 'Disabled',
    },
    
    batching: {
      maxBatchSize: MAX_BATCH_SIZE,
      batchTimeout: `${BATCH_TIMEOUT}ms`,
      activeBatches: workspaceBatches.size,
    },
  };
}