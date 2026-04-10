import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import argon2 from 'argon2';
import { OAuth2Client } from 'google-auth-library';
import { signAccessToken, signPurposeToken, verifyPurposeToken } from '../lib/jwt.js';
import {
  generateRefreshToken,
  hashToken,
  storeRefreshToken,
  rotateRefreshToken,
  deleteRefreshToken,
  deleteAllRefreshTokens,
} from '../lib/tokens.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  findUserByEmail,
  findUserById,
  findUserByGoogleId,
  createEmailUser,
  createGoogleUser,
  updateUserVerified,
  updatePasswordHash,
  linkGoogleAccount,
} from '../db/users.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const GoogleAuthSchema = z.object({
  id_token: z.string().min(1),
});

const VerifyEmailSchema = z.object({
  token: z.string().min(1),
});

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
});

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
});

// ─── Cookie helpers ───────────────────────────────────────────────────────────

const COOKIE_NAME = 'refresh_token';
const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60, // 30 days in seconds
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function setRefreshCookie(reply: any, token: string): void {
  reply.setCookie(COOKIE_NAME, token, COOKIE_OPTS);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function clearRefreshCookie(reply: any): void {
  reply.setCookie(COOKIE_NAME, '', { ...COOKIE_OPTS, maxAge: 0 });
}

// ─── Response builders ────────────────────────────────────────────────────────

interface UserRow {
  id: string;
  email: string;
  display_name: string;
  email_verified: boolean;
  timezone: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  google_oauth_token?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  slack_user_tokens?: any[];
}

function buildUserResponse(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    emailVerified: user.email_verified,
    timezone: user.timezone,
    googleConnected: !!user.google_oauth_token,
    slackConnected: Array.isArray(user.slack_user_tokens) && user.slack_user_tokens.length > 0,
  };
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

interface AuthPluginOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function authRoutes(app: FastifyInstance, opts: AuthPluginOptions): Promise<void> {
  const { prisma } = opts;

  // ── POST /register ──────────────────────────────────────────────────────────
  app.post('/register', async (req, reply) => {
    const result = RegisterSchema.safeParse(req.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Validation failed', details: result.error.flatten() });
    }
    const { email, password, name } = result.data;

    const existing = await findUserByEmail(prisma, email);
    if (existing) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await argon2.hash(password);
    const user = await createEmailUser(prisma, { email, passwordHash, displayName: name });

    // Send verification email (fire-and-forget; don't block registration)
    const verifyToken = await signPurposeToken({ sub: user.id, purpose: 'verify-email' }, '24h');
    sendVerificationEmail(email, verifyToken).catch(() => {
      // Log but don't fail registration if email sending fails
    });

    const refreshToken = generateRefreshToken();
    await storeRefreshToken(prisma, user.id, refreshToken);
    const accessToken = await signAccessToken(user.id, user.email, user.email_verified);

    setRefreshCookie(reply, refreshToken);
    return reply.code(201).send({
      accessToken,
      user: buildUserResponse(user),
    });
  });

  // ── POST /login ─────────────────────────────────────────────────────────────
  app.post('/login', async (req, reply) => {
    const result = LoginSchema.safeParse(req.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Validation failed', details: result.error.flatten() });
    }
    const { email, password } = result.data;

    const user = await findUserByEmail(prisma, email);
    if (!user || !user.password_hash) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const valid = await argon2.verify(user.password_hash, password);
    if (!valid) {
      return reply.code(401).send({ error: 'Invalid email or password' });
    }

    const refreshToken = generateRefreshToken();
    await storeRefreshToken(prisma, user.id, refreshToken);
    const accessToken = await signAccessToken(user.id, user.email, user.email_verified);

    setRefreshCookie(reply, refreshToken);
    return reply.code(200).send({
      accessToken,
      user: buildUserResponse(user),
    });
  });

  // ── POST /google ─────────────────────────────────────────────────────────────
  app.post('/google', async (req, reply) => {
    const result = GoogleAuthSchema.safeParse(req.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Validation failed', details: result.error.flatten() });
    }
    const { id_token } = result.data;

    const googleClientId = process.env.GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return reply.code(500).send({ error: 'Google OAuth not configured' });
    }

    let googlePayload: {
      sub: string;
      email: string;
      name?: string;
      email_verified?: boolean;
    };
    try {
      const client = new OAuth2Client(googleClientId);
      const ticket = await client.verifyIdToken({ idToken: id_token, audience: googleClientId });
      const p = ticket.getPayload();
      if (!p?.sub || !p?.email) throw new Error('Missing fields in Google token');
      googlePayload = {
        sub: p.sub,
        email: p.email,
        name: p.name,
        email_verified: p.email_verified,
      };
    } catch {
      return reply.code(401).send({ error: 'Invalid Google ID token' });
    }

    const { sub: googleId, email, name, email_verified } = googlePayload;
    let user = await findUserByGoogleId(prisma, googleId);

    if (!user) {
      // Try linking by email
      const byEmail = await findUserByEmail(prisma, email);
      if (byEmail) {
        await linkGoogleAccount(prisma, byEmail.id, googleId);
        user = await findUserById(prisma, byEmail.id);
      } else {
        // Create new user
        user = await createGoogleUser(prisma, {
          email,
          googleId,
          displayName: name ?? (email.split('@')[0] ?? email),
        });
      }
    }

    if (!user) {
      return reply.code(500).send({ error: 'Failed to create or find user' });
    }

    const refreshToken = generateRefreshToken();
    await storeRefreshToken(prisma, user.id, refreshToken);
    const accessToken = await signAccessToken(user.id, user.email, user.email_verified);

    setRefreshCookie(reply, refreshToken);
    return reply.code(200).send({
      accessToken,
      user: buildUserResponse(user),
    });
  });

  // ── POST /refresh ───────────────────────────────────────────────────────────
  app.post('/refresh', async (req, reply) => {
    const rawToken = req.cookies?.[COOKIE_NAME];
    if (!rawToken) {
      return reply.code(401).send({ error: 'No refresh token' });
    }

    const tokenHash = hashToken(rawToken);
    const stored = await prisma.refreshToken.findFirst({
      where: { token_hash: tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expires_at < new Date()) {
      clearRefreshCookie(reply);
      return reply.code(401).send({ error: 'Invalid or expired refresh token' });
    }

    const newRefreshToken = await rotateRefreshToken(prisma, tokenHash, stored.user_id);
    const accessToken = await signAccessToken(
      stored.user.id,
      stored.user.email,
      stored.user.email_verified,
    );

    setRefreshCookie(reply, newRefreshToken);
    return reply.code(200).send({ accessToken });
  });

  // ── POST /logout ─────────────────────────────────────────────────────────────
  app.post('/logout', { preHandler: authenticate }, async (req, reply) => {
    const rawToken = req.cookies?.[COOKIE_NAME];
    if (rawToken) {
      await deleteRefreshToken(prisma, hashToken(rawToken));
    }
    clearRefreshCookie(reply);
    return reply.code(200).send({ message: 'Logged out' });
  });

  // ── POST /verify-email ───────────────────────────────────────────────────────
  app.post('/verify-email', async (req, reply) => {
    const result = VerifyEmailSchema.safeParse(req.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Validation failed', details: result.error.flatten() });
    }

    try {
      const payload = await verifyPurposeToken(result.data.token, 'verify-email');
      await updateUserVerified(prisma, payload.sub);
      return reply.code(200).send({ message: 'Email verified' });
    } catch {
      return reply.code(400).send({ error: 'Invalid or expired verification token' });
    }
  });

  // ── POST /resend-verification ────────────────────────────────────────────────
  app.post('/resend-verification', { preHandler: authenticate }, async (req, reply) => {
    if (req.user.emailVerified) {
      return reply.code(400).send({ error: 'Email already verified' });
    }

    const token = await signPurposeToken({ sub: req.user.id, purpose: 'verify-email' }, '24h');
    await sendVerificationEmail(req.user.email, token);
    return reply.code(200).send({ message: 'Verification email sent' });
  });

  // ── POST /forgot-password ────────────────────────────────────────────────────
  app.post('/forgot-password', async (req, reply) => {
    const result = ForgotPasswordSchema.safeParse(req.body);
    if (!result.success) {
      // Still return 200 to prevent email enumeration
      return reply.code(200).send({ message: 'If that email exists, a reset link has been sent' });
    }

    const user = await findUserByEmail(prisma, result.data.email);
    // Only send reset for email/password accounts (not Google-only accounts)
    if (user?.password_hash) {
      const token = await signPurposeToken(
        { sub: user.id, purpose: 'reset-password' },
        '1h',
      );
      sendPasswordResetEmail(user.email, token).catch(() => {});
    }

    return reply.code(200).send({ message: 'If that email exists, a reset link has been sent' });
  });

  // ── POST /reset-password ─────────────────────────────────────────────────────
  app.post('/reset-password', async (req, reply) => {
    const result = ResetPasswordSchema.safeParse(req.body);
    if (!result.success) {
      return reply.code(400).send({ error: 'Validation failed', details: result.error.flatten() });
    }
    const { token, password } = result.data;

    try {
      const payload = await verifyPurposeToken(token, 'reset-password');
      const passwordHash = await argon2.hash(password);
      await updatePasswordHash(prisma, payload.sub, passwordHash);
      await deleteAllRefreshTokens(prisma, payload.sub);
      return reply.code(200).send({ message: 'Password reset successfully' });
    } catch {
      return reply.code(400).send({ error: 'Invalid or expired reset token' });
    }
  });

  // ── GET /me ──────────────────────────────────────────────────────────────────
  app.get('/me', { preHandler: authenticate }, async (req, reply) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: {
        google_oauth_token: true,
        slack_user_tokens: { select: { id: true } },
      },
    });

    if (!user) {
      return reply.code(404).send({ error: 'User not found' });
    }

    return reply.code(200).send({ user: buildUserResponse(user) });
  });
}
