import crypto from 'crypto';
import { hmacSha256, safeEqual } from './crypto.ts';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_COOKIE = 'openfinder_csrf';
const CSRF_HEADER = 'x-openfinder-csrf';

type RateLimitOptions = {
  windowMs: number;
  max: number;
};

const buckets = new Map<string, { count: number; resetAt: number }>();

export function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(cookieHeader || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

export function csrfTokenForSession(sessionId: string): string {
  return hmacSha256(`csrf:${sessionId}`);
}

export function shouldUseSecureCookies(req?: any): boolean {
  const override = String(process.env.OPENFINDER_SECURE_COOKIES || '').toLowerCase();
  if (override === 'true') return true;
  if (override === 'false') return false;

  const proto = String(req?.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (proto) return proto === 'https';

  return Boolean(req?.socket?.encrypted || req?.connection?.encrypted);
}

export function buildCsrfCookie(sessionId: string, req?: any): string {
  const secure = shouldUseSecureCookies(req) ? '; Secure' : '';
  return `${CSRF_COOKIE}=${csrfTokenForSession(sessionId)}; Path=/; SameSite=Lax; Max-Age=2592000${secure}`;
}

export function isMutatingMethod(method: string | undefined): boolean {
  return MUTATING_METHODS.has(String(method || 'GET').toUpperCase());
}

export function isBearerRequest(req: any): boolean {
  return String(req.headers?.authorization || '').startsWith('Bearer ');
}

function originMatches(req: any): boolean {
  const origin = req.headers?.origin;
  const referer = req.headers?.referer;
  if (!origin && !referer) return true;
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  const proto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim() || 'http';
  const expected = `${proto}://${host}`;
  try {
    const value = new URL(String(origin || referer));
    return value.origin === expected || value.host === host;
  } catch {
    return false;
  }
}

export function validateCsrf(req: any, sessionId: string): boolean {
  if (!isMutatingMethod(req.method) || isBearerRequest(req)) return true;
  if (!originMatches(req)) return false;
  const cookies = parseCookies(req.headers?.cookie);
  const cookieToken = cookies[CSRF_COOKIE];
  const headerToken = String(req.headers?.[CSRF_HEADER] || '');
  const expected = csrfTokenForSession(sessionId);
  return !!cookieToken && !!headerToken && safeEqual(cookieToken, expected) && safeEqual(headerToken, expected);
}

export function clientIp(req: any): string {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

export function rateLimitKey(req: any, bucket: string): string {
  return `${bucket}:${clientIp(req)}`;
}

export function hitRateLimit(key: string, options: RateLimitOptions): { limited: boolean; retryAfter: number } {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { limited: false, retryAfter: options.windowMs };
  }
  current.count += 1;
  return { limited: current.count > options.max, retryAfter: Math.max(0, current.resetAt - now) };
}

export function timingSafeRandomId(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}
