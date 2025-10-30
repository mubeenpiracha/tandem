/**
 * SlackMessage model operations and business logic
 * 
 * This module provides typed database operations for SlackMessage entities
 * including message tracking and duplicate detection.
 */

import prisma from './index';
import type { SlackMessage, MessageStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface CreateSlackMessageData {
  workspaceId: string;
  slackMessageId: string;
  slackChannelId: string;
  slackThreadId?: string;
  messageTimestamp: Date;
}

export interface UpdateSlackMessageData {
  status?: MessageStatus;
  processedAt?: Date;
}

/**
 * Create a new Slack message record within a workspace
 */
export async function createSlackMessage(data: CreateSlackMessageData): Promise<SlackMessage> {
  try {
    const message = await prisma.slackMessage.create({
      data: {
        workspaceId: data.workspaceId,
        slackMessageId: data.slackMessageId,
        slackChannelId: data.slackChannelId,
        slackThreadId: data.slackThreadId,
        messageTimestamp: data.messageTimestamp,
        status: 'DETECTED',
      },
    });
    return message;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new Error('Slack message already exists in this workspace');
      }
    }
    throw error;
  }
}

/**
 * Find Slack message by Slack message ID within a workspace
 */
export async function findSlackMessageBySlackId(slackMessageId: string, workspaceId: string): Promise<SlackMessage | null> {
  return await prisma.slackMessage.findFirst({
    where: { 
      slackMessageId,
      workspaceId
    },
  });
}

/**
 * Find Slack message by internal ID with workspace validation
 */
export async function findSlackMessageById(id: string, workspaceId?: string): Promise<SlackMessage | null> {
  if (workspaceId) {
    return await prisma.slackMessage.findFirst({
      where: { 
        id,
        workspaceId
      },
    });
  }
  
  return await prisma.slackMessage.findUnique({
    where: { id },
  });
}

/**
 * Update Slack message status (workspace-scoped)
 */
export async function updateSlackMessage(id: string, data: UpdateSlackMessageData, workspaceId?: string): Promise<SlackMessage> {
  try {
    // Validate workspace if provided
    if (workspaceId) {
      const existingMessage = await findSlackMessageById(id, workspaceId);
      if (!existingMessage) {
        throw new Error('Slack message not found in workspace');
      }
    }

    return await prisma.slackMessage.update({
      where: { id },
      data,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new Error('Slack message not found');
      }
    }
    throw error;
  }
}

/**
 * Check if message has already been processed
 */
export async function isMessageProcessed(slackMessageId: string, workspaceId: string): Promise<boolean> {
  const message = await findSlackMessageBySlackId(slackMessageId, workspaceId);
  return message !== null && message.status !== 'DETECTED';
}

/**
 * Get messages by status (workspace-scoped)
 */
export async function getMessagesByStatus(status: MessageStatus, workspaceId?: string): Promise<SlackMessage[]> {
  const where: any = { status };
  if (workspaceId) {
    where.workspaceId = workspaceId;
  }

  return await prisma.slackMessage.findMany({
    where,
    orderBy: { messageTimestamp: 'asc' },
  });
}

/**
 * Get messages in a specific channel (workspace-scoped)
 */
export async function getMessagesInChannel(
  slackChannelId: string,
  workspaceId: string,
  limit: number = 50
): Promise<SlackMessage[]> {
  return await prisma.slackMessage.findMany({
    where: { 
      slackChannelId,
      workspaceId 
    },
    orderBy: { messageTimestamp: 'desc' },
    take: limit,
  });
}

/**
 * Get recent unprocessed messages (workspace-scoped)
 */
export async function getUnprocessedMessages(
  workspaceId?: string,
  maxAge: number = 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  limit: number = 10
): Promise<SlackMessage[]> {
  const cutoffTime = new Date(Date.now() - maxAge);
  
  const where: any = {
    status: 'DETECTED',
    messageTimestamp: {
      gte: cutoffTime,
    },
  };
  
  if (workspaceId) {
    where.workspaceId = workspaceId;
  }
  
  return await prisma.slackMessage.findMany({
    where,
    orderBy: { messageTimestamp: 'asc' },
    take: limit,
  });
}

/**
 * Mark message as processed (workspace-scoped)
 */
export async function markMessageAsProcessed(id: string, workspaceId?: string): Promise<SlackMessage> {
  return await updateSlackMessage(id, {
    status: 'PROCESSED',
    processedAt: new Date(),
  }, workspaceId);
}

/**
 * Mark message as ignored (workspace-scoped)
 */
export async function markMessageAsIgnored(id: string, workspaceId?: string): Promise<SlackMessage> {
  return await updateSlackMessage(id, {
    status: 'IGNORED',
    processedAt: new Date(),
  }, workspaceId);
}

/**
 * Mark message as error (workspace-scoped)
 */
export async function markMessageAsError(id: string, workspaceId?: string): Promise<SlackMessage> {
  return await updateSlackMessage(id, {
    status: 'ERROR',
    processedAt: new Date(),
  }, workspaceId);
}

/**
 * Get processing statistics (workspace-scoped)
 */
export async function getMessageProcessingStats(workspaceId?: string): Promise<{
  total: number;
  detected: number;
  processed: number;
  ignored: number;
  error: number;
}> {
  const where = workspaceId ? { workspaceId } : {};

  const [total, detected, processed, ignored, error] = await Promise.all([
    prisma.slackMessage.count({ where }),
    prisma.slackMessage.count({ where: { ...where, status: 'DETECTED' } }),
    prisma.slackMessage.count({ where: { ...where, status: 'PROCESSED' } }),
    prisma.slackMessage.count({ where: { ...where, status: 'IGNORED' } }),
    prisma.slackMessage.count({ where: { ...where, status: 'ERROR' } }),
  ]);

  return { total, detected, processed, ignored, error };
}

/**
 * Clean up old processed messages (workspace-scoped)
 */
export async function cleanupOldMessages(
  workspaceId?: string,
  olderThanDays: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const where: any = {
    status: { in: ['PROCESSED', 'IGNORED'] },
    processedAt: {
      lt: cutoffDate,
    },
  };

  if (workspaceId) {
    where.workspaceId = workspaceId;
  }

  const result = await prisma.slackMessage.deleteMany({
    where,
  });

  return result.count;
}