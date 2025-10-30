/**
 * Slack connection utilities
 * 
 * This module provides minimal utilities for Slack API connections.
 * 
 * NOTE: For task detection, we use Slack Events API (webhooks) exclusively.
 * We do NOT read message history proactively - messages come to us via events.
 * 
 * This service only provides:
 * - Connection health checks
 * - Basic channel/user info (for validation/debugging only)
 * 
 * OUT OF SCOPE for MVP:
 * - Message history reading (readChannelMessages, readThreadMessages)
 * - Thread context analysis  
 * - Proactive message scanning (getMessagesMentioningBot)
 * - Channel listing (getUserChannels)
 * 
 * These functions were removed because they're not needed for events-based architecture.
 */

import { WebClient } from '@slack/web-api';
import { getDecryptedSlackToken } from '../../models/slackToken';
import { findWorkspaceById } from '../../models/workspace';

export interface ChannelInfo {
  id: string;
  name: string;
  isPrivate: boolean;
  memberCount?: number;
}

/**
 * Create Slack client for a specific user (user token)
 */
async function createSlackClientForUser(userId: string): Promise<WebClient> {
  const token = await getDecryptedSlackToken(userId);
  if (!token) {
    throw new Error('Slack token not found for user');
  }

  return new WebClient(token);
}

/**
 * Create Slack client using workspace bot token
 */
async function createSlackClientForWorkspace(workspaceId: string): Promise<WebClient> {
  const workspace = await findWorkspaceById(workspaceId);
  if (!workspace || !workspace.isActive) {
    throw new Error('Workspace not found or inactive');
  }

  return new WebClient(workspace.slackBotToken);
}

/**
 * Get channel information (BOT TOKEN or USER TOKEN - for validation/debugging)
 * This is used for validation purposes, not for reading messages
 */
export async function getChannelInfo(
  channelId: string,
  workspaceId: string,
  userId?: string
): Promise<ChannelInfo | null> {
  try {
    // Use bot token when possible, fall back to user token if userId provided
    const slack = userId 
      ? await createSlackClientForUser(userId)
      : await createSlackClientForWorkspace(workspaceId);
    
    console.log(`ℹ️ [Workspace ID: ${workspaceId}] Getting channel info for validation: channel ${channelId} using ${userId ? 'user' : 'bot'} token`);
    
    const result = await slack.conversations.info({
      channel: channelId,
    });

    if (!result.ok || !result.channel) {
      console.error(`[Workspace ID: ${workspaceId}] Failed to get channel info: ${result.error}`);
      return null;
    }

    const channel = result.channel;
    
    return {
      id: channel.id!,
      name: channel.name || 'Unknown',
      isPrivate: channel.is_private || false,
      memberCount: channel.num_members,
    };
  } catch (error) {
    console.error(`[Workspace ID: ${workspaceId}] Failed to get channel info:`, error);
    return null;
  }
}

/**
 * Check if user is member of a channel (BOT TOKEN preferred - for validation)
 * This is used for access validation, not for reading messages
 */
export async function isUserInChannel(
  channelId: string,
  workspaceId: string,
  targetUserId: string,
  fallbackUserId?: string
): Promise<boolean> {
  try {
    // Use bot token when possible, fall back to user token if provided
    const slack = fallbackUserId 
      ? await createSlackClientForUser(fallbackUserId)
      : await createSlackClientForWorkspace(workspaceId);
    
    console.log(`👤 [Workspace ID: ${workspaceId}] Validating channel membership: user ${targetUserId} in channel ${channelId} using ${fallbackUserId ? 'user' : 'bot'} token`);
    
    const result = await slack.conversations.members({
      channel: channelId,
    });

    if (!result.ok || !result.members) {
      console.log(`👤 [Workspace ID: ${workspaceId}] Could not get channel members: ${result.error}`);
      return false;
    }

    const isMember = result.members.includes(targetUserId);
    console.log(`👤 [Workspace ID: ${workspaceId}] User ${targetUserId} ${isMember ? 'IS' : 'IS NOT'} in channel ${channelId}`);
    return isMember;
  } catch (error) {
    console.error(`[Workspace ID: ${workspaceId}] Failed to check channel membership:`, error);
    return false;
  }
}

/**
 * Check Slack API connection health (BOT TOKEN or USER TOKEN)
 * This is the main function used by other services for token validation
 */
export async function checkSlackConnection(
  workspaceId: string,
  userId?: string
): Promise<boolean> {
  try {
    // Use bot token when possible, fall back to user token if userId provided
    const slack = userId 
      ? await createSlackClientForUser(userId)
      : await createSlackClientForWorkspace(workspaceId);
    
    console.log(`🔗 [Workspace ID: ${workspaceId}] Checking Slack connection using ${userId ? `user ${userId}` : 'bot'} token`);
    
    const result = await slack.auth.test();
    const isConnected = result.ok === true;
    
    console.log(`🔗 [Workspace ID: ${workspaceId}] Slack connection: ${isConnected ? 'CONNECTED' : 'FAILED'}`);
    return isConnected;
  } catch (error) {
    console.error(`[Workspace ID: ${workspaceId}] Slack connection check failed:`, error);
    return false;
  }
}