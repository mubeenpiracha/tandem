import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const VERSION = 'v1';

function parseHexKey(hexKey: string): Buffer {
  const buf = Buffer.from(hexKey, 'hex');
  if (buf.length !== 32) {
    throw new Error('Encryption key must be 32 bytes (64 hex characters)');
  }
  return buf;
}

export function encryptToken(plaintext: string): string {
  const hexKey = process.env.ENCRYPTION_KEY_CURRENT;
  if (!hexKey) throw new Error('ENCRYPTION_KEY_CURRENT is not set');

  const key = parseHexKey(hexKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptToken(ciphertext: string): string {
  const [version, ivB64, tagB64, encryptedB64] = ciphertext.split(':');

  if (version !== VERSION || !ivB64 || !tagB64 || !encryptedB64) {
    throw new Error(`Unknown or malformed ciphertext version: ${version}`);
  }

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const keysToTry: string[] = [];
  if (process.env.ENCRYPTION_KEY_CURRENT) keysToTry.push(process.env.ENCRYPTION_KEY_CURRENT);
  if (process.env.ENCRYPTION_KEY_PREVIOUS) keysToTry.push(process.env.ENCRYPTION_KEY_PREVIOUS);

  if (keysToTry.length === 0) throw new Error('No decryption keys configured');

  for (const hexKey of keysToTry) {
    try {
      const key = parseHexKey(hexKey);
      const decipher = createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString('utf8');
    } catch {
      // Try next key
    }
  }

  throw new Error('Decryption failed: no valid key found');
}
