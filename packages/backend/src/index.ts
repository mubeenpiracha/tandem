import 'dotenv/config';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import { PrismaClient } from '@prisma/client';
import { authRoutes } from './routes/auth.js';
import { connectRoutes } from './routes/connect.js';

// ─── Startup validation ───────────────────────────────────────────────────────

function validateEnv(): void {
  const required = ['DATABASE_URL', 'JWT_SECRET'];
  for (const key of required) {
    if (!process.env[key]) throw new Error(`Missing required env var: ${key}`);
  }
  const jwtSecret = process.env.JWT_SECRET!;
  if (jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
}

// ─── App factory (exported for testing) ──────────────────────────────────────

export async function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  });

  await app.register(fastifyCors, {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
    credentials: true,
  });

  await app.register(fastifyCookie, { secret: process.env.JWT_SECRET });

  await app.register(fastifyRateLimit, {
    max: 60,
    timeWindow: '1 minute',
    keyGenerator: (req) => (req.headers['x-forwarded-for'] as string) ?? req.ip,
  });

  const prisma = new PrismaClient();

  await app.register(authRoutes, { prefix: '/api/auth', prisma });
  await app.register(connectRoutes, { prefix: '/api/connect', prisma });

  app.get('/health', async () => ({ status: 'ok' }));

  return app;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function start(): Promise<void> {
  validateEnv();
  const app = await buildApp();
  const port = parseInt(process.env.PORT ?? '3001', 10);
  await app.listen({ port, host: '0.0.0.0' });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
