/**
 * SlackToken model operations and business logic
 * 
 * This module provides typed database operations for SlackToken entities
 * including secure token storage and management.
 */

import prisma from './index';
import type { SlackToken } from '@prisma/client';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 'default-key-for-development';
const ALGORITHM = 'aes-256-gcm';

interface CreateSlackTokenData {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

interface UpdateSlackTokenData {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/**
 * Encrypt sensitive token data
 */
function encryptToken(token: string): string {
  if (process.env.NODE_ENV === 'test') {
    return token; // Skip encryption in tests for simplicity
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY).subarray(0, 32), iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt sensitive token data
 */
function decryptToken(encryptedToken: string): string {
  if (process.env.NODE_ENV === 'test') {
    return encryptedToken; // Skip decryption in tests
  }

  const [ivHex, authTagHex, encrypted] = encryptedToken.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY).subarray(0, 32), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Create or update Slack token for user
 */
export async function upsertSlackToken(data: CreateSlackTokenData): Promise<SlackToken> {
  try {
    const encryptedAccessToken = encryptToken(data.accessToken);
    const encryptedRefreshToken = data.refreshToken ? encryptToken(data.refreshToken) : null;

    return await prisma.slackToken.upsert({
      where: { userId: data.userId },
      update: {
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: data.expiresAt,
        updatedAt: new Date(),
      },
      create: {
        userId: data.userId,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: data.expiresAt,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw new Error('Invalid user ID');
      }
    }
    throw error;
  }
}

/**
 * Find Slack token by user ID
 */
export async function findSlackTokenByUser(userId: string): Promise<SlackToken | null> {
  return await prisma.slackToken.findUnique({
    where: { userId },
  });
}

/**
 * Get decrypted access token for API calls
 */
export async function getDecryptedSlackToken(userId: string): Promise<string | null> {
  const tokenRecord = await findSlackTokenByUser(userId);
  if (!tokenRecord) return null;

  return decryptToken(tokenRecord.accessToken);
}

/**
 * Get decrypted refresh token
 */
export async function getDecryptedSlackRefreshToken(userId: string): Promise<string | null> {
  const tokenRecord = await findSlackTokenByUser(userId);
  if (!tokenRecord?.refreshToken) return null;

  return decryptToken(tokenRecord.refreshToken);
}

/**
 * Update Slack token
 */
export async function updateSlackToken(userId: string, data: UpdateSlackTokenData): Promise<SlackToken> {
  try {
    const updateData: any = { updatedAt: new Date() };

    if (data.accessToken) {
      updateData.accessToken = encryptToken(data.accessToken);
    }
    if (data.refreshToken) {
      updateData.refreshToken = encryptToken(data.refreshToken);
    }
    if (data.expiresAt !== undefined) {
      updateData.expiresAt = data.expiresAt;
    }

    return await prisma.slackToken.update({
      where: { userId },
      data: updateData,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new Error('Slack token not found');
      }
    }
    throw error;
  }
}

/**
 * Delete Slack token for user
 */
export async function deleteSlackToken(userId: string): Promise<void> {
  try {
    await prisma.slackToken.delete({
      where: { userId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        throw new Error('Slack token not found');
      }
    }
    throw error;
  }
}

/**
 * Check if Slack token is expired
 */
export async function isSlackTokenExpired(userId: string): Promise<boolean> {
  const tokenRecord = await findSlackTokenByUser(userId);
  if (!tokenRecord?.expiresAt) return false;

  return new Date() >= tokenRecord.expiresAt;
}

/**
 * Get tokens expiring soon (within 24 hours)
 */
export async function getExpiringSoonSlackTokens(): Promise<SlackToken[]> {
  const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);

  return await prisma.slackToken.findMany({
    where: {
      expiresAt: {
        lte: twentyFourHoursFromNow,
        gt: new Date(),
      },
    },
    include: {
      user: true,
    },
  });
}

/**
 * Get all Slack tokens for cleanup operations
 */
export async function getAllSlackTokens(): Promise<Array<{ userId: string }>> {
  return await prisma.slackToken.findMany({
    select: {
      userId: true,
    },
  });
}