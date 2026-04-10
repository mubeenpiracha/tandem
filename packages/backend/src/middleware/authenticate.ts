import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../lib/jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      emailVerified: boolean;
    };
  }
}

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.code(401).send({ error: 'Missing or invalid Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verifyAccessToken(token);
    req.user = {
      id: payload.sub,
      email: payload.email,
      emailVerified: payload.email_verified,
    };
  } catch {
    return reply.code(401).send({ error: 'Invalid or expired token' });
  }
}
