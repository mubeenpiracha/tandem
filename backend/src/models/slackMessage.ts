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
 * Find Slack message by internal ID
 */
export async function findSlackMessageById(id: string): Promise<SlackMessage | null> {
  return await prisma.slackMessage.findUnique({
    where: { id },
  });
}

/**
 * Update Slack message status
 */
export async function updateSlackMessage(id: string, data: UpdateSlackMessageData): Promise<SlackMessage> {
  try {
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
 * Get messages by status
 */
export async function getMessagesByStatus(status: MessageStatus): Promise<SlackMessage[]> {
  return await prisma.slackMessage.findMany({
    where: { status },
    orderBy: { messageTimestamp: 'asc' },
  });
}

/**
 * Get messages in a specific channel
 */
export async function getMessagesInChannel(
  slackChannelId: string,
  limit: number = 50
): Promise<SlackMessage[]> {
  return await prisma.slackMessage.findMany({
    where: { slackChannelId },
    orderBy: { messageTimestamp: 'desc' },
    take: limit,
  });
}

/**
 * Get recent unprocessed messages
 */
export async function getUnprocessedMessages(
  maxAge: number = 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  limit: number = 10
): Promise<SlackMessage[]> {
  const cutoffTime = new Date(Date.now() - maxAge);
  
  return await prisma.slackMessage.findMany({
    where: {
      status: 'DETECTED',
      messageTimestamp: {
        gte: cutoffTime,
      },
    },
    orderBy: { messageTimestamp: 'asc' },
    take: limit,
  });
}

/**
 * Mark message as processed
 */
export async function markMessageAsProcessed(id: string): Promise<SlackMessage> {
  return await updateSlackMessage(id, {
    status: 'PROCESSED',
    processedAt: new Date(),
  });
}

/**
 * Mark message as ignored
 */
export async function markMessageAsIgnored(id: string): Promise<SlackMessage> {
  return await updateSlackMessage(id, {
    status: 'IGNORED',
    processedAt: new Date(),
  });
}

/**
 * Mark message as error
 */
export async function markMessageAsError(id: string): Promise<SlackMessage> {
  return await updateSlackMessage(id, {
    status: 'ERROR',
    processedAt: new Date(),
  });
}

/**
 * Get processing statistics
 */
export async function getMessageProcessingStats(): Promise<{
  total: number;
  detected: number;
  processed: number;
  ignored: number;
  error: number;
}> {
  const [total, detected, processed, ignored, error] = await Promise.all([
    prisma.slackMessage.count(),
    prisma.slackMessage.count({ where: { status: 'DETECTED' } }),
    prisma.slackMessage.count({ where: { status: 'PROCESSED' } }),
    prisma.slackMessage.count({ where: { status: 'IGNORED' } }),
    prisma.slackMessage.count({ where: { status: 'ERROR' } }),
  ]);

  return { total, detected, processed, ignored, error };
}

/**
 * Clean up old processed messages
 */
export async function cleanupOldMessages(
  olderThanDays: number = 30
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await prisma.slackMessage.deleteMany({
    where: {
      status: { in: ['PROCESSED', 'IGNORED'] },
      processedAt: {
        lt: cutoffDate,
      },
    },
  });

  return result.count;
}