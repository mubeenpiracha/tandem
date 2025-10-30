/**
 * Environment configuration management
 * 
 * This module provides type-safe access to environment variables
 * and application configuration settings.
 */

import dotenv from 'dotenv';
import { z } from 'zod';

// Load environment variables from appropriate .env file
if (process.env.NODE_ENV === 'test') {
  dotenv.config({ path: '.env.test' });
} else {
  dotenv.config();
}

// Define environment variable schema for validation
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  
  // Server configuration
  PORT: z.string().default('3000').transform(Number),
  API_BASE_URL: z.string().url().optional(),
  
  // Database configuration
  DATABASE_URL: z.string().min(1, 'Database URL is required'),
  
  // Redis configuration
  REDIS_URL: z.string().default('redis://localhost:6381'),
  
  // Authentication & Security
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  TOKEN_ENCRYPTION_KEY: z.string().min(32, 'Token encryption key must be at least 32 characters'),
  CORS_ORIGIN: z.string().default('http://localhost:3001'),
  
  // Slack API configuration
  SLACK_CLIENT_ID: z.string().min(1, 'Slack client ID is required'),
  SLACK_CLIENT_SECRET: z.string().min(1, 'Slack client secret is required'),
  SLACK_SIGNING_SECRET: z.string().min(1, 'Slack signing secret is required'),
  SLACK_REDIRECT_URI: z.string().url().optional(),
  
  // Google API configuration
  GOOGLE_CLIENT_ID: z.string().min(1, 'Google client ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'Google client secret is required'),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  
  // OpenAI configuration
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  OPENAI_MODEL: z.string().default('gpt-4'),
  OPENAI_MAX_TOKENS: z.string().default('1000').transform(Number),
  
  // Webhook configuration
  NGROK_DOMAIN: z.string().optional(),
  WEBHOOK_BASE_URL: z.string().url().optional(),
  
  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  // Feature flags
  ENABLE_TASK_DETECTION: z.string().default('true').transform((val: string) => val === 'true'),
  ENABLE_CALENDAR_INTEGRATION: z.string().default('true').transform((val: string) => val === 'true'),
  
  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('900000').transform(Number), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
});

// Parse and validate environment variables
const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  console.error('❌ Invalid environment configuration:');
  parseResult.error.issues.forEach((issue: any) => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parseResult.data;

// Configuration object with computed values
export const config = {
  // Environment
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  
  // Server
  server: {
    port: env.PORT,
    host: '0.0.0.0',
    baseUrl: env.API_BASE_URL || `http://localhost:${env.PORT}`,
  },
  
  // Database
  database: {
    url: env.DATABASE_URL,
    pool: {
      min: 2,
      max: 10,
    },
  },
  
  // Redis
  redis: {
    url: env.REDIS_URL,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
  },
  
  // Authentication
  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: '7d',
    tokenEncryptionKey: env.TOKEN_ENCRYPTION_KEY,
  },
  
  // CORS
  cors: {
    origin: env.CORS_ORIGIN.split(',').map((origin: string) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  },
  
  // Slack integration
  slack: {
    clientId: env.SLACK_CLIENT_ID,
    clientSecret: env.SLACK_CLIENT_SECRET,
    signingSecret: env.SLACK_SIGNING_SECRET,
    redirectUri: env.SLACK_REDIRECT_URI || `${env.API_BASE_URL || `http://localhost:${env.PORT}`}/auth/slack/callback`,
    
    // User OAuth scopes (for individual users within workspaces)
    userScopes: [
      'users:read',
      'channels:read',
      'groups:read',
      'im:read',
      'channels:history',
      'groups:history',
      'im:history',
    ],
    
    // Bot scopes (for workspace-level app installation)
    botScopes: [
      'chat:write',
      'channels:read',
      'groups:read',
      'im:read',
      'im:write',
      'users:read',
      'channels:history',
      'groups:history',
      'im:history',
      'app_mentions:read',
      'commands',
    ],
    
    // Workspace installation configuration
    workspace: {
      installPath: '/auth/slack/install',
      callbackPath: '/auth/slack/workspace/callback',
      directInstallUrl: `https://slack.com/oauth/v2/authorize?client_id=${env.SLACK_CLIENT_ID}&scope=${[
        'chat:write',
        'channels:read',
        'groups:read',
        'im:read',
        'im:write',
        'users:read',
        'channels:history',
        'groups:history',
        'im:history',
        'app_mentions:read',
        'commands',
      ].join(',')}&user_scope=${[
        'users:read',
        'channels:read',
        'groups:read',
        'im:read',
        'channels:history',
        'groups:history',
        'im:history',
      ].join(',')}`,
    },
  },
  
  // Google integration
  google: {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI || `${env.API_BASE_URL || `http://localhost:${env.PORT}`}/auth/google/callback`,
    scopes: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
  },
  
  // OpenAI
  openai: {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    maxTokens: env.OPENAI_MAX_TOKENS,
    temperature: 0.3,
  },
  
  // Webhooks
  webhooks: {
    baseUrl: env.WEBHOOK_BASE_URL || env.NGROK_DOMAIN ? `https://${env.NGROK_DOMAIN}` : `http://localhost:${env.PORT}`,
    slackPath: '/webhooks/slack/events',
    slackInteractionsPath: '/webhooks/slack/interactions',
  },
  
  // Logging
  logging: {
    level: env.LOG_LEVEL,
    format: env.NODE_ENV === 'production' ? 'json' : 'simple',
  },
  
  // Feature flags
  features: {
    taskDetection: env.ENABLE_TASK_DETECTION,
    calendarIntegration: env.ENABLE_CALENDAR_INTEGRATION,
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
  },
  
  // Job queue configuration
  jobs: {
    concurrency: 5,
    removeOnComplete: 50,
    removeOnFail: 20,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  },
  
  // Task detection configuration
  taskDetection: {
    batchSize: 10,
    maxMessageAge: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
    confidenceThreshold: 0.7,
  },
  
  // Calendar scheduling configuration
  calendar: {
    workingHoursDefault: {
      start: '09:00',
      end: '17:00',
    },
    minimumTaskDuration: 15, // minutes
    maximumTaskDuration: 480, // 8 hours in minutes
    bufferBetweenTasks: 15, // minutes
  },
  
  // Multi-workspace configuration
  workspace: {
    maxWorkspacesPerInstance: env.NODE_ENV === 'production' ? 1000 : 10,
    botTokenEncryption: {
      algorithm: 'aes-256-gcm',
      keyDerivation: 'pbkdf2',
      iterations: 100000,
    },
    defaultSettings: {
      taskDetectionEnabled: true,
      calendarIntegrationEnabled: true,
      maxTasksPerUser: 100,
      retentionDays: 365,
    },
    routes: {
      installPath: '/install',
      managementPath: '/workspace',
      apiPrefix: '/api/v1/workspace',
    },
  },
};

// Export types for use in other modules
export type Config = typeof config;
export type Environment = typeof env;

// Helper function to validate required configuration at startup
export function validateConfig(): void {
  const requiredConfigs = [
    'database.url',
    'slack.clientId',
    'slack.clientSecret',
    'google.clientId',
    'google.clientSecret',
    'openai.apiKey',
    'auth.jwtSecret',
  ];

  const missing = requiredConfigs.filter(path => {
    const value = path.split('.').reduce((obj, key) => obj?.[key], config as any);
    return !value;
  });

  if (missing.length > 0) {
    console.error('❌ Missing required configuration:', missing);
    process.exit(1);
  }

  console.log('✅ Configuration validation passed');
}