/**
 * Token refresh job scheduler
 * 
 * This module handles scheduled token refresh and cleanup operations.
 */

import { scheduleTokenRefresh } from '../services/oauth/token_manager';
import { Logger } from '../utils/logger';

let refreshInterval: NodeJS.Timeout | null = null;

/**
 * Start the token refresh scheduler
 */
export function startTokenRefreshScheduler(): void {
  if (refreshInterval) {
    console.log('Token refresh scheduler already running');
    return;
  }

  // Run every 30 minutes
  const intervalMs = 30 * 60 * 1000;

  refreshInterval = setInterval(async () => {
    try {
      await scheduleTokenRefresh();
    } catch (error) {
      console.error('Scheduled token refresh failed:', error);
    }
  }, intervalMs);

  Logger.system.workerStarted('token-refresh-scheduler');
  console.log('✅ Token refresh scheduler started (every 30 minutes)');
}

/**
 * Stop the token refresh scheduler
 */
export function stopTokenRefreshScheduler(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    Logger.system.workerStopped('token-refresh-scheduler');
    console.log('✅ Token refresh scheduler stopped');
  }
}

/**
 * Run token refresh immediately (for testing)
 */
export async function runTokenRefreshNow(): Promise<void> {
  try {
    console.log('Running token refresh manually...');
    await scheduleTokenRefresh();
    console.log('✅ Manual token refresh completed');
  } catch (error) {
    console.error('Manual token refresh failed:', error);
    throw error;
  }
}