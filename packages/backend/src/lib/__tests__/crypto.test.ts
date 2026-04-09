import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { encryptToken, decryptToken } from '../crypto.js';

const KEY_A = 'a'.repeat(64); // 32 bytes as hex
const KEY_B = 'b'.repeat(64);

function withEnv(vars: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = vars[k];
    }
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe('encryptToken / decryptToken', () => {
  it('round-trips plaintext correctly', () => {
    withEnv({ ENCRYPTION_KEY_CURRENT: KEY_A, ENCRYPTION_KEY_PREVIOUS: undefined }, () => {
      const plaintext = 'super-secret-oauth-token';
      const ciphertext = encryptToken(plaintext);
      const result = decryptToken(ciphertext);
      expect(result).toBe(plaintext);
    });
  });

  it('output contains the v1 version prefix', () => {
    withEnv({ ENCRYPTION_KEY_CURRENT: KEY_A, ENCRYPTION_KEY_PREVIOUS: undefined }, () => {
      const ciphertext = encryptToken('any-value');
      expect(ciphertext.startsWith('v1:')).toBe(true);
    });
  });

  it('output has four colon-separated parts (version:iv:tag:ciphertext)', () => {
    withEnv({ ENCRYPTION_KEY_CURRENT: KEY_A, ENCRYPTION_KEY_PREVIOUS: undefined }, () => {
      const parts = encryptToken('any-value').split(':');
      expect(parts).toHaveLength(4);
    });
  });

  it('decryption with a wrong key throws', () => {
    let ciphertext!: string;
    withEnv({ ENCRYPTION_KEY_CURRENT: KEY_A, ENCRYPTION_KEY_PREVIOUS: undefined }, () => {
      ciphertext = encryptToken('secret');
    });

    withEnv({ ENCRYPTION_KEY_CURRENT: KEY_B, ENCRYPTION_KEY_PREVIOUS: undefined }, () => {
      expect(() => decryptToken(ciphertext)).toThrow();
    });
  });

  it('tampered ciphertext throws', () => {
    withEnv({ ENCRYPTION_KEY_CURRENT: KEY_A, ENCRYPTION_KEY_PREVIOUS: undefined }, () => {
      const [version, iv, tag, enc] = encryptToken('secret').split(':');
      const tampered = `${version}:${iv}:${tag}:${Buffer.from('tampered').toString('base64')}`;
      expect(() => decryptToken(tampered)).toThrow();
    });
  });

  it('decrypts values encrypted with the previous key', () => {
    let ciphertext!: string;
    withEnv({ ENCRYPTION_KEY_CURRENT: KEY_A, ENCRYPTION_KEY_PREVIOUS: undefined }, () => {
      ciphertext = encryptToken('rotated-secret');
    });

    // KEY_A is now the previous key; KEY_B is the new current
    withEnv({ ENCRYPTION_KEY_CURRENT: KEY_B, ENCRYPTION_KEY_PREVIOUS: KEY_A }, () => {
      expect(decryptToken(ciphertext)).toBe('rotated-secret');
    });
  });

  it('throws when no keys are configured', () => {
    withEnv({ ENCRYPTION_KEY_CURRENT: undefined, ENCRYPTION_KEY_PREVIOUS: undefined }, () => {
      expect(() => encryptToken('x')).toThrow('ENCRYPTION_KEY_CURRENT is not set');
    });
  });
});
