import type { FastifyInstance, FastifyPluginOptions } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { WebClient } from '@slack/web-api';
import { OAuth2Client } from 'google-auth-library';
import { authenticate } from '../middleware/authenticate.js';
import { encryptToken } from '../lib/crypto.js';

// ─── Schemas ─────────────────────────────────────────────────────────────────

const SlackCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

const GoogleCallbackQuerySchema = z.object({
  code: z.string().min(1).optional(),
  state: z.string().optional(),
  error: z.string().optional(),
});

const SlackDeleteParamsSchema = z.object({
  installationId: z.string().uuid(),
});

// ─── Cookie helpers ───────────────────────────────────────────────────────────

const OAUTH_STATE_COOKIE = 'oauth_state';
const OAUTH_STATE_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const, // lax not strict — OAuth callbacks are cross-site navigations
  path: '/api/connect',
  maxAge: 600, // 10-minute window for the OAuth flow
  signed: true,
};

// ─── Plugin ───────────────────────────────────────────────────────────────────

interface ConnectPluginOptions extends FastifyPluginOptions {
  prisma: PrismaClient;
}

export async function connectRoutes(
  app: FastifyInstance,
  opts: ConnectPluginOptions,
): Promise<void> {
  const { prisma } = opts;

  // ── GET /slack ──────────────────────────────────────────────────────────────
  app.get('/slack', { preHandler: authenticate }, async (req, reply) => {
    const clientId = process.env.SLACK_CLIENT_ID;
    const redirectUri = process.env.SLACK_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return reply.code(500).send({ error: 'Slack OAuth not configured' });
    }

    const url = new URL('https://slack.com/oauth/v2/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set(
      'user_scope',
      'channels:history,channels:read,im:history,mpim:history,users:read',
    );
    url.searchParams.set('redirect_uri', redirectUri);

    reply.setCookie(OAUTH_STATE_COOKIE, req.user.id, OAUTH_STATE_COOKIE_OPTS);
    return reply.redirect(url.toString());
  });

  // ── GET /slack/callback ─────────────────────────────────────────────────────
  app.get('/slack/callback', async (req, reply) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const result = SlackCallbackQuerySchema.safeParse(req.query);

    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query parameters' });
    }
    const { code, error } = result.data;

    if (error) {
      return reply.redirect(`${frontendUrl}/onboarding?slack=error&reason=${error}`);
    }

    if (!code) {
      return reply.code(400).send({ error: 'Missing code parameter' });
    }

    // Verify signed state cookie
    const rawCookie = req.cookies[OAUTH_STATE_COOKIE];
    if (!rawCookie) {
      return reply.code(400).send({ error: 'Missing state cookie' });
    }
    const unsigned = req.unsignCookie(rawCookie);
    if (!unsigned.valid || !unsigned.value) {
      return reply.code(400).send({ error: 'Invalid state cookie' });
    }
    const userId = unsigned.value;

    // Clear the state cookie immediately after reading
    reply.setCookie(OAUTH_STATE_COOKIE, '', { ...OAUTH_STATE_COOKIE_OPTS, maxAge: 0 });

    const clientId = process.env.SLACK_CLIENT_ID!;
    const clientSecret = process.env.SLACK_CLIENT_SECRET!;
    const redirectUri = process.env.SLACK_REDIRECT_URI!;

    // Exchange code for user token
    let oauthResp;
    try {
      const client = new WebClient();
      oauthResp = await client.oauth.v2.access({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
      });
    } catch {
      return reply.code(400).send({ error: 'Slack token exchange failed' });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const authedUser = oauthResp.authed_user as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const team = oauthResp.team as any;

    if (!authedUser?.access_token || !authedUser?.id || !team?.id || !team?.name) {
      return reply.code(400).send({ error: 'Incomplete Slack OAuth response' });
    }

    // Upsert SlackInstallation — user-token flow provides no bot credentials,
    // so we store a placeholder that the future bot-installation flow will overwrite.
    const placeholderBotToken = Buffer.from(encryptToken(''));
    const installation = await prisma.slackInstallation.upsert({
      where: { slack_team_id: team.id },
      create: {
        slack_team_id: team.id,
        slack_team_name: team.name,
        bot_token_encrypted: placeholderBotToken,
        bot_user_id: '',
        installed_by: userId,
      },
      update: { slack_team_name: team.name },
    });

    // Upsert SlackUserToken
    await prisma.slackUserToken.upsert({
      where: { user_id_installation_id: { user_id: userId, installation_id: installation.id } },
      create: {
        user_id: userId,
        installation_id: installation.id,
        slack_user_id: authedUser.id,
        user_token_encrypted: Buffer.from(encryptToken(authedUser.access_token)),
        scopes: authedUser.scope ?? '',
      },
      update: {
        slack_user_id: authedUser.id,
        user_token_encrypted: Buffer.from(encryptToken(authedUser.access_token)),
        scopes: authedUser.scope ?? '',
        token_expires_at: null,
      },
    });

    return reply.redirect(`${frontendUrl}/onboarding?slack=connected`);
  });

  // ── DELETE /slack/:installationId ───────────────────────────────────────────
  app.delete('/slack/:installationId', { preHandler: authenticate }, async (req, reply) => {
    const parsed = SlackDeleteParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid installationId' });
    }

    // deleteMany is intentional: idempotent (no throw if not found) + user_id filter is enforced
    await prisma.slackUserToken.deleteMany({
      where: {
        user_id: req.user.id,
        installation_id: parsed.data.installationId,
      },
    });

    return reply.code(204).send();
  });

  // ── GET /google ─────────────────────────────────────────────────────────────
  app.get('/google', { preHandler: authenticate }, async (req, reply) => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;
    if (!clientId || !clientSecret || !redirectUri) {
      return reply.code(500).send({ error: 'Google OAuth not configured' });
    }

    const oauth2Client = new OAuth2Client({ clientId, clientSecret, redirectUri });
    const url = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent', // always returns refresh_token, even if previously authorized
      scope: [
        'openid',
        'email',
        'https://www.googleapis.com/auth/calendar',
      ],
    });

    reply.setCookie(OAUTH_STATE_COOKIE, req.user.id, OAUTH_STATE_COOKIE_OPTS);
    return reply.redirect(url);
  });

  // ── GET /google/callback ────────────────────────────────────────────────────
  app.get('/google/callback', async (req, reply) => {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const result = GoogleCallbackQuerySchema.safeParse(req.query);

    if (!result.success) {
      return reply.code(400).send({ error: 'Invalid query parameters' });
    }
    const { code, error } = result.data;

    if (error) {
      return reply.redirect(`${frontendUrl}/onboarding?google=error&reason=${error}`);
    }

    if (!code) {
      return reply.code(400).send({ error: 'Missing code parameter' });
    }

    // Verify signed state cookie
    const rawCookie = req.cookies[OAUTH_STATE_COOKIE];
    if (!rawCookie) {
      return reply.code(400).send({ error: 'Missing state cookie' });
    }
    const unsigned = req.unsignCookie(rawCookie);
    if (!unsigned.valid || !unsigned.value) {
      return reply.code(400).send({ error: 'Invalid state cookie' });
    }
    const userId = unsigned.value;

    // Clear state cookie immediately after reading
    reply.setCookie(OAUTH_STATE_COOKIE, '', { ...OAUTH_STATE_COOKIE_OPTS, maxAge: 0 });

    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI!;

    const oauth2Client = new OAuth2Client({ clientId, clientSecret, redirectUri });

    let tokens;
    try {
      const tokenResp = await oauth2Client.getToken(code);
      tokens = tokenResp.tokens;
    } catch {
      return reply.code(400).send({ error: 'Google token exchange failed' });
    }

    if (!tokens.access_token || !tokens.refresh_token || !tokens.id_token) {
      return reply.code(400).send({ error: 'Incomplete token response from Google' });
    }

    // Verify id_token to extract the Google account email
    let googleEmail: string;
    try {
      const ticket = await oauth2Client.verifyIdToken({
        idToken: tokens.id_token,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.email) throw new Error('No email in token payload');
      googleEmail = payload.email;
    } catch {
      return reply.code(400).send({ error: 'Failed to verify Google identity token' });
    }

    const expiresAt = new Date(tokens.expiry_date ?? Date.now() + 3_600_000);

    await prisma.googleOauthToken.upsert({
      where: { user_id: userId },
      create: {
        user_id: userId,
        google_email: googleEmail,
        access_token_encrypted: Buffer.from(encryptToken(tokens.access_token)),
        refresh_token_encrypted: Buffer.from(encryptToken(tokens.refresh_token)),
        token_expires_at: expiresAt,
      },
      update: {
        google_email: googleEmail,
        access_token_encrypted: Buffer.from(encryptToken(tokens.access_token)),
        refresh_token_encrypted: Buffer.from(encryptToken(tokens.refresh_token)),
        token_expires_at: expiresAt,
      },
    });

    return reply.redirect(`${frontendUrl}/onboarding?google=connected`);
  });

  // ── DELETE /google ──────────────────────────────────────────────────────────
  app.delete('/google', { preHandler: authenticate }, async (req, reply) => {
    // deleteMany is intentional: idempotent + user_id filter enforced
    await prisma.googleOauthToken.deleteMany({
      where: { user_id: req.user.id },
    });

    return reply.code(204).send();
  });
}
