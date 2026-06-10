/**
 * Secret encryption at rest (AES-256-GCM).
 *
 * Key resolution: APP_KEY env var (hex, 64 chars) wins; otherwise a key is
 * generated once and persisted to data/.app_key so restarts decrypt correctly.
 * Every encrypted value is self-describing: "enc:v1:<iv>:<tag>:<ciphertext>".
 * Plaintext values pass through decrypt() unchanged, so existing rows keep
 * working and get encrypted on next write.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEY_FILE = path.join(process.cwd(), 'data', '.app_key');
let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const env = process.env.APP_KEY;
  if (env && /^[0-9a-f]{64}$/i.test(env)) {
    cachedKey = Buffer.from(env, 'hex');
    return cachedKey;
  }
  const dir = path.dirname(KEY_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(KEY_FILE)) {
    const hex = fs.readFileSync(KEY_FILE, 'utf8').trim();
    if (/^[0-9a-f]{64}$/i.test(hex)) {
      cachedKey = Buffer.from(hex, 'hex');
      return cachedKey;
    }
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(KEY_FILE, key.toString('hex'), { mode: 0o600 });
  cachedKey = key;
  return key;
}

export function encryptSecret(plain: string): string {
  if (plain == null || plain === '') return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value) return '';
  if (!value.startsWith('enc:v1:')) return value; // legacy plaintext passthrough
  try {
    const [, , ivB64, tagB64, dataB64] = value.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** SHA-256 hex digest — used to store API tokens (never the raw token). */
export function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Constant-time string comparison for secrets/webhooks. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
