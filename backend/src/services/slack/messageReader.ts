/**
 * Slack message reading service
 * 
 * This module provides functionality to read and process messages
 * from Slack channels using the Slack Web API.
 */

import { WebClient } from '@slack/web-api';
import { getDecryptedSlackToken } from '../../models/slackToken';
import { config } from '../../config';

export interface SlackMessageData {
  messageId: string;
  channelId: string;
  threadId?: string;
  userId: string;
  text: string;
  timestamp: string;
  messageTimestamp: Date;
}

export interface ChannelInfo {
  id: string;
  name: string;
  isPrivate: boolean;
  memberCount?: number;
}

/**
 * Create Slack client for a specific user
 */
async function createSlackClient(userId: string): Promise<WebClient> {
  const token = await getDecryptedSlackToken(userId);
  if (!token) {
    throw new Error('Slack token not found for user');
  }

  return new WebClient(token);
}

/**
 * Read messages from a specific channel
 */
export async function readChannelMessages(
  userId: string,
  channelId: string,
  options?: {
    limit?: number;
    oldest?: string;
    latest?: string;
    includeThreads?: boolean;
  }
): Promise<SlackMessageData[]> {
  try {
    const slack = await createSlackClient(userId);
    
    const result = await slack.conversations.history({
      channel: channelId,
      limit: options?.limit || 10,
      oldest: options?.oldest,
      latest: options?.latest,
      inclusive: true,
    });

    if (!result.ok || !result.messages) {
      throw new Error(`Failed to read messages: ${result.error}`);
    }

    const messages: SlackMessageData[] = [];

    for (const message of result.messages) {
      // Skip bot messages and system messages
      if ((message as any).bot_id || (message as any).subtype) {
        continue;
      }

      // Skip messages without text
      if (!message.text || !message.ts || !message.user) {
        continue;
      }

      const messageData: SlackMessageData = {
        messageId: message.ts,
        channelId: channelId,
        threadId: (message as any).thread_ts,
        userId: message.user,
        text: message.text,
        timestamp: message.ts,
        messageTimestamp: new Date(parseFloat(message.ts) * 1000),
      };

      messages.push(messageData);

      // Read thread replies if requested
      if (options?.includeThreads && (message as any).thread_ts && (message as any).reply_count) {
        try {
          const threadMessages = await readThreadMessages(userId, channelId, (message as any).thread_ts);
          messages.push(...threadMessages);
        } catch (error) {
          console.error('Failed to read thread messages:', error);
        }
      }
    }

    return messages.sort((a, b) => a.messageTimestamp.getTime() - b.messageTimestamp.getTime());
  } catch (error) {
    console.error('Failed to read channel messages:', error);
    throw error;
  }
}

/**
 * Read messages from a thread
 */
export async function readThreadMessages(
  userId: string,
  channelId: string,
  threadTs: string
): Promise<SlackMessageData[]> {
  try {
    const slack = await createSlackClient(userId);
    
    const result = await slack.conversations.replies({
      channel: channelId,
      ts: threadTs,
    });

    if (!result.ok || !result.messages) {
      throw new Error(`Failed to read thread messages: ${result.error}`);
    }

    const messages: SlackMessageData[] = [];

    for (const message of result.messages) {
      // Skip the parent message (already processed)
      if (message.ts === threadTs) {
        continue;
      }

      // Skip bot messages and system messages
      if ((message as any).bot_id || (message as any).subtype) {
        continue;
      }

      // Skip messages without text
      if (!message.text || !message.ts || !message.user) {
        continue;
      }

      messages.push({
        messageId: message.ts,
        channelId: channelId,
        threadId: threadTs,
        userId: message.user,
        text: message.text,
        timestamp: message.ts,
        messageTimestamp: new Date(parseFloat(message.ts) * 1000),
      });
    }

    return messages;
  } catch (error) {
    console.error('Failed to read thread messages:', error);
    throw error;
  }
}

/**
 * Get channel information
 */
export async function getChannelInfo(
  userId: string,
  channelId: string
): Promise<ChannelInfo | null> {
  try {
    const slack = await createSlackClient(userId);
    
    const result = await slack.conversations.info({
      channel: channelId,
    });

    if (!result.ok || !result.channel) {
      console.error(`Failed to get channel info: ${result.error}`);
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
    console.error('Failed to get channel info:', error);
    return null;
  }
}

/**
 * Get user's accessible channels
 */
export async function getUserChannels(userId: string): Promise<ChannelInfo[]> {
  try {
    const slack = await createSlackClient(userId);
    
    const result = await slack.conversations.list({
      types: 'public_channel,private_channel',
      exclude_archived: true,
    });

    if (!result.ok || !result.channels) {
      throw new Error(`Failed to get channels: ${result.error}`);
    }

    const channels: ChannelInfo[] = [];

    for (const channel of result.channels) {
      if (channel.id && channel.name) {
        channels.push({
          id: channel.id,
          name: channel.name,
          isPrivate: channel.is_private || false,
          memberCount: channel.num_members,
        });
      }
    }

    return channels;
  } catch (error) {
    console.error('Failed to get user channels:', error);
    throw error;
  }
}

/**
 * Check if user is member of a channel
 */
export async function isUserInChannel(
  userId: string,
  channelId: string,
  targetUserId?: string
): Promise<boolean> {
  try {
    const slack = await createSlackClient(userId);
    
    const result = await slack.conversations.members({
      channel: channelId,
    });

    if (!result.ok || !result.members) {
      return false;
    }

    const checkUserId = targetUserId || userId;
    return result.members.includes(checkUserId);
  } catch (error) {
    console.error('Failed to check channel membership:', error);
    return false;
  }
}

/**
 * Get recent messages mentioning the bot
 */
export async function getMessagesMentioningBot(
  userId: string,
  botUserId: string,
  options?: {
    limit?: number;
    maxAge?: number; // hours
  }
): Promise<SlackMessageData[]> {
  try {
    const channels = await getUserChannels(userId);
    const messages: SlackMessageData[] = [];
    const limit = options?.limit || 50;
    const maxAge = options?.maxAge || 24;
    const oldestTimestamp = (Date.now() - (maxAge * 60 * 60 * 1000)) / 1000;

    for (const channel of channels) {
      try {
        const channelMessages = await readChannelMessages(userId, channel.id, {
          limit: 20,
          oldest: oldestTimestamp.toString(),
        });

        // Filter for messages mentioning the bot
        const mentionMessages = channelMessages.filter(msg => 
          msg.text.includes(`<@${botUserId}>`)
        );

        messages.push(...mentionMessages);

        if (messages.length >= limit) {
          break;
        }
      } catch (error) {
        console.error(`Failed to read messages from channel ${channel.name}:`, error);
        // Continue with other channels
      }
    }

    return messages
      .sort((a, b) => b.messageTimestamp.getTime() - a.messageTimestamp.getTime())
      .slice(0, limit);
  } catch (error) {
    console.error('Failed to get messages mentioning bot:', error);
    throw error;
  }
}

/**
 * Check Slack API connection health
 */
export async function checkSlackConnection(userId: string): Promise<boolean> {
  try {
    const slack = await createSlackClient(userId);
    const result = await slack.auth.test();
    return result.ok === true;
  } catch (error) {
    console.error('Slack connection check failed:', error);
    return false;
  }
}