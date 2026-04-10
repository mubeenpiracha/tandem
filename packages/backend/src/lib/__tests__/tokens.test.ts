import { describe, it, expect } from 'vitest';
import { generateRefreshToken, hashToken } from '../tokens.js';

describe('generateRefreshToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateRefreshToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    expect(a).not.toBe(b);
  });
});

describe('hashToken', () => {
  it('returns a 64-character hex string (SHA-256)', () => {
    const hash = hashToken('some-token');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for the same input', () => {
    const h1 = hashToken('same-input');
    const h2 = hashToken('same-input');
    expect(h1).toBe(h2);
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});
