import { OAuth2Client } from 'google-auth-library';
import type { PrismaClient } from '@prisma/client';
import { decryptToken, encryptToken } from './crypto.js';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

export async function getValidGoogleAccessToken(
  userId: string,
  prisma: PrismaClient,
): Promise<string | null> {
  const row = await prisma.googleOauthToken.findUnique({ where: { user_id: userId } });
  if (!row) return null;

  // Token still valid with buffer
  if (row.token_expires_at.getTime() - Date.now() > REFRESH_BUFFER_MS) {
    return decryptToken(row.access_token_encrypted.toString());
  }

  // Near expiry — refresh
  const client = new OAuth2Client({
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  });
  client.setCredentials({ refresh_token: decryptToken(row.refresh_token_encrypted.toString()) });

  try {
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token) throw new Error('No access_token returned');

    await prisma.googleOauthToken.update({
      where: { user_id: userId },
      data: {
        access_token_encrypted: Buffer.from(encryptToken(credentials.access_token)),
        token_expires_at: new Date(credentials.expiry_date ?? Date.now() + 3_600_000),
        ...(credentials.refresh_token
          ? { refresh_token_encrypted: Buffer.from(encryptToken(credentials.refresh_token)) }
          : {}),
      },
    });
    return credentials.access_token;
  } catch (err) {
    console.error(
      `[google] Token refresh failed for user ${userId}:`,
      (err as Error).message,
    );
    await prisma.googleOauthToken.delete({ where: { user_id: userId } });
    return null;
  }
}
