/**
 * Core authentication — sessions, API tokens, users.
 *
 * Single source of truth: the shared connection from lib/db.ts (this used to
 * open a new SQLite handle on EVERY request and relied on tables that only
 * existed if setup.ts had run first — the root cause of the broken
 * terminal/samba: auth silently failed, so everything auth-gated died).
 */
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getDb, withTransaction } from './db.ts';
import { sha256 } from './crypto.ts';
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  parseCookies,
  validateCsrf,
} from './request-security.ts';

export type Session = {
  sessionId?: string;
  userId: number;
  email: string;
  teamId: string;
  role: string;            // owner | admin | member — TEAM scope only
  isAdmin: boolean;        // INSTANCE scope: host-level power (filesystem, terminal, mounts)
  via: 'session' | 'token';
  abilities: string[];     // token-based requests only carry granted abilities
};

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ── Sessions ─────────────────────────────────────────────────────────────────

export function createSession(userId: number): string {
  const id = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
  getDb().prepare('INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(id, userId, expiresAt);
  return id;
}

export function destroySession(sessionId: string): void {
  getDb().prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

/** Primary team for a user (first owned, else first joined). */
export function primaryTeamFor(userId: number): { teamId: string; role: string } | null {
  const row = getDb().prepare(`
    SELECT team_id, role FROM team_users WHERE user_id = ?
    ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END LIMIT 1
  `).get(userId) as any;
  return row ? { teamId: row.team_id, role: row.role } : null;
}

export function roleInTeam(userId: number, teamId: string): string | null {
  const row = getDb().prepare('SELECT role FROM team_users WHERE user_id = ? AND team_id = ?').get(userId, teamId) as any;
  return row?.role ?? null;
}

/**
 * Resolve a request to a Session. Accepts either:
 *  - session cookie (browser)
 *  - Authorization: Bearer <token> (API)
 * Optional x-team-id header switches the active team if the user is a member.
 */
export async function getSession(req: any): Promise<Session | null> {
  try {
    const db = getDb();

    // 1. Bearer API token
    const authHeader: string | undefined = req.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const raw = authHeader.slice(7).trim();
      if (!raw) return null;
      const tok = db.prepare(`
        SELECT t.*, u.email, u.is_admin FROM api_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ?
      `).get(sha256(raw)) as any;
      if (!tok) return null;
      if (tok.expires_at && new Date(tok.expires_at) < new Date()) {
        db.prepare('DELETE FROM api_tokens WHERE id = ?').run(tok.id);
        return null;
      }
      db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), tok.id);
      const role = roleInTeam(tok.user_id, tok.team_id) || 'member';
      return {
        userId: tok.user_id, email: tok.email, teamId: tok.team_id, role,
        isAdmin: tok.is_admin === 1,
        via: 'token', abilities: String(tok.abilities || 'read').split(',').map((s: string) => s.trim()),
      };
    }

    // 2. Session cookie
    const cookieHeader = req.headers?.cookie;
    if (!cookieHeader) return null;
    const cookies = parseCookies(cookieHeader);
    // Prefer HomiOS's namespaced cookie. The old generic `session` name can
    // collide with another application or a stale parent-domain cookie.
    const sessionId = cookies[SESSION_COOKIE] || cookies[LEGACY_SESSION_COOKIE];
    if (!sessionId) return null;

    const row = db.prepare(`
      SELECT s.id, s.user_id, s.expires_at, u.email, u.is_admin
      FROM sessions s JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).get(sessionId) as any;
    if (!row) return null;
    if (!validateCsrf(req, row.id)) {
      (req as any).authFailure = 'csrf';
      return null;
    }
    if (new Date(row.expires_at) < new Date()) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(row.id);
      return null;
    }

    // Active team: x-team-id header (if member) else primary team.
    let teamId: string | null = null;
    let role: string | null = null;
    const wanted = req.headers?.['x-team-id'];
    if (wanted) {
      role = roleInTeam(row.user_id, String(wanted));
      if (role) teamId = String(wanted);
    }
    if (!teamId) {
      const primary = primaryTeamFor(row.user_id);
      if (primary) { teamId = primary.teamId; role = primary.role; }
    }
    if (!teamId) {
      // Legacy user predating teams — give them a personal team transparently.
      teamId = ensurePersonalTeam(row.user_id, row.email);
      role = 'owner';
    }

    return {
      userId: row.user_id, email: row.email, teamId, role: role || 'member',
      isAdmin: row.is_admin === 1,
      sessionId: row.id,
      via: 'session', abilities: ['read', 'write', 'deploy'],
    };
  } catch {
    return null;
  }
}

// ── Users ────────────────────────────────────────────────────────────────────

/** Cost 12 ≈ 250ms on modern hardware — a meaningful brake on offline cracking. */
const BCRYPT_COST = Number(process.env.BCRYPT_COST || 12);

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function findUserByEmail(email: string): any {
  return getDb().prepare('SELECT * FROM users WHERE email = ?').get(email);
}

/** Create a user plus their personal team. Returns the user id. */
export async function createUser(email: string, password: string): Promise<number> {
  const hash = await hashPassword(password);
  return withTransaction((db) => {
    return createUserWithPasswordHash(db, email, hash);
  });
}

export function createUserWithPasswordHash(
  db: any,
  email: string,
  passwordHash: string,
  opts: { isAdmin?: boolean } = {}
): number {
  const r = db.prepare('INSERT INTO users (email, password_hash, is_admin) VALUES (?, ?, ?)')
    .run(email, passwordHash, opts.isAdmin ? 1 : 0);
  const userId = Number(r.lastInsertRowid);
  ensurePersonalTeamInDb(db, userId, email);
  return userId;
}

export function ensurePersonalTeam(userId: number, email: string): string {
  return withTransaction((db) => ensurePersonalTeamInDb(db, userId, email));
}

function ensurePersonalTeamInDb(db: any, userId: number, email: string): string {
  const existing = db.prepare(`
    SELECT t.id FROM teams t JOIN team_users tu ON tu.team_id = t.id
    WHERE tu.user_id = ? AND t.personal_team = 1
  `).get(userId) as any;
  if (existing) return existing.id;

  const teamId = crypto.randomUUID();
  db.prepare('INSERT INTO teams (id, name, personal_team) VALUES (?, ?, 1)')
    .run(teamId, `${email.split('@')[0]}'s Team`);
  db.prepare('INSERT INTO team_users (team_id, user_id, role) VALUES (?, ?, ?)')
    .run(teamId, userId, 'owner');
  // Default notification settings rows (all disabled) — Coolify does this on team create.
  for (const ch of ['email', 'discord', 'slack', 'telegram', 'pushover', 'webhook']) {
    db.prepare('INSERT OR IGNORE INTO notification_settings (team_id, channel, enabled, config) VALUES (?, ?, 0, ?)')
      .run(teamId, ch, '{}');
  }
  return teamId;
}

/**
 * THE single definition of "this instance is set up": one or more users exist.
 *
 * There used to be a second, disagreeing definition — an `initialized.setup_complete`
 * row that only /api/auth/setup ever wrote. Any instance bootstrapped another way
 * (env-admin login, invite registration) therefore looked initialized to the UI while
 * leaving /api/auth/setup open to anonymous account creation. Both call sites now
 * resolve through hasAnyUser(), so they cannot drift apart again.
 */
export function hasAnyUser(db: any = getDb()): boolean {
  return !!db.prepare('SELECT 1 FROM users LIMIT 1').get();
}

export function isAppInitialized(): boolean {
  try {
    return hasAnyUser();
  } catch {
    // Fail closed: an unreadable DB must not be reported as "needs first-run setup".
    return true;
  }
}
