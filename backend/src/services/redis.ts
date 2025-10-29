/**
 * Redis client and job queue setup
 * 
 * This module provides Redis connection and job queue management
 * for background task processing.
 */

import Redis from 'ioredis';
import { config } from '../config';

// Redis client instance
let redis: Redis;

// Connection options
const redisOptions = {
  retryDelayOnFailover: config.redis.retryDelayOnFailover,
  maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
};

/**
 * Initialize Redis connection
 */
export async function connectRedis(): Promise<Redis> {
  try {
    redis = new Redis(config.redis.url, redisOptions);

    // Event handlers
    redis.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });

    redis.on('ready', () => {
      console.log('✅ Redis ready for commands');
    });

    redis.on('error', (error) => {
      console.error('❌ Redis connection error:', error);
    });

    redis.on('close', () => {
      console.log('⚠️  Redis connection closed');
    });

    redis.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

    // Test connection
    await redis.connect();
    await redis.ping();

    return redis;
  } catch (error) {
    console.error('❌ Failed to connect to Redis:', error);
    throw error;
  }
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): Redis {
  if (!redis) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redis;
}

/**
 * Disconnect from Redis
 */
export async function disconnectRedis(): Promise<void> {
  if (redis) {
    try {
      await redis.quit();
      console.log('✅ Redis disconnected successfully');
    } catch (error) {
      console.error('❌ Redis disconnection error:', error);
      // Force close if graceful quit fails
      redis.disconnect();
    }
  }
}

/**
 * Check Redis health
 */
export async function checkRedisHealth(): Promise<boolean> {
  try {
    if (!redis) return false;
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    console.error('Redis health check failed:', error);
    return false;
  }
}

// Job queue utilities
export class JobQueue {
  private queueName: string;
  private redis: Redis;

  constructor(queueName: string) {
    this.queueName = queueName;
    this.redis = getRedisClient();
  }

  /**
   * Add a job to the queue
   */
  async addJob(jobType: string, data: any, options?: {
    delay?: number;
    priority?: number;
    attempts?: number;
  }): Promise<string> {
    const jobId = `${this.queueName}:${jobType}:${Date.now()}:${Math.random().toString(36).substr(2, 9)}`;
    
    const job = {
      id: jobId,
      type: jobType,
      data,
      attempts: options?.attempts || config.jobs.defaultJobOptions.attempts,
      maxAttempts: options?.attempts || config.jobs.defaultJobOptions.attempts,
      priority: options?.priority || 0,
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    const queueKey = `queue:${this.queueName}`;
    const delayMs = options?.delay || 0;

    if (delayMs > 0) {
      // Schedule for later execution
      const executeAt = Date.now() + delayMs;
      await this.redis.zadd(`${queueKey}:delayed`, executeAt, JSON.stringify(job));
    } else {
      // Add to immediate processing queue
      await this.redis.lpush(queueKey, JSON.stringify(job));
    }

    console.log(`📝 Job ${jobId} added to queue ${this.queueName}`);
    return jobId;
  }

  /**
   * Get next job from queue
   */
  async getNextJob(timeout: number = 10): Promise<any | null> {
    try {
      // First, check for delayed jobs that are ready
      await this.moveDelayedJobs();

      // Get next job from main queue
      const queueKey = `queue:${this.queueName}`;
      const result = await this.redis.brpop(queueKey, timeout);
      
      if (!result) return null;

      const job = JSON.parse(result[1]);
      console.log(`🎯 Processing job ${job.id} from queue ${this.queueName}`);
      
      return job;
    } catch (error) {
      console.error('Error getting next job:', error);
      return null;
    }
  }

  /**
   * Move delayed jobs that are ready to main queue
   */
  private async moveDelayedJobs(): Promise<void> {
    const delayedQueueKey = `queue:${this.queueName}:delayed`;
    const mainQueueKey = `queue:${this.queueName}`;
    const now = Date.now();

    try {
      // Get jobs that are ready (score <= now)
      const readyJobs = await this.redis.zrangebyscore(delayedQueueKey, 0, now);
      
      if (readyJobs.length > 0) {
        // Move jobs to main queue
        const pipeline = this.redis.pipeline();
        
        for (const jobData of readyJobs) {
          pipeline.lpush(mainQueueKey, jobData);
          pipeline.zrem(delayedQueueKey, jobData);
        }
        
        await pipeline.exec();
        console.log(`🕐 Moved ${readyJobs.length} delayed jobs to active queue`);
      }
    } catch (error) {
      console.error('Error moving delayed jobs:', error);
    }
  }

  /**
   * Mark job as completed
   */
  async completeJob(jobId: string, result?: any): Promise<void> {
    const completedJob = {
      id: jobId,
      status: 'completed',
      completedAt: new Date().toISOString(),
      result,
    };

    const completedKey = `queue:${this.queueName}:completed`;
    await this.redis.lpush(completedKey, JSON.stringify(completedJob));
    
    // Keep only recent completed jobs
    await this.redis.ltrim(completedKey, 0, config.jobs.removeOnComplete - 1);
    
    console.log(`✅ Job ${jobId} completed`);
  }

  /**
   * Mark job as failed
   */
  async failJob(jobId: string, error: string): Promise<void> {
    const failedJob = {
      id: jobId,
      status: 'failed',
      failedAt: new Date().toISOString(),
      error,
    };

    const failedKey = `queue:${this.queueName}:failed`;
    await this.redis.lpush(failedKey, JSON.stringify(failedJob));
    
    // Keep only recent failed jobs
    await this.redis.ltrim(failedKey, 0, config.jobs.removeOnFail - 1);
    
    console.log(`❌ Job ${jobId} failed: ${error}`);
  }

  /**
   * Get queue statistics
   */
  async getStats(): Promise<any> {
    const queueKey = `queue:${this.queueName}`;
    const delayedKey = `${queueKey}:delayed`;
    const completedKey = `${queueKey}:completed`;
    const failedKey = `${queueKey}:failed`;

    const [pending, delayed, completed, failed] = await Promise.all([
      this.redis.llen(queueKey),
      this.redis.zcard(delayedKey),
      this.redis.llen(completedKey),
      this.redis.llen(failedKey),
    ]);

    return {
      pending,
      delayed,
      completed,
      failed,
      total: pending + delayed + completed + failed,
    };
  }
}

// Pre-defined job queues (lazy initialization)
let taskDetectionQueue: JobQueue;
let calendarSchedulingQueue: JobQueue;
let notificationQueue: JobQueue;
let tokenRefreshQueue: JobQueue;

export function getTaskDetectionQueue(): JobQueue {
  if (!taskDetectionQueue) {
    taskDetectionQueue = new JobQueue('task-detection');
  }
  return taskDetectionQueue;
}

export function getCalendarSchedulingQueue(): JobQueue {
  if (!calendarSchedulingQueue) {
    calendarSchedulingQueue = new JobQueue('calendar-scheduling');
  }
  return calendarSchedulingQueue;
}

export function getNotificationQueue(): JobQueue {
  if (!notificationQueue) {
    notificationQueue = new JobQueue('notifications');
  }
  return notificationQueue;
}

export function getTokenRefreshQueue(): JobQueue {
  if (!tokenRefreshQueue) {
    tokenRefreshQueue = new JobQueue('token-refresh');
  }
  return tokenRefreshQueue;
}