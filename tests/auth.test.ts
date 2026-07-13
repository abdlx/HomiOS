/**
 * The authorization matrix.
 *
 * Every test here corresponds to a finding from the security audit. If one of these
 * goes red, a real vulnerability has been reintroduced — they are not style checks.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { mockReq, mockRes } from './helpers.ts';

import { getDb, withTransaction } from '../lib/db.ts';
import { createSession, createUserWithPasswordHash, hashPassword, getSession, hasAnyUser } from '../lib/auth.ts';
import { withAuth } from '../lib/api-auth.ts';
import { hitRateLimit, resetRateLimits, validateCsrf } from '../lib/request-security.ts';

import setupHandler from '../pages/api/auth/setup.ts';
import loginHandler from '../pages/api/auth/login.ts';

let adminId: number;
let memberId: number;
let adminSession: string;
let memberSession: string;

beforeAll(async () => {
  const db = getDb();

  // The admin — as /api/auth/setup would create them.
  adminId = withTransaction((tx) =>
    createUserWithPasswordHash(tx, 'admin@openfinder.test', '' , { isAdmin: true })
  );
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(await hashPassword('correct-horse-battery'), adminId);

  // An invited member — as /api/auth/register would create them.
  memberId = withTransaction((tx) =>
    createUserWithPasswordHash(tx, 'member@openfinder.test', '', { isAdmin: false })
  );
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .run(await hashPassword('correct-horse-battery'), memberId);

  adminSession = createSession(adminId);
  memberSession = createSession(memberId);
});

beforeEach(() => resetRateLimits());

describe('C2 — instance admin is distinct from team role', () => {
  it('gives every user the team role "owner" (the reason minRole could never gate)', async () => {
    const session = await getSession(mockReq({ sessionId: memberSession }));
    // This is the trap: the member IS an owner — of their own personal team.
    expect(session!.role).toBe('owner');
  });

  it('does NOT give a non-admin user instance-admin power', async () => {
    const session = await getSession(mockReq({ sessionId: memberSession }));
    expect(session!.isAdmin).toBe(false);
  });

  it('adminOnly rejects a member with 403', async () => {
    const handler = withAuth(async (_req, res) => res.status(200).json({ ok: true }), { adminOnly: true });
    const res = mockRes();
    await handler(mockReq({ sessionId: memberSession }), res);

    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/administrator/i);
  });

  it('adminOnly admits an instance admin', async () => {
    const handler = withAuth(async (_req, res) => res.status(200).json({ ok: true }), { adminOnly: true });
    const res = mockRes();
    await handler(mockReq({ sessionId: adminSession }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('rejects an anonymous caller with 401', async () => {
    const handler = withAuth(async (_req, res) => res.status(200).json({ ok: true }), { adminOnly: true });
    const res = mockRes();
    await handler(mockReq(), res);

    expect(res.statusCode).toBe(401);
  });
});

describe('C1 — /api/auth/setup cannot create an account once users exist', () => {
  it('refuses when users already exist, even with the legacy `initialized` row absent', async () => {
    const db = getDb();
    // Reproduce the exploitable state exactly: users exist (created by the env-admin
    // login / invite flow), but nothing ever wrote initialized.setup_complete.
    db.prepare('DELETE FROM initialized').run();
    expect(db.prepare("SELECT 1 FROM initialized WHERE key = 'setup_complete'").get()).toBeUndefined();
    expect(hasAnyUser(db)).toBe(true);

    const res = mockRes();
    await setupHandler(
      mockReq({ method: 'POST', body: { email: 'attacker@evil.test', password: 'hunter2hunter2' } }),
      res
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('Already initialized');
    // And crucially: no session was minted, no account created.
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(db.prepare('SELECT 1 FROM users WHERE email = ?').get('attacker@evil.test')).toBeUndefined();
  });
});

describe('C3 — rate limiting', () => {
  it('limits after max hits and reports Retry-After in seconds', () => {
    const opts = { windowMs: 60_000, max: 3 };
    expect(hitRateLimit('k', opts).limited).toBe(false);
    expect(hitRateLimit('k', opts).limited).toBe(false);
    expect(hitRateLimit('k', opts).limited).toBe(false);

    const fourth = hitRateLimit('k', opts);
    expect(fourth.limited).toBe(true);
    expect(fourth.retryAfter).toBeGreaterThan(0);
    expect(fourth.retryAfter).toBeLessThanOrEqual(60);
  });

  it('peek does not consume budget', () => {
    const opts = { windowMs: 60_000, max: 2 };
    hitRateLimit('p', opts);
    hitRateLimit('p', { ...opts, peek: true });
    hitRateLimit('p', { ...opts, peek: true });
    expect(hitRateLimit('p', opts).limited).toBe(false); // only 2 real hits so far
    expect(hitRateLimit('p', opts).limited).toBe(true);
  });

  it('locks an account out after repeated bad passwords', async () => {
    for (let i = 0; i < 10; i++) {
      const res = mockRes();
      await loginHandler(
        mockReq({ method: 'POST', body: { email: 'member@openfinder.test', password: 'wrong' } }),
        res
      );
      expect(res.statusCode).toBe(401);
    }

    // The 11th is refused outright — and stays refused even with the RIGHT password,
    // which is what makes the 6-digit TOTP space non-brute-forceable.
    const res = mockRes();
    await loginHandler(
      mockReq({ method: 'POST', body: { email: 'member@openfinder.test', password: 'correct-horse-battery' } }),
      res
    );
    expect(res.statusCode).toBe(429);
  });
});

describe('login', () => {
  it('accepts valid credentials and sets session + csrf cookies', async () => {
    const res = mockRes();
    await loginHandler(
      mockReq({ method: 'POST', body: { email: 'admin@openfinder.test', password: 'correct-horse-battery' } }),
      res
    );

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const cookies = res.headers['set-cookie'] as string[];
    expect(cookies.some((c) => c.startsWith('session=') && c.includes('HttpOnly'))).toBe(true);
    expect(cookies.some((c) => c.startsWith('openfinder_csrf='))).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const res = mockRes();
    await loginHandler(
      mockReq({ method: 'POST', body: { email: 'admin@openfinder.test', password: 'nope' } }),
      res
    );
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Invalid credentials');
  });

  it('does not leak whether an account exists', async () => {
    const unknown = mockRes();
    await loginHandler(
      mockReq({ method: 'POST', body: { email: 'ghost@openfinder.test', password: 'nope' } }),
      unknown
    );
    const known = mockRes();
    await loginHandler(
      mockReq({ method: 'POST', body: { email: 'admin@openfinder.test', password: 'nope' } }),
      known
    );

    expect(unknown.statusCode).toBe(known.statusCode);
    expect(unknown.body).toEqual(known.body);
  });

  it('has no ADMIN_USERNAME/ADMIN_PASSWORD backdoor', async () => {
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'password';
    try {
      const res = mockRes();
      await loginHandler(mockReq({ method: 'POST', body: { email: 'admin', password: 'password' } }), res);
      expect(res.statusCode).not.toBe(200);
    } finally {
      delete process.env.ADMIN_USERNAME;
      delete process.env.ADMIN_PASSWORD;
    }
  });
});

describe('M3 — CSRF fails closed', () => {
  it('rejects a mutating cookie request with no Origin and no Referer', () => {
    const req = mockReq({ method: 'POST', sessionId: adminSession, origin: null });
    expect(validateCsrf(req, adminSession)).toBe(false);
  });

  it('rejects a mutating request from a foreign origin', () => {
    const req = mockReq({ method: 'POST', sessionId: adminSession, origin: 'https://evil.test' });
    expect(validateCsrf(req, adminSession)).toBe(false);
  });

  it('rejects a mutating request whose CSRF header is missing', () => {
    const req = mockReq({ method: 'POST', sessionId: adminSession });
    delete req.headers['x-openfinder-csrf'];
    expect(validateCsrf(req, adminSession)).toBe(false);
  });

  it('accepts a same-origin request carrying the matching double-submit token', () => {
    const req = mockReq({ method: 'POST', sessionId: adminSession });
    expect(validateCsrf(req, adminSession)).toBe(true);
  });

  it('does not require CSRF for Bearer-token clients', () => {
    const req = mockReq({ method: 'POST', bearer: 'of_whatever', origin: null });
    expect(validateCsrf(req, adminSession)).toBe(true);
  });
});
