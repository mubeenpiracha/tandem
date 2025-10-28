/**
 * Logging utilities for task detection operations
 * 
 * This module provides structured logging for monitoring and debugging
 * the task detection workflow.
 */

import { config } from '../config';

// Log levels
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

// Log categories for filtering
export enum LogCategory {
  TASK_DETECTION = 'task-detection',
  SLACK_API = 'slack-api',
  OPENAI_API = 'openai-api',
  DATABASE = 'database',
  WEBHOOK = 'webhook',
  AUTH = 'auth',
  SYSTEM = 'system',
}

// Structured log entry interface
interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: any;
  userId?: string;
  messageId?: string;
  taskId?: string;
  duration?: number;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

/**
 * Format log entry as JSON or simple text
 */
function formatLogEntry(entry: LogEntry): string {
  if (config.logging.format === 'json') {
    return JSON.stringify(entry);
  }
  
  // Simple text format for development
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    `[${entry.category}]`,
    entry.message,
  ];
  
  if (entry.userId) parts.push(`user:${entry.userId}`);
  if (entry.messageId) parts.push(`msg:${entry.messageId}`);
  if (entry.taskId) parts.push(`task:${entry.taskId}`);
  if (entry.duration) parts.push(`${entry.duration}ms`);
  
  let logLine = parts.join(' ');
  
  if (entry.data) {
    logLine += '\n  Data: ' + JSON.stringify(entry.data, null, 2);
  }
  
  if (entry.error) {
    logLine += '\n  Error: ' + entry.error.message;
    if (entry.error.stack && config.isDevelopment) {
      logLine += '\n' + entry.error.stack;
    }
  }
  
  return logLine;
}

/**
 * Core logging function
 */
function log(
  level: LogLevel,
  category: LogCategory,
  message: string,
  data?: any,
  context?: {
    userId?: string;
    messageId?: string;
    taskId?: string;
    duration?: number;
    error?: Error;
  }
): void {
  
  // Check if we should log at this level
  const levels = [LogLevel.ERROR, LogLevel.WARN, LogLevel.INFO, LogLevel.DEBUG];
  const currentLevelIndex = levels.indexOf(config.logging.level as LogLevel);
  const logLevelIndex = levels.indexOf(level);
  
  if (logLevelIndex > currentLevelIndex) {
    return; // Skip logging
  }
  
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    data,
    ...context,
  };
  
  if (context?.error) {
    entry.error = {
      name: context.error.name,
      message: context.error.message,
      stack: context.error.stack,
    };
  }
  
  const logLine = formatLogEntry(entry);
  
  // Output to appropriate console method
  switch (level) {
    case LogLevel.ERROR:
      console.error(logLine);
      break;
    case LogLevel.WARN:
      console.warn(logLine);
      break;
    case LogLevel.INFO:
      console.info(logLine);
      break;
    case LogLevel.DEBUG:
      console.debug(logLine);
      break;
  }
}

// Convenience logging functions

export const Logger = {
  // Task detection logging
  taskDetection: {
    started: (messageId: string, userId: string, messageText: string) => {
      log(LogLevel.INFO, LogCategory.TASK_DETECTION, 'Task detection started', {
        messageLength: messageText.length,
        messagePreview: messageText.substring(0, 100),
      }, { messageId, userId });
    },
    
    completed: (messageId: string, userId: string, result: {
      tasksDetected: number;
      tasksCreated: number;
      processingTime: number;
      confidence?: number;
    }) => {
      log(LogLevel.INFO, LogCategory.TASK_DETECTION, 'Task detection completed', result, { 
        messageId, 
        userId, 
        duration: result.processingTime 
      });
    },
    
    failed: (messageId: string, userId: string, error: Error, duration: number) => {
      log(LogLevel.ERROR, LogCategory.TASK_DETECTION, 'Task detection failed', {}, { 
        messageId, 
        userId, 
        duration, 
        error 
      });
    },
    
    aiResponse: (messageId: string, userId: string, response: any, processingTime: number) => {
      log(LogLevel.DEBUG, LogCategory.TASK_DETECTION, 'AI task detection response', {
        isTask: response.isTask,
        confidence: response.confidence,
        taskCount: response.tasks?.length || 0,
        reasoning: response.reasoning,
      }, { messageId, userId, duration: processingTime });
    },
    
    taskCreated: (taskId: string, userId: string, taskTitle: string, confidence: number) => {
      log(LogLevel.INFO, LogCategory.TASK_DETECTION, 'Task created from detection', {
        title: taskTitle,
        confidence,
      }, { taskId, userId });
    },
    
    confirmationSent: (taskId: string, userId: string, messageId: string) => {
      log(LogLevel.INFO, LogCategory.TASK_DETECTION, 'Task confirmation sent', {}, { 
        taskId, 
        userId, 
        messageId 
      });
    },
  },
  
  // Slack API logging
  slack: {
    webhookReceived: (eventType: string, userId: string, channelId: string) => {
      log(LogLevel.INFO, LogCategory.SLACK_API, 'Slack webhook received', {
        eventType,
        channelId,
      }, { userId });
    },
    
    messageSent: (userId: string, channelId: string, messageType: string) => {
      log(LogLevel.INFO, LogCategory.SLACK_API, 'Slack message sent', {
        channelId,
        messageType,
      }, { userId });
    },
    
    interactionReceived: (userId: string, actionType: string, taskId?: string) => {
      log(LogLevel.INFO, LogCategory.SLACK_API, 'Slack interaction received', {
        actionType,
      }, { userId, taskId });
    },
    
    apiError: (userId: string, operation: string, error: Error) => {
      log(LogLevel.ERROR, LogCategory.SLACK_API, `Slack API error: ${operation}`, {
        operation,
      }, { userId, error });
    },
  },
  
  // OpenAI API logging
  openai: {
    requestSent: (messageId: string, userId: string, model: string, tokenCount: number) => {
      log(LogLevel.DEBUG, LogCategory.OPENAI_API, 'OpenAI request sent', {
        model,
        tokenCount,
      }, { messageId, userId });
    },
    
    responseReceived: (messageId: string, userId: string, tokensUsed: number, responseTime: number) => {
      log(LogLevel.DEBUG, LogCategory.OPENAI_API, 'OpenAI response received', {
        tokensUsed,
      }, { messageId, userId, duration: responseTime });
    },
    
    error: (messageId: string, userId: string, error: Error) => {
      log(LogLevel.ERROR, LogCategory.OPENAI_API, 'OpenAI API error', {}, { 
        messageId, 
        userId, 
        error 
      });
    },
  },
  
  // Database logging
  database: {
    operationStarted: (operation: string, entity: string, userId?: string) => {
      log(LogLevel.DEBUG, LogCategory.DATABASE, `Database operation started: ${operation}`, {
        operation,
        entity,
      }, { userId });
    },
    
    operationCompleted: (operation: string, entity: string, duration: number, userId?: string) => {
      log(LogLevel.DEBUG, LogCategory.DATABASE, `Database operation completed: ${operation}`, {
        operation,
        entity,
      }, { userId, duration });
    },
    
    error: (operation: string, entity: string, error: Error, userId?: string) => {
      log(LogLevel.ERROR, LogCategory.DATABASE, `Database error: ${operation}`, {
        operation,
        entity,
      }, { userId, error });
    },
  },
  
  // Authentication logging
  auth: {
    loginAttempt: (userId: string, method: string) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'Authentication attempt', {
        method,
      }, { userId });
    },
    
    loginSuccess: (userId: string, method: string) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'Authentication success', {
        method,
      }, { userId });
    },
    
    loginFailure: (userId: string, method: string, reason: string) => {
      log(LogLevel.WARN, LogCategory.AUTH, 'Authentication failure', {
        method,
        reason,
      }, { userId });
    },
    
    tokenRefresh: (userId: string, service: string) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'Token refreshed', {
        service,
      }, { userId });
    },
    
    oauthInitiated: (provider: string, state: string) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'OAuth flow initiated', {
        provider,
        state: state.substring(0, 8) + '...', // Log partial state for security
      });
    },
    
    oauthFailed: (provider: string, error: string) => {
      log(LogLevel.ERROR, LogCategory.AUTH, 'OAuth flow failed', {
        provider,
        error,
      });
    },
    
    userCreated: (userId: string, provider: string, email: string) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'New user created', {
        provider,
        email,
      }, { userId });
    },
    
    userUpdated: (userId: string, provider: string) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'User updated', {
        provider,
      }, { userId });
    },
    
    tokenStored: (userId: string, provider: string) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'OAuth token stored', {
        provider,
      }, { userId });
    },
    
    tokenRevoked: (userId: string, provider: string) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'OAuth token revoked', {
        provider,
      }, { userId });
    },
  },
  
  // System logging
  system: {
    startup: () => {
      log(LogLevel.INFO, LogCategory.SYSTEM, 'Application starting', {
        nodeEnv: config.isDevelopment ? 'development' : 'production',
        port: config.server.port,
      });
    },
    
    shutdown: () => {
      log(LogLevel.INFO, LogCategory.SYSTEM, 'Application shutting down');
    },
    
    healthCheck: (service: string, status: 'healthy' | 'unhealthy', details?: any) => {
      const level = status === 'healthy' ? LogLevel.DEBUG : LogLevel.WARN;
      log(level, LogCategory.SYSTEM, `Health check: ${service}`, {
        status,
        ...details,
      });
    },
    
    workerStarted: (workerType: string) => {
      log(LogLevel.INFO, LogCategory.SYSTEM, `Worker started: ${workerType}`);
    },
    
    workerStopped: (workerType: string) => {
      log(LogLevel.INFO, LogCategory.SYSTEM, `Worker stopped: ${workerType}`);
    },
  },
  
  // Generic logging functions
  error: (category: LogCategory, message: string, error: Error, context?: any) => {
    log(LogLevel.ERROR, category, message, context, { error });
  },
  
  warn: (category: LogCategory, message: string, data?: any, context?: any) => {
    log(LogLevel.WARN, category, message, data, context);
  },
  
  info: (category: LogCategory, message: string, data?: any, context?: any) => {
    log(LogLevel.INFO, category, message, data, context);
  },
  
  debug: (category: LogCategory, message: string, data?: any, context?: any) => {
    log(LogLevel.DEBUG, category, message, data, context);
  },
};

/**
 * Performance timing utility
 */
export class PerformanceTimer {
  private startTime: number;
  private operation: string;
  private category: LogCategory;
  private context?: any;
  
  constructor(operation: string, category: LogCategory, context?: any) {
    this.startTime = Date.now();
    this.operation = operation;
    this.category = category;
    this.context = context;
    
    log(LogLevel.DEBUG, category, `${operation} started`, context);
  }
  
  complete(result?: any): number {
    const duration = Date.now() - this.startTime;
    log(LogLevel.DEBUG, this.category, `${this.operation} completed`, {
      ...this.context,
      ...result,
    }, { duration });
    return duration;
  }
  
  fail(error: Error): number {
    const duration = Date.now() - this.startTime;
    log(LogLevel.ERROR, this.category, `${this.operation} failed`, this.context, { 
      duration, 
      error 
    });
    return duration;
  }
}

/**
 * Create a performance timer for an operation
 */
export function createTimer(operation: string, category: LogCategory, context?: any): PerformanceTimer {
  return new PerformanceTimer(operation, category, context);
}