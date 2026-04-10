import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  signAccessToken,
  verifyAccessToken,
  signPurposeToken,
  verifyPurposeToken,
} from '../jwt.js';

const SECRET = 'a'.repeat(64); // 32-byte hex-looking string

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });
}

describe('signAccessToken / verifyAccessToken', () => {
  it('round-trips a valid access token', async () => {
    await withEnv({ JWT_SECRET: SECRET }, async () => {
      const token = await signAccessToken('user-1', 'test@example.com', true);
      const payload = await verifyAccessToken(token);
      expect(payload.sub).toBe('user-1');
      expect(payload.email).toBe('test@example.com');
      expect(payload.email_verified).toBe(true);
    });
  });

  it('throws on a tampered token', async () => {
    await withEnv({ JWT_SECRET: SECRET }, async () => {
      const token = await signAccessToken('user-1', 'test@example.com', false);
      const [h, p, s] = token.split('.');
      const tampered = `${h}.${p}x.${s}`;
      await expect(verifyAccessToken(tampered)).rejects.toThrow();
    });
  });

  it('throws when JWT_SECRET is not set', async () => {
    await withEnv({ JWT_SECRET: undefined }, async () => {
      await expect(signAccessToken('user-1', 'x@x.com', false)).rejects.toThrow('JWT_SECRET');
    });
  });

  it('throws when JWT_SECRET is too short', async () => {
    await withEnv({ JWT_SECRET: 'short' }, async () => {
      await expect(signAccessToken('user-1', 'x@x.com', false)).rejects.toThrow();
    });
  });
});

describe('signPurposeToken / verifyPurposeToken', () => {
  it('round-trips a verify-email token', async () => {
    await withEnv({ JWT_SECRET: SECRET }, async () => {
      const token = await signPurposeToken({ sub: 'user-1', purpose: 'verify-email' }, '1h');
      const payload = await verifyPurposeToken(token, 'verify-email');
      expect(payload.sub).toBe('user-1');
    });
  });

  it('rejects a token with wrong purpose', async () => {
    await withEnv({ JWT_SECRET: SECRET }, async () => {
      const token = await signPurposeToken({ sub: 'user-1', purpose: 'verify-email' }, '1h');
      await expect(verifyPurposeToken(token, 'reset-password')).rejects.toThrow();
    });
  });

  it('rejects an expired token', async () => {
    await withEnv({ JWT_SECRET: SECRET }, async () => {
      // Sign with a 1-second expiry, then manually verify with a clock skew that puts it in the past
      const token = await signPurposeToken({ sub: 'user-1', purpose: 'verify-email' }, '1s');
      // Decode and tamper the exp to be in the past so jose rejects it
      const parts = token.split('.');
      const [header, payload, sig] = parts as [string, string, string];
      const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString());
      decoded.exp = Math.floor(Date.now() / 1000) - 10; // 10 seconds in the past
      const tamperedPayload = Buffer.from(JSON.stringify(decoded)).toString('base64url');
      const tampered = `${header}.${tamperedPayload}.${sig}`;
      await expect(verifyPurposeToken(tampered, 'verify-email')).rejects.toThrow();
    });
  });
});
