import { randomBytes, createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

const REFRESH_TOKEN_BYTES = 32;
const REFRESH_TOKEN_TTL_DAYS = 30;

export function generateRefreshToken(): string {
  return randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function storeRefreshToken(
  prisma: PrismaClient,
  userId: string,
  token: string,
): Promise<void> {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await prisma.refreshToken.create({
    data: {
      user_id: userId,
      token_hash: hashToken(token),
      expires_at: expiresAt,
    },
  });
}

export async function rotateRefreshToken(
  prisma: PrismaClient,
  oldTokenHash: string,
  userId: string,
): Promise<string> {
  // Delete old token + create new one atomically
  const newToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.refreshToken.deleteMany({ where: { token_hash: oldTokenHash, user_id: userId } }),
    prisma.refreshToken.create({
      data: {
        user_id: userId,
        token_hash: hashToken(newToken),
        expires_at: expiresAt,
      },
    }),
  ]);

  return newToken;
}

export async function deleteRefreshToken(
  prisma: PrismaClient,
  tokenHash: string,
): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { token_hash: tokenHash } });
}

export async function deleteAllRefreshTokens(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.refreshToken.deleteMany({ where: { user_id: userId } });
}
