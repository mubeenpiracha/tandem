import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { connectRoutes } from '../connect.js';

// ─── Mock @slack/web-api ──────────────────────────────────────────────────────

const mockOauthV2Access = vi.fn();

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation(() => ({
    oauth: {
      v2: {
        access: mockOauthV2Access,
      },
    },
  })),
}));

// ─── Mock google-auth-library ─────────────────────────────────────────────────

const mockGenerateAuthUrl = vi.fn().mockReturnValue('https://accounts.google.com/o/oauth2/auth?mock=1');
const mockGetToken = vi.fn();
const mockVerifyIdToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockRefreshAccessToken = vi.fn();

vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    generateAuthUrl: mockGenerateAuthUrl,
    getToken: mockGetToken,
    verifyIdToken: mockVerifyIdToken,
    setCredentials: mockSetCredentials,
    refreshAccessToken: mockRefreshAccessToken,
  })),
}));

// ─── Mock crypto — avoids ENCRYPTION_KEY_CURRENT env var requirement ──────────

vi.mock('../../lib/crypto.js', () => ({
  encryptToken: vi.fn().mockImplementation((v: string) => `enc:${v}`),
  decryptToken: vi.fn().mockImplementation((v: string) => v.replace(/^enc:/, '')),
}));

// ─── Constants ────────────────────────────────────────────────────────────────

const JWT_SECRET = 'supersecretjwtsecretthatis32charslong!!';
const FRONTEND_URL = 'http://localhost:5173';

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma = {
  slackInstallation: {
    upsert: vi.fn(),
  },
  slackUserToken: {
    upsert: vi.fn(),
    deleteMany: vi.fn(),
  },
  googleOauthToken: {
    findUnique: vi.fn(),
    upsert: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(fastifyCookie, { secret: JWT_SECRET });
  await app.register(connectRoutes, { prefix: '/api/connect', prisma: mockPrisma as never });
  await app.ready();
  return app;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function signedStateCookie(userId: string): string {
  return `oauth_state=${fastifyCookie.sign(userId, JWT_SECRET)}`;
}

async function validJwt(userId = 'user-1', email = 'test@example.com'): Promise<string> {
  const { signAccessToken } = await import('../../lib/jwt.js');
  return signAccessToken(userId, email, true);
}

// ─── Tests: GET /api/connect/slack ───────────────────────────────────────────

describe('GET /api/connect/slack', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.FRONTEND_URL = FRONTEND_URL;
    process.env.SLACK_CLIENT_ID = 'slack-client-id';
    process.env.SLACK_CLIENT_SECRET = 'slack-client-secret';
    process.env.SLACK_REDIRECT_URI = 'http://localhost:3001/api/connect/slack/callback';
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
    delete process.env.FRONTEND_URL;
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
    delete process.env.SLACK_REDIRECT_URI;
  });

  it('returns 401 without a JWT', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/connect/slack' });
    expect(res.statusCode).toBe(401);
  });

  it('redirects to Slack auth URL with valid JWT', async () => {
    const token = await validJwt();
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/slack',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/^https:\/\/slack\.com\/oauth\/v2\/authorize/);
    expect(res.headers.location).toContain('user_scope=');
    expect(res.headers.location).toContain('client_id=slack-client-id');
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('oauth_state=');
  });

  it('returns 500 when SLACK_CLIENT_ID is not set', async () => {
    delete process.env.SLACK_CLIENT_ID;
    const token = await validJwt();
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/slack',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Tests: GET /api/connect/slack/callback ───────────────────────────────────

describe('GET /api/connect/slack/callback', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.FRONTEND_URL = FRONTEND_URL;
    process.env.SLACK_CLIENT_ID = 'slack-client-id';
    process.env.SLACK_CLIENT_SECRET = 'slack-client-secret';
    process.env.SLACK_REDIRECT_URI = 'http://localhost:3001/api/connect/slack/callback';
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
    delete process.env.FRONTEND_URL;
    delete process.env.SLACK_CLIENT_ID;
    delete process.env.SLACK_CLIENT_SECRET;
    delete process.env.SLACK_REDIRECT_URI;
  });

  it('returns 400 when code is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/slack/callback',
      headers: { cookie: signedStateCookie('user-1') },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when state cookie is absent', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/slack/callback?code=some-code',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when state cookie is tampered', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/slack/callback?code=some-code',
      headers: { cookie: 'oauth_state=tampered-value' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('happy path: upserts installation and user token, redirects to frontend', async () => {
    mockOauthV2Access.mockResolvedValue({
      ok: true,
      authed_user: {
        access_token: 'xoxp-user-token',
        scope: 'channels:history,channels:read',
        id: 'U123',
      },
      team: { id: 'T123', name: 'Test Team' },
    });
    mockPrisma.slackInstallation.upsert.mockResolvedValue({ id: 'inst-1' });
    mockPrisma.slackUserToken.upsert.mockResolvedValue({});

    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/slack/callback?code=valid-code',
      headers: { cookie: signedStateCookie('user-1') },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${FRONTEND_URL}/onboarding?slack=connected`);
    expect(mockPrisma.slackInstallation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { slack_team_id: 'T123' },
      }),
    );
    expect(mockPrisma.slackUserToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id_installation_id: { user_id: 'user-1', installation_id: 'inst-1' } },
      }),
    );
  });

  it('uses upsert (not separate create) for SlackInstallation to handle race conditions', async () => {
    mockOauthV2Access.mockResolvedValue({
      ok: true,
      authed_user: { access_token: 'xoxp-token', scope: 'channels:history', id: 'U456' },
      team: { id: 'T456', name: 'Another Team' },
    });
    mockPrisma.slackInstallation.upsert.mockResolvedValue({ id: 'inst-2' });
    mockPrisma.slackUserToken.upsert.mockResolvedValue({});

    await app.inject({
      method: 'GET',
      url: '/api/connect/slack/callback?code=code-2',
      headers: { cookie: signedStateCookie('user-2') },
    });

    // upsert should be called (handles both create and find cases)
    expect(mockPrisma.slackInstallation.upsert).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when Slack token exchange throws', async () => {
    mockOauthV2Access.mockRejectedValue(new Error('invalid_code'));

    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/slack/callback?code=bad-code',
      headers: { cookie: signedStateCookie('user-1') },
    });
    expect(res.statusCode).toBe(400);
  });

  it('redirects with error reason when Slack sends error param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/slack/callback?error=access_denied',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('slack=error');
  });
});

// ─── Tests: DELETE /api/connect/slack/:installationId ────────────────────────

describe('DELETE /api/connect/slack/:installationId', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  it('returns 401 without a JWT', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/connect/slack/00000000-0000-0000-0000-000000000001',
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 204 on success and deletes with user_id filter', async () => {
    mockPrisma.slackUserToken.deleteMany.mockResolvedValue({ count: 1 });
    const token = await validJwt('user-1');
    const instId = '00000000-0000-0000-0000-000000000001';

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/connect/slack/${instId}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);
    expect(mockPrisma.slackUserToken.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1', installation_id: instId },
    });
  });

  it('returns 204 even if token did not exist (idempotent)', async () => {
    mockPrisma.slackUserToken.deleteMany.mockResolvedValue({ count: 0 });
    const token = await validJwt('user-1');

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/connect/slack/00000000-0000-0000-0000-000000000001',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);
  });

  it('returns 400 for a non-UUID installationId', async () => {
    const token = await validJwt('user-1');
    const res = await app.inject({
      method: 'DELETE',
      url: '/api/connect/slack/not-a-uuid',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── Tests: GET /api/connect/google ──────────────────────────────────────────

describe('GET /api/connect/google', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/connect/google/callback';
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  it('returns 401 without a JWT', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/connect/google' });
    expect(res.statusCode).toBe(401);
  });

  it('redirects to Google auth URL with valid JWT', async () => {
    const token = await validJwt();
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/google',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('https://accounts.google.com/o/oauth2/auth?mock=1');
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toContain('oauth_state=');
  });

  it('returns 500 when Google env vars are not set', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const token = await validJwt();
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/google',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Tests: GET /api/connect/google/callback ─────────────────────────────────

describe('GET /api/connect/google/callback', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.FRONTEND_URL = FRONTEND_URL;
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3001/api/connect/google/callback';
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
    delete process.env.FRONTEND_URL;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
    delete process.env.GOOGLE_REDIRECT_URI;
  });

  it('returns 400 when code is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/google/callback',
      headers: { cookie: signedStateCookie('user-1') },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when state cookie is absent', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/google/callback?code=some-code',
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when state cookie is tampered', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/google/callback?code=some-code',
      headers: { cookie: 'oauth_state=tampered' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('happy path: upserts GoogleOauthToken and redirects to frontend', async () => {
    mockGetToken.mockResolvedValue({
      tokens: {
        access_token: 'ya29.access-token',
        refresh_token: 'refresh-token',
        id_token: 'id-token-jwt',
        expiry_date: Date.now() + 3_600_000,
      },
    });
    mockVerifyIdToken.mockResolvedValue({
      getPayload: () => ({
        email: 'user@gmail.com',
        sub: 'google-sub-123',
        email_verified: true,
      }),
    });
    mockPrisma.googleOauthToken.upsert.mockResolvedValue({});

    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/google/callback?code=valid-code',
      headers: { cookie: signedStateCookie('user-1') },
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(`${FRONTEND_URL}/onboarding?google=connected`);
    expect(mockPrisma.googleOauthToken.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { user_id: 'user-1' },
        create: expect.objectContaining({ google_email: 'user@gmail.com', user_id: 'user-1' }),
      }),
    );
  });

  it('returns 400 when refresh_token is missing from Google response', async () => {
    mockGetToken.mockResolvedValue({
      tokens: {
        access_token: 'ya29.access-token',
        // no refresh_token — happens if user already authorized without prompt:consent
        id_token: 'id-token-jwt',
        expiry_date: Date.now() + 3_600_000,
      },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/google/callback?code=code-no-refresh',
      headers: { cookie: signedStateCookie('user-1') },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when Google token exchange throws', async () => {
    mockGetToken.mockRejectedValue(new Error('invalid_grant'));

    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/google/callback?code=bad-code',
      headers: { cookie: signedStateCookie('user-1') },
    });
    expect(res.statusCode).toBe(400);
  });

  it('redirects with error when Google sends error param', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/connect/google/callback?error=access_denied',
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('google=error');
  });
});

// ─── Tests: DELETE /api/connect/google ───────────────────────────────────────

describe('DELETE /api/connect/google', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  it('returns 401 without a JWT', async () => {
    const res = await app.inject({ method: 'DELETE', url: '/api/connect/google' });
    expect(res.statusCode).toBe(401);
  });

  it('returns 204 on success and deletes with user_id filter', async () => {
    mockPrisma.googleOauthToken.deleteMany.mockResolvedValue({ count: 1 });
    const token = await validJwt('user-1');

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/connect/google',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(204);
    expect(mockPrisma.googleOauthToken.deleteMany).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
    });
  });

  it('returns 204 even if no token existed (idempotent)', async () => {
    mockPrisma.googleOauthToken.deleteMany.mockResolvedValue({ count: 0 });
    const token = await validJwt('user-1');

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/connect/google',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(204);
  });
});

// ─── Tests: getValidGoogleAccessToken ────────────────────────────────────────

describe('getValidGoogleAccessToken', () => {
  beforeEach(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });

  it('returns null when no token row exists', async () => {
    const { getValidGoogleAccessToken } = await import('../../lib/google.js');
    mockPrisma.googleOauthToken.findUnique.mockResolvedValue(null);

    const result = await getValidGoogleAccessToken('user-1', mockPrisma as never);
    expect(result).toBeNull();
  });

  it('returns decrypted access token when not near expiry', async () => {
    const { getValidGoogleAccessToken } = await import('../../lib/google.js');
    mockPrisma.googleOauthToken.findUnique.mockResolvedValue({
      user_id: 'user-1',
      access_token_encrypted: Buffer.from('enc:ya29.valid-token'),
      refresh_token_encrypted: Buffer.from('enc:refresh-token'),
      token_expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 min from now
    });

    const result = await getValidGoogleAccessToken('user-1', mockPrisma as never);
    expect(result).toBe('ya29.valid-token');
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it('refreshes and updates DB when token is near expiry', async () => {
    const { getValidGoogleAccessToken } = await import('../../lib/google.js');
    mockPrisma.googleOauthToken.findUnique.mockResolvedValue({
      user_id: 'user-1',
      access_token_encrypted: Buffer.from('enc:old-access-token'),
      refresh_token_encrypted: Buffer.from('enc:refresh-token'),
      token_expires_at: new Date(Date.now() + 2 * 60 * 1000), // 2 min — within 5-min buffer
    });
    mockRefreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: 'ya29.new-token',
        expiry_date: Date.now() + 3_600_000,
      },
    });
    mockPrisma.googleOauthToken.update.mockResolvedValue({});

    const result = await getValidGoogleAccessToken('user-1', mockPrisma as never);

    expect(result).toBe('ya29.new-token');
    expect(mockPrisma.googleOauthToken.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { user_id: 'user-1' } }),
    );
  });

  it('deletes token row and returns null when refresh fails', async () => {
    const { getValidGoogleAccessToken } = await import('../../lib/google.js');
    mockPrisma.googleOauthToken.findUnique.mockResolvedValue({
      user_id: 'user-1',
      access_token_encrypted: Buffer.from('enc:old-access-token'),
      refresh_token_encrypted: Buffer.from('enc:refresh-token'),
      token_expires_at: new Date(Date.now() + 1 * 60 * 1000), // 1 min — expired
    });
    mockRefreshAccessToken.mockRejectedValue(new Error('invalid_grant'));
    mockPrisma.googleOauthToken.delete.mockResolvedValue({});

    const result = await getValidGoogleAccessToken('user-1', mockPrisma as never);

    expect(result).toBeNull();
    expect(mockPrisma.googleOauthToken.delete).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
    });
  });
});
