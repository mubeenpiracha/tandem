import express from 'express';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { Logger, LogCategory } from '../utils/logger';

const router = express.Router();
const prisma = new PrismaClient();

// Initialize Prometheus metrics
collectDefaultMetrics();

// Custom metrics
const httpRequestDuration = new Histogram({
  name: 'tandem_http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code', 'workspace_id'],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
});

const taskDetectionCounter = new Counter({
  name: 'tandem_task_detections_total',
  help: 'Total number of task detections',
  labelNames: ['workspace_id', 'status', 'source'],
});

const calendarEventCounter = new Counter({
  name: 'tandem_calendar_events_total',
  help: 'Total number of calendar events created',
  labelNames: ['workspace_id', 'status'],
});

const slackMessageCounter = new Counter({
  name: 'tandem_slack_messages_total',
  help: 'Total number of Slack messages processed',
  labelNames: ['workspace_id', 'event_type'],
});

const activeWorkspaces = new Gauge({
  name: 'tandem_active_workspaces',
  help: 'Number of active workspaces',
});

const activeUsers = new Gauge({
  name: 'tandem_active_users',
  help: 'Number of active users per workspace',
  labelNames: ['workspace_id'],
});

const tasksInStatus = new Gauge({
  name: 'tandem_tasks_by_status',
  help: 'Number of tasks by status and workspace',
  labelNames: ['workspace_id', 'status'],
});

const queueLength = new Gauge({
  name: 'tandem_queue_length',
  help: 'Length of job queues',
  labelNames: ['queue_name'],
});

const databaseConnections = new Gauge({
  name: 'tandem_database_connections',
  help: 'Number of active database connections',
});

const errorCounter = new Counter({
  name: 'tandem_errors_total',
  help: 'Total number of errors',
  labelNames: ['error_type', 'workspace_id', 'component'],
});

// Redis client for health checks
const redisClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

/**
 * Health check endpoint
 * Returns comprehensive health status of all system components
 */
router.get('/health', async (req, res) => {
  const startTime = Date.now();
  const healthStatus = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    services: {},
    workspace_metrics: {},
  };

  try {
    // Check database connection
    healthStatus.services.database = await checkDatabase();
    
    // Check Redis connection
    healthStatus.services.redis = await checkRedis();
    
    // Check external APIs
    healthStatus.services.slack_api = await checkSlackAPI();
    healthStatus.services.google_api = await checkGoogleAPI();
    healthStatus.services.openai_api = await checkOpenAIAPI();
    
    // Get workspace-specific metrics
    healthStatus.workspace_metrics = await getWorkspaceMetrics();
    
    // Overall health determination
    const serviceStatuses = Object.values(healthStatus.services);
    const isHealthy = serviceStatuses.every(status => 
      status === 'healthy' || status === 'degraded'
    );
    
    healthStatus.status = isHealthy ? 'healthy' : 'unhealthy';
    
    // Record response time
    const responseTime = (Date.now() - startTime) / 1000;
    httpRequestDuration
      .labels('GET', '/health', res.statusCode.toString(), 'system')
      .observe(responseTime);
    
    res.status(isHealthy ? 200 : 503).json(healthStatus);
    
  } catch (error) {
    logger.error('Health check failed:', error);
    
    healthStatus.status = 'unhealthy';
    healthStatus.error = error.message;
    
    errorCounter
      .labels('health_check_error', 'system', 'monitoring')
      .inc();
    
    res.status(503).json(healthStatus);
  }
});

/**
 * Detailed health check for specific workspace
 */
router.get('/health/:workspaceId', async (req, res) => {
  const { workspaceId } = req.params;
  
  try {
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        users: {
          include: {
            tasks: {
              where: {
                createdAt: {
                  gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                },
              },
            },
            calendarEvents: {
              where: {
                createdAt: {
                  gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
                },
              },
            },
          },
        },
        slackMessages: {
          where: {
            timestamp: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
        },
      },
    });
    
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    
    const workspaceHealth = {
      workspace_id: workspaceId,
      workspace_name: workspace.name,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        active_users: workspace.users.length,
        tasks_created_7d: workspace.users.reduce((sum, user) => sum + user.tasks.length, 0),
        calendar_events_7d: workspace.users.reduce((sum, user) => sum + user.calendarEvents.length, 0),
        slack_messages_24h: workspace.slackMessages.length,
        last_activity: workspace.updatedAt,
      },
      integrations: {
        slack: workspace.slackTeamId ? 'connected' : 'disconnected',
        google_calendar: workspace.users.some(user => user.googleTokens.length > 0) ? 'connected' : 'disconnected',
      },
    };
    
    // Check for potential issues
    const warnings = [];
    
    if (workspace.users.length === 0) {
      warnings.push('No active users in workspace');
    }
    
    if (workspaceHealth.metrics.tasks_created_7d === 0) {
      warnings.push('No tasks created in the last 7 days');
    }
    
    if (workspaceHealth.metrics.slack_messages_24h === 0) {
      warnings.push('No Slack activity in the last 24 hours');
    }
    
    if (warnings.length > 0) {
      workspaceHealth.status = 'degraded';
      workspaceHealth.warnings = warnings;
    }
    
    res.json(workspaceHealth);
    
  } catch (error) {
    logger.error(`Workspace health check failed for ${workspaceId}:`, error);
    
    errorCounter
      .labels('workspace_health_error', workspaceId, 'monitoring')
      .inc();
    
    res.status(500).json({
      workspace_id: workspaceId,
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Prometheus metrics endpoint
 */
router.get('/metrics', async (req, res) => {
  try {
    // Update dynamic metrics before serving
    await updateWorkspaceMetrics();
    await updateQueueMetrics();
    await updateDatabaseMetrics();
    
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
    
  } catch (error) {
    logger.error('Metrics collection failed:', error);
    res.status(500).json({ error: 'Failed to collect metrics' });
  }
});

/**
 * System status endpoint for monitoring dashboards
 */
router.get('/status', async (req, res) => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
        node_version: process.version,
        platform: process.platform,
      },
      database: await getDatabaseStatus(),
      redis: await getRedisStatus(),
      queues: await getQueueStatus(),
      workspaces: await getWorkspaceStatus(),
    };
    
    res.json(status);
    
  } catch (error) {
    logger.error('Status check failed:', error);
    res.status(500).json({ error: 'Failed to get system status' });
  }
});

/**
 * Check database health
 */
async function checkDatabase(): Promise<string> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'healthy';
  } catch (error) {
    logger.error('Database health check failed:', error);
    return 'unhealthy';
  }
}

/**
 * Check Redis health
 */
async function checkRedis(): Promise<string> {
  try {
    const result = await redisClient.ping();
    return result === 'PONG' ? 'healthy' : 'unhealthy';
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return 'unhealthy';
  }
}

/**
 * Check Slack API health
 */
async function checkSlackAPI(): Promise<string> {
  try {
    // Simple API test - this would be more comprehensive in production
    return 'healthy'; // Placeholder
  } catch (error) {
    logger.error('Slack API health check failed:', error);
    return 'degraded';
  }
}

/**
 * Check Google API health
 */
async function checkGoogleAPI(): Promise<string> {
  try {
    // Simple API test - this would be more comprehensive in production
    return 'healthy'; // Placeholder
  } catch (error) {
    logger.error('Google API health check failed:', error);
    return 'degraded';
  }
}

/**
 * Check OpenAI API health
 */
async function checkOpenAIAPI(): Promise<string> {
  try {
    // Simple API test - this would be more comprehensive in production
    return 'healthy'; // Placeholder
  } catch (error) {
    logger.error('OpenAI API health check failed:', error);
    return 'degraded';
  }
}

/**
 * Get workspace-specific metrics
 */
async function getWorkspaceMetrics(): Promise<any> {
  try {
    const workspaces = await prisma.workspace.findMany({
      include: {
        users: {
          include: {
            tasks: {
              where: {
                createdAt: {
                  gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
                },
              },
            },
          },
        },
        slackMessages: {
          where: {
            timestamp: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
        },
      },
    });
    
    return workspaces.map(workspace => ({
      workspace_id: workspace.id,
      workspace_name: workspace.name,
      active_users: workspace.users.length,
      tasks_created_24h: workspace.users.reduce((sum, user) => sum + user.tasks.length, 0),
      slack_messages_24h: workspace.slackMessages.length,
      last_activity: workspace.updatedAt,
    }));
    
  } catch (error) {
    logger.error('Failed to get workspace metrics:', error);
    return [];
  }
}

/**
 * Update workspace metrics for Prometheus
 */
async function updateWorkspaceMetrics(): Promise<void> {
  try {
    // Active workspaces
    const workspaceCount = await prisma.workspace.count({
      where: {
        updatedAt: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Active in last 30 days
        },
      },
    });
    activeWorkspaces.set(workspaceCount);
    
    // Per-workspace metrics
    const workspaces = await prisma.workspace.findMany({
      include: {
        users: true,
        tasks: true,
      },
    });
    
    for (const workspace of workspaces) {
      // Active users per workspace
      activeUsers.labels(workspace.id).set(workspace.users.length);
      
      // Tasks by status
      const tasksByStatus = await prisma.task.groupBy({
        by: ['status'],
        where: { workspaceId: workspace.id },
        _count: { status: true },
      });
      
      for (const group of tasksByStatus) {
        tasksInStatus.labels(workspace.id, group.status).set(group._count.status);
      }
    }
    
  } catch (error) {
    logger.error('Failed to update workspace metrics:', error);
  }
}

/**
 * Update queue metrics for Prometheus
 */
async function updateQueueMetrics(): Promise<void> {
  try {
    // This would integrate with your job queue system (Bull, Agenda, etc.)
    // Placeholder implementation
    queueLength.labels('task_detection').set(0);
    queueLength.labels('calendar_sync').set(0);
    queueLength.labels('token_refresh').set(0);
    
  } catch (error) {
    logger.error('Failed to update queue metrics:', error);
  }
}

/**
 * Update database metrics for Prometheus
 */
async function updateDatabaseMetrics(): Promise<void> {
  try {
    // Get database connection count
    const connections = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT count(*) as count 
      FROM pg_stat_activity 
      WHERE datname = current_database()
    `;
    
    databaseConnections.set(Number(connections[0].count));
    
  } catch (error) {
    logger.error('Failed to update database metrics:', error);
  }
}

/**
 * Get detailed database status
 */
async function getDatabaseStatus(): Promise<any> {
  try {
    const [
      connectionInfo,
      databaseSize,
      tableStats,
    ] = await Promise.all([
      prisma.$queryRaw<[{ count: bigint; max_conn: number }]>`
        SELECT 
          count(*) as count,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_conn
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `,
      prisma.$queryRaw<[{ size: string }]>`
        SELECT pg_size_pretty(pg_database_size(current_database())) as size
      `,
      prisma.$queryRaw<any[]>`
        SELECT 
          schemaname,
          tablename,
          n_tup_ins as inserts,
          n_tup_upd as updates,
          n_tup_del as deletes
        FROM pg_stat_user_tables
        ORDER BY (n_tup_ins + n_tup_upd + n_tup_del) DESC
        LIMIT 10
      `,
    ]);
    
    return {
      status: 'healthy',
      connections: {
        active: Number(connectionInfo[0].count),
        max: connectionInfo[0].max_conn,
      },
      size: databaseSize[0].size,
      top_tables: tableStats,
    };
    
  } catch (error) {
    logger.error('Failed to get database status:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Get Redis status
 */
async function getRedisStatus(): Promise<any> {
  try {
    const info = await redisClient.info();
    const memory = await redisClient.info('memory');
    
    return {
      status: 'healthy',
      info: info,
      memory_usage: memory,
    };
    
  } catch (error) {
    logger.error('Failed to get Redis status:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Get queue status
 */
async function getQueueStatus(): Promise<any> {
  try {
    // This would integrate with your job queue system
    // Placeholder implementation
    return {
      task_detection: { waiting: 0, active: 0, completed: 0, failed: 0 },
      calendar_sync: { waiting: 0, active: 0, completed: 0, failed: 0 },
      token_refresh: { waiting: 0, active: 0, completed: 0, failed: 0 },
    };
    
  } catch (error) {
    logger.error('Failed to get queue status:', error);
    return { status: 'error', error: error.message };
  }
}

/**
 * Get workspace status summary
 */
async function getWorkspaceStatus(): Promise<any> {
  try {
    const [
      totalWorkspaces,
      activeWorkspaces24h,
      totalUsers,
      tasksCreated24h,
    ] = await Promise.all([
      prisma.workspace.count(),
      prisma.workspace.count({
        where: {
          updatedAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
      prisma.user.count(),
      prisma.task.count({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
          },
        },
      }),
    ]);
    
    return {
      total_workspaces: totalWorkspaces,
      active_workspaces_24h: activeWorkspaces24h,
      total_users: totalUsers,
      tasks_created_24h: tasksCreated24h,
    };
    
  } catch (error) {
    logger.error('Failed to get workspace status:', error);
    return { status: 'error', error: error.message };
  }
}

// Middleware to record HTTP request metrics
export const metricsMiddleware = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const workspaceId = req.headers['x-workspace-id'] as string || 'unknown';
    
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString(), workspaceId)
      .observe(duration);
  });
  
  next();
};

// Export metric functions for use in other parts of the application
export const metrics = {
  taskDetectionCounter,
  calendarEventCounter,
  slackMessageCounter,
  errorCounter,
  
  // Helper functions
  recordTaskDetection: (workspaceId: string, status: string, source: string) => {
    taskDetectionCounter.labels(workspaceId, status, source).inc();
  },
  
  recordCalendarEvent: (workspaceId: string, status: string) => {
    calendarEventCounter.labels(workspaceId, status).inc();
  },
  
  recordSlackMessage: (workspaceId: string, eventType: string) => {
    slackMessageCounter.labels(workspaceId, eventType).inc();
  },
  
  recordError: (errorType: string, workspaceId: string, component: string) => {
    errorCounter.labels(errorType, workspaceId, component).inc();
  },
};

export default router;