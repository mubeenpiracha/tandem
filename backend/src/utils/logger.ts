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
  CALENDAR = 'calendar',
  SYSTEM = 'system',
  SECURITY = 'security',
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
  workspaceId?: string;
  workspaceName?: string;
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
  if (entry.workspaceId) parts.push(`workspace:${entry.workspaceId}`);
  if (entry.workspaceName) parts.push(`(${entry.workspaceName})`);
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
    workspaceId?: string;
    workspaceName?: string;
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
    started: (messageId: string, userId: string, messageText: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.TASK_DETECTION, 'Task detection started', {
        messageLength: messageText.length,
        messagePreview: messageText.substring(0, 100),
      }, { 
        messageId, 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    completed: (messageId: string, userId: string, result: {
      tasksDetected: number;
      tasksCreated: number;
      processingTime: number;
      confidence?: number;
    }, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.TASK_DETECTION, 'Task detection completed', result, { 
        messageId, 
        userId, 
        duration: result.processingTime,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    failed: (messageId: string, userId: string, error: Error, duration: number, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.ERROR, LogCategory.TASK_DETECTION, 'Task detection failed', {}, { 
        messageId, 
        userId, 
        duration, 
        error,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    aiResponse: (messageId: string, userId: string, response: any, processingTime: number, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.DEBUG, LogCategory.TASK_DETECTION, 'AI task detection response', {
        isTask: response.isTask,
        confidence: response.confidence,
        taskCount: response.tasks?.length || 0,
        reasoning: response.reasoning,
      }, { 
        messageId, 
        userId, 
        duration: processingTime,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    taskCreated: (taskId: string, userId: string, taskTitle: string, confidence: number, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.TASK_DETECTION, 'Task created from detection', {
        title: taskTitle,
        confidence,
      }, { 
        taskId, 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    confirmationSent: (taskId: string, userId: string, messageId: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.TASK_DETECTION, 'Task confirmation sent', {}, { 
        taskId, 
        userId, 
        messageId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
  },
  
  // Slack API logging
  slack: {
    webhookReceived: (eventType: string, userId: string, channelId: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.SLACK_API, 'Slack webhook received', {
        eventType,
        channelId,
      }, { 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    messageSent: (userId: string, channelId: string, messageType: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.SLACK_API, 'Slack message sent', {
        channelId,
        messageType,
      }, { 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    interactionReceived: (userId: string, actionType: string, workspaceContext?: { id: string; slackTeamName: string }, taskId?: string) => {
      log(LogLevel.INFO, LogCategory.SLACK_API, 'Slack interaction received', {
        actionType,
      }, { 
        userId, 
        taskId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    apiError: (userId: string, operation: string, error: Error, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.ERROR, LogCategory.SLACK_API, `Slack API error: ${operation}`, {
        operation,
      }, { 
        userId, 
        error,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
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
    loginAttempt: (userId: string, method: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'Authentication attempt', {
        method,
      }, { 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    loginSuccess: (userId: string, method: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'Authentication success', {
        method,
      }, { 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    loginFailure: (userId: string, method: string, reason: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.WARN, LogCategory.AUTH, 'Authentication failure', {
        method,
        reason,
      }, { 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    tokenRefresh: (userId: string, service: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'Token refreshed', {
        service,
      }, { 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    oauthInitiated: (provider: string, state: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'OAuth flow initiated', {
        provider,
        state: state.substring(0, 8) + '...', // Log partial state for security
      }, {
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    oauthFailed: (provider: string, error: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.ERROR, LogCategory.AUTH, 'OAuth flow failed', {
        provider,
        error,
      }, {
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    userCreated: (userId: string, provider: string, email: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'New user created', {
        provider,
        email,
      }, { 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    userUpdated: (userId: string, provider: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'User updated', {
        provider,
      }, { 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    tokenStored: (userId: string, provider: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'OAuth token stored', {
        provider,
      }, { 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    tokenRevoked: (userId: string, provider: string, workspaceContext?: { id: string; slackTeamName: string }) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'OAuth token revoked', {
        provider,
      }, { 
        userId,
        workspaceId: workspaceContext?.id,
        workspaceName: workspaceContext?.slackTeamName,
      });
    },
    
    // Workspace-specific auth events
    workspaceInstalled: (workspaceId: string, slackTeamId: string, slackTeamName: string) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'Workspace app installed', {
        slackTeamId,
      }, { 
        workspaceId,
        workspaceName: slackTeamName,
      });
    },
    
    workspaceUninstalled: (workspaceId: string, slackTeamId: string, slackTeamName: string) => {
      log(LogLevel.INFO, LogCategory.AUTH, 'Workspace app uninstalled', {
        slackTeamId,
      }, { 
        workspaceId,
        workspaceName: slackTeamName,
      });
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
  error: (category: LogCategory, message: string, error: Error, context?: any, workspaceContext?: { id: string; slackTeamName: string }) => {
    log(LogLevel.ERROR, category, message, context, { 
      error,
      workspaceId: workspaceContext?.id,
      workspaceName: workspaceContext?.slackTeamName,
    });
  },
  
  warn: (category: LogCategory, message: string, data?: any, context?: any, workspaceContext?: { id: string; slackTeamName: string }) => {
    log(LogLevel.WARN, category, message, data, {
      ...context,
      workspaceId: workspaceContext?.id,
      workspaceName: workspaceContext?.slackTeamName,
    });
  },
  
  info: (category: LogCategory, message: string, data?: any, context?: any, workspaceContext?: { id: string; slackTeamName: string }) => {
    log(LogLevel.INFO, category, message, data, {
      ...context,
      workspaceId: workspaceContext?.id,
      workspaceName: workspaceContext?.slackTeamName,
    });
  },
  
  debug: (category: LogCategory, message: string, data?: any, context?: any, workspaceContext?: { id: string; slackTeamName: string }) => {
    log(LogLevel.DEBUG, category, message, data, {
      ...context,
      workspaceId: workspaceContext?.id,
      workspaceName: workspaceContext?.slackTeamName,
    });
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
  private workspaceContext?: { id: string; slackTeamName: string };
  
  constructor(operation: string, category: LogCategory, context?: any, workspaceContext?: { id: string; slackTeamName: string }) {
    this.startTime = Date.now();
    this.operation = operation;
    this.category = category;
    this.context = context;
    this.workspaceContext = workspaceContext;
    
    log(LogLevel.DEBUG, category, `${operation} started`, context, {
      workspaceId: workspaceContext?.id,
      workspaceName: workspaceContext?.slackTeamName,
    });
  }
  
  complete(result?: any): number {
    const duration = Date.now() - this.startTime;
    log(LogLevel.DEBUG, this.category, `${this.operation} completed`, {
      ...this.context,
      ...result,
    }, { 
      duration,
      workspaceId: this.workspaceContext?.id,
      workspaceName: this.workspaceContext?.slackTeamName,
    });
    return duration;
  }
  
  fail(error: Error): number {
    const duration = Date.now() - this.startTime;
    log(LogLevel.ERROR, this.category, `${this.operation} failed`, this.context, { 
      duration, 
      error,
      workspaceId: this.workspaceContext?.id,
      workspaceName: this.workspaceContext?.slackTeamName,
    });
    return duration;
  }
}

/**
 * Create a performance timer for an operation
 */
export function createTimer(operation: string, category: LogCategory, context?: any, workspaceContext?: { id: string; slackTeamName: string }): PerformanceTimer {
  return new PerformanceTimer(operation, category, context, workspaceContext);
}