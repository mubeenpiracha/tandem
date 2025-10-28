/**
 * AI-powered task detection service using OpenAI
 * 
 * This module provides intelligent task detection from Slack messages
 * using OpenAI's GPT models to identify actionable tasks.
 */

import OpenAI from 'openai';
import { config } from '../../config';

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
}

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
 * Detect tasks from a Slack message using OpenAI
 */
export async function detectTasksFromMessage(
  messageText: string,
  channelContext?: string,
  userContext?: string
): Promise<TaskDetectionResult> {
  try {
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
  } catch (error) {
    console.error('Task detection failed:', error);
    
    // Return safe fallback result
    return {
      isTask: false,
      confidence: 0,
      tasks: [],
      reasoning: `Error during analysis: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
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
 * Get AI service statistics
 */
export async function getAIServiceStats() {
  return {
    model: config.openai.model,
    maxTokens: config.openai.maxTokens,
    temperature: config.openai.temperature,
    confidenceThreshold: config.taskDetection.confidenceThreshold,
    available: await checkOpenAIHealth(),
  };
}