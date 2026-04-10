import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import { authRoutes } from '../auth.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../lib/email.js', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

// Mock google-auth-library via googleapis
vi.mock('google-auth-library', () => ({
  OAuth2Client: vi.fn().mockImplementation(() => ({
    verifyIdToken: vi.fn().mockResolvedValue({
      getPayload: () => ({
        sub: 'google-sub-123',
        email: 'google@example.com',
        name: 'Google User',
        email_verified: true,
      }),
    }),
  })),
}));

const JWT_SECRET = 'supersecretjwtsecretthatis32charslong!!';

// ─── Prisma mock ─────────────────────────────────────────────────────────────

const mockPrisma = {
  user: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  },
  refreshToken: {
    create: vi.fn(),
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
  },
  $transaction: vi.fn(),
};

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(fastifyCookie);
  await app.register(authRoutes, { prefix: '/api/auth', prisma: mockPrisma as never });
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  it('creates a user and returns an access token', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'user-1',
      email: 'new@example.com',
      display_name: 'New User',
      email_verified: false,
      timezone: 'UTC',
      google_id: null,
      password_hash: 'hashed',
      created_at: new Date(),
      updated_at: new Date(),
    });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'new@example.com', password: 'Password123!', name: 'New User' },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('user');
    expect(body.user.email).toBe('new@example.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('returns 409 if email already exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'existing@example.com', password: 'Password123!', name: 'Test' },
    });

    expect(res.statusCode).toBe(409);
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { email: 'not-an-email', password: 'short' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  it('returns 401 for unknown email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'nobody@example.com', password: 'Password123!' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    // A real argon2 hash of "correctpassword"
    const argon2 = await import('argon2');
    const hash = await argon2.hash('correctpassword');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      password_hash: hash,
      email_verified: true,
      display_name: 'User',
      timezone: 'UTC',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'user@example.com', password: 'wrongpassword' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for invalid body', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'not-an-email' },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  it('returns 401 without a token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/me' });
    expect(res.statusCode).toBe(401);
  });

  it('returns the current user with a valid token', async () => {
    const { signAccessToken } = await import('../../lib/jwt.js');
    const token = await signAccessToken('user-1', 'me@example.com', true);

    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'me@example.com',
      display_name: 'Me',
      email_verified: true,
      timezone: 'UTC',
      google_id: null,
      google_oauth_token: null,
      slack_user_tokens: [],
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.user.email).toBe('me@example.com');
    expect(body.user.googleConnected).toBe(false);
  });
});

describe('POST /api/auth/logout', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  it('returns 401 without a token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/logout' });
    expect(res.statusCode).toBe(401);
  });

  it('clears the refresh token cookie on logout', async () => {
    const { signAccessToken } = await import('../../lib/jwt.js');
    const token = await signAccessToken('user-1', 'me@example.com', true);
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        authorization: `Bearer ${token}`,
        cookie: 'refresh_token=somehash',
      },
    });

    expect(res.statusCode).toBe(200);
    // Cookie should be cleared
    const setCookie = res.headers['set-cookie'] as string;
    expect(setCookie).toMatch(/refresh_token=;|refresh_token=$/);
  });
});

describe('POST /api/auth/login — success', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  it('returns accessToken and sets refresh cookie for valid credentials', async () => {
    const argon2 = await import('argon2');
    const hash = await argon2.hash('correctpassword');
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      password_hash: hash,
      email_verified: true,
      display_name: 'User',
      timezone: 'UTC',
      google_oauth_token: null,
      slack_user_tokens: [],
    });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'user@example.com', password: 'correctpassword' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body.user.email).toBe('user@example.com');
    expect(res.headers['set-cookie']).toBeDefined();
    // Access token must NOT be in a cookie
    expect(String(res.headers['set-cookie'])).not.toContain('accessToken');
  });
});

describe('POST /api/auth/forgot-password', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  it('always returns 200 regardless of email existence', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      payload: { email: 'nonexistent@example.com' },
    });

    expect(res.statusCode).toBe(200);
  });
});

describe('POST /api/auth/refresh', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
  });

  it('returns 401 when no refresh token cookie is present', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/refresh' });
    expect(res.statusCode).toBe(401);
  });

  it('returns a new accessToken and rotates the refresh cookie', async () => {
    const { hashToken } = await import('../../lib/tokens.js');
    const rawToken = 'a'.repeat(64); // 32 bytes as hex
    const tokenHash = hashToken(rawToken);

    mockPrisma.refreshToken.findFirst.mockResolvedValue({
      token_hash: tokenHash,
      user_id: 'user-1',
      expires_at: new Date(Date.now() + 1000 * 60 * 60),
      user: {
        id: 'user-1',
        email: 'user@example.com',
        email_verified: true,
      },
    });
    // $transaction mock: execute the callback passed to it
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => {
      for (const op of ops) await op;
    });
    mockPrisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: { cookie: `refresh_token=${rawToken}` },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('accessToken');
    // New refresh cookie must be set
    expect(res.headers['set-cookie']).toBeDefined();
  });
});

describe('POST /api/auth/google', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.JWT_SECRET;
    delete process.env.GOOGLE_CLIENT_ID;
  });

  it('creates a new user when no account exists for the Google email', async () => {
    // No existing user by google_id or email
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      id: 'new-google-user',
      email: 'google@example.com',
      display_name: 'Google User',
      email_verified: true,
      timezone: 'UTC',
      google_id: 'google-sub-123',
      password_hash: null,
      google_oauth_token: null,
      slack_user_tokens: [],
    });
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { id_token: 'valid-google-id-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body.user.email).toBe('google@example.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('links Google account to existing email/password user', async () => {
    // No user by google_id, but found by email
    mockPrisma.user.findUnique
      .mockResolvedValueOnce(null) // findUserByGoogleId → null
      .mockResolvedValueOnce({     // findUserByEmail → existing user
        id: 'existing-user',
        email: 'google@example.com',
        display_name: 'Existing User',
        email_verified: false,
        timezone: 'UTC',
        google_id: null,
        password_hash: 'hashed',
        google_oauth_token: null,
        slack_user_tokens: [],
      })
      .mockResolvedValueOnce({     // findUserById after linkGoogleAccount
        id: 'existing-user',
        email: 'google@example.com',
        display_name: 'Existing User',
        email_verified: true,
        timezone: 'UTC',
        google_id: 'google-sub-123',
        password_hash: 'hashed',
        google_oauth_token: null,
        slack_user_tokens: [],
      });
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.refreshToken.create.mockResolvedValue({});

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { id_token: 'valid-google-id-token' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body.user.email).toBe('google@example.com');
    // linkGoogleAccount should have been called
    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'existing-user' },
        data: expect.objectContaining({ google_id: 'google-sub-123' }),
      }),
    );
  });

  it('returns 401 for an invalid Google ID token', async () => {
    const { OAuth2Client } = await import('google-auth-library');
    vi.mocked(OAuth2Client).mockImplementationOnce(() => ({
      verifyIdToken: vi.fn().mockRejectedValue(new Error('Invalid token')),
    }) as never);

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: { id_token: 'bad-token' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('returns 400 for missing id_token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/google',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });
});
