/**
 * Database models and Prisma client setup
 * 
 * This file exports the Prisma client instance and provides
 * typed database access for the Tandem Slack Bot application.
 */

import { PrismaClient } from '@prisma/client';

// Create Prisma client instance with error formatting
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  errorFormat: 'pretty',
});

// Export the Prisma client
export default prisma;

// Export Prisma types for use in other modules
export type {
  Workspace,
  User,
  Task,
  CalendarEvent,
  SlackMessage,
  WorkPreferences,
  SlackToken,
  GoogleToken,
  UserStatus,
  TaskStatus,
  TaskImportance,
  TaskUrgency,
  MessageStatus,
  Prisma,
} from '@prisma/client';

// Helper function to handle database connection
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  }
}

// Helper function to handle graceful shutdown
export async function disconnectDatabase(): Promise<void> {
  try {
    await prisma.$disconnect();
    console.log('✅ Database disconnected successfully');
  } catch (error) {
    console.error('❌ Database disconnection failed:', error);
  }
}

// Health check function
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database health check failed:', error);
    return false;
  }
}