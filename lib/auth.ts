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
import { parseCookies, validateCsrf } from './request-security.ts';

export type Session = {
  sessionId?: string;
  userId: number;
  email: string;
  teamId: string;
  role: string;            // owner | admin | member
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
        SELECT t.*, u.email FROM api_tokens t JOIN users u ON u.id = t.user_id
        WHERE t.token_hash = ?
      `).get(sha256(raw)) as any;
      if (!tok) return null;
      db.prepare('UPDATE api_tokens SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), tok.id);
      const role = roleInTeam(tok.user_id, tok.team_id) || 'member';
      return {
        userId: tok.user_id, email: tok.email, teamId: tok.team_id, role,
        via: 'token', abilities: String(tok.abilities || 'read').split(',').map((s: string) => s.trim()),
      };
    }

    // 2. Session cookie
    const cookieHeader = req.headers?.cookie;
    if (!cookieHeader) return null;
    const sessionId = parseCookies(cookieHeader).session;
    if (!sessionId) return null;

    const row = db.prepare(`
      SELECT s.id, s.user_id, s.expires_at, u.email
      FROM sessions s JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).get(sessionId) as any;
    if (!row) return null;
    if (!validateCsrf(req, row.id)) return null;
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
      sessionId: row.id,
      via: 'session', abilities: ['read', 'write', 'deploy'],
    };
  } catch {
    return null;
  }
}

// ── Users ────────────────────────────────────────────────────────────────────

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
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

export function createUserWithPasswordHash(db: any, email: string, passwordHash: string): number {
  const r = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, passwordHash);
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

export function isAppInitialized(): boolean {
  try {
    const result = getDb().prepare('SELECT COUNT(*) as count FROM users').get() as { count: number } | undefined;
    return (result?.count ?? 0) > 0;
  } catch {
    return false;
  }
}
