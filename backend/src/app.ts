/**
 * Main Express.js application setup
 * 
 * This file sets up the Express server with all middleware,
 * routes, and error handling for the Tandem Slack Bot.
 */

/// <reference path="./types/express.d.ts" />
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config, validateConfig } from './config';
import { connectDatabase } from './models';
import { connectRedis } from './services/redis';
import { startTaskDetectionWorker } from './jobs/taskDetection';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { setupRoutes } from './routes/index';

// Validate configuration on startup
validateConfig();

// Create Express application
const app = express();

// Trust proxy for rate limiting and IP detection
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS configuration
app.use(cors(config.cors));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: config.rateLimit.standardHeaders,
  legacyHeaders: config.rateLimit.legacyHeaders,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    },
  },
  skip: (req) => {
    // Skip rate limiting for health checks
    return req.path === '/health' || req.path === '/api/health';
  },
});

app.use('/api/', limiter);

// Request logging
if (config.logging.level === 'debug' || config.isDevelopment) {
  app.use(morgan('combined'));
} else {
  app.use(morgan('short'));
}

// Custom request logging middleware
app.use(requestLogger);

// Body parsing middleware
app.use(express.json({ 
  limit: '10mb',
  type: ['application/json', 'text/plain'],
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb',
  type: 'application/x-www-form-urlencoded',
}));

// Workspace context middleware (before routes)
app.use('/api/v1/workspace/:workspaceId', (req, res, next) => {
  // Extract workspace ID from URL parameters
  req.workspaceId = req.params.workspaceId;
  next();
});

// Slack webhook workspace context extraction
app.use('/webhooks/slack', (req, res, next) => {
  // For Slack webhooks, we'll extract workspace context from the payload
  // This will be implemented in the webhook handlers
  next();
});

// Health check endpoint (before authentication)
app.get('/health', async (req, res) => {
  try {
    // Basic health check response
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: config.isDevelopment ? 'development' : 'production',
      services: {
        database: 'healthy', // Will be updated with actual check
        redis: 'healthy',    // Will be updated with actual check
        slack: 'healthy',    // Will be updated with actual check
        google: 'healthy',   // Will be updated with actual check
      },
    };

    res.status(200).json(healthStatus);
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Service health check failed',
    });
  }
});

// API routes
setupRoutes(app);

// Static files (if any)
app.use(express.static('public'));

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Graceful shutdown handling
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 ${signal} received. Starting graceful shutdown...`);
  
  // Stop token refresh scheduler
  try {
    const { stopTokenRefreshScheduler } = await import('./jobs/tokenRefresh');
    stopTokenRefreshScheduler();
  } catch (error) {
    console.error('Failed to stop token refresh scheduler:', error);
  }
  
  // Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed.');
    
    // Close database connections
    import('./models').then(({ disconnectDatabase }) => {
      disconnectDatabase().then(() => {
        console.log('✅ Database connections closed.');
        process.exit(0);
      });
    });
  });
  
  // Force shutdown after 30 seconds
  setTimeout(() => {
    console.error('❌ Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 30000);
}

// Start server
const server = app.listen(config.server.port, config.server.host, async () => {
  console.log(`🚀 Tandem Slack Bot API server running on ${config.server.host}:${config.server.port}`);
  console.log(`📱 Environment: ${config.isDevelopment ? 'development' : 'production'}`);
  console.log(`🌐 API Base URL: ${config.server.baseUrl}`);
  
  // Connect to database
  try {
    await connectDatabase();
    console.log('🗄️  Database connection established');
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    process.exit(1);
  }
  
  // Connect to Redis and start workers
  try {
    await connectRedis();
    console.log('🔴 Redis connection established');
    
    // Start background job workers
    await startTaskDetectionWorker();
    console.log('👷 Background workers started');
    
    // Start token refresh scheduler
    const { startTokenRefreshScheduler } = await import('./jobs/tokenRefresh');
    startTokenRefreshScheduler();
    
  } catch (error) {
    console.error('❌ Failed to connect to Redis or start workers:', error);
    // Don't exit - workers are not critical for basic API functionality
  }
  
  if (config.isDevelopment) {
    console.log('\n📋 Available endpoints:');
    console.log(`  Health: ${config.server.baseUrl}/health`);
    console.log(`  API: ${config.server.baseUrl}/api`);
    console.log(`  Webhooks: ${config.webhooks.baseUrl}/webhooks`);
  }
});

export default app;
export { server };