import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { env } from '../config/env';

/**
 * Envelope encryption for sensitive financial fields at rest.
 *
 * AES-256-GCM with a random IV per record and the ciphertext tagged, so
 * tampering is detected rather than silently decrypted. The key comes from the
 * environment; in a real deployment it would come from a KMS, and this module
 * is the single place that would need to change.
 */
const ALGORITHM = 'aes-256-gcm';

function keyBuffer(): Buffer {
  const key = Buffer.from(env.ENCRYPTION_KEY, 'base64');
  if (key.length === 32) return key;
  // Accept a raw 32-char string too, so local setup is forgiving.
  const raw = Buffer.from(env.ENCRYPTION_KEY, 'utf8');
  if (raw.length >= 32) return raw.subarray(0, 32);
  throw new Error('ENCRYPTION_KEY must decode to at least 32 bytes');
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, keyBuffer(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decrypt(payload: string): string {
  const [version, ivRaw, tagRaw, dataRaw] = payload.split('.');
  if (version !== 'v1' || !ivRaw || !tagRaw || !dataRaw) {
    throw new Error('Malformed ciphertext');
  }
  const decipher = createDecipheriv(ALGORITHM, keyBuffer(), Buffer.from(ivRaw, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataRaw, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

/** Constant-time comparison for signatures and confirmation phrases. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hmacSha256(payload: string | Buffer, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export function newId(): string {
  return randomUUID();
}

export function randomToken(bytes = 48): string {
  return randomBytes(bytes).toString('base64url');
}
