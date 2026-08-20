import crypto from 'crypto';
import { hmacSha256, safeEqual } from './crypto.ts';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const CSRF_COOKIE = 'homios_csrf';
const CSRF_HEADER = 'x-homios-csrf';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  /** Read the current state without counting this call as a hit. */
  peek?: boolean;
};

const buckets = new Map<string, { count: number; resetAt: number }>();
const MAX_BUCKETS = Number(process.env.RATE_LIMIT_MAX_BUCKETS || 50_000);
let lastSweep = 0;

/**
 * Drop expired buckets. Without this the map grows one entry per distinct key
 * forever — an attacker rotating source IPs turns the rate limiter itself into a
 * memory-exhaustion DoS.
 */
function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
  // Hard ceiling: if we are still over budget, evict oldest-expiring first.
  if (buckets.size > MAX_BUCKETS) {
    const sorted = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
    for (const [key] of sorted.slice(0, buckets.size - MAX_BUCKETS)) buckets.delete(key);
  }
}

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
  const override = String(process.env.HOMIOS_SECURE_COOKIES || '').toLowerCase();
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

/**
 * Fail CLOSED when neither Origin nor Referer is present.
 *
 * This used to return true, which handed away the strongest CSRF signal we have:
 * every browser attaches Origin to a cross-site mutating request, so "no Origin"
 * on a cookie-authenticated POST is not a normal browser. Non-browser clients that
 * legitimately send neither should authenticate with a Bearer token, which skips
 * this check entirely (see validateCsrf).
 */
function originMatches(req: any): boolean {
  const origin = req.headers?.origin;
  const referer = req.headers?.referer;
  if (!origin && !referer) return false;
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(',')[0].trim();
  if (!host) return false;
  try {
    const value = new URL(String(origin || referer));
    return value.host === host;
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

/**
 * `limited` follows rate-limit semantics: `max` requests are allowed through, and the
 * (max+1)-th is blocked. Callers that want lockout semantics ("after N failures, stop")
 * should read `count` and compare it themselves — see accountLocked() in auth/login.
 */
export function hitRateLimit(
  key: string,
  options: RateLimitOptions
): { limited: boolean; retryAfter: number; count: number } {
  const now = Date.now();
  sweep(now);

  const current = buckets.get(key);
  if (!current || now >= current.resetAt) {
    if (options.peek) return { limited: false, retryAfter: 0, count: 0 };
    buckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return { limited: false, retryAfter: Math.ceil(options.windowMs / 1000), count: 1 };
  }

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
  if (options.peek) {
    return { limited: current.count > options.max, retryAfter, count: current.count };
  }

  current.count += 1;
  return { limited: current.count > options.max, retryAfter, count: current.count };
}

/** Test hook — clears all buckets so suites don't leak limits into each other. */
export function resetRateLimits(): void {
  buckets.clear();
  lastSweep = 0;
}

export function timingSafeRandomId(bytes = 16): string {
  return crypto.randomBytes(bytes).toString('hex');
}
