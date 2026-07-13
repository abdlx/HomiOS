/**
 * /api/tokens — personal API tokens (Sanctum-style).
 * GET    — list tokens for the current user (never the secret)
 * POST   — create { name, abilities: ['read','write','deploy'] } -> raw token shown ONCE
 * DELETE — revoke { id }
 */
import crypto from 'crypto';
import { getDb } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';
import { sha256 } from '../../../lib/crypto.ts';
import { logAudit } from '../../../lib/audit.ts';
import { withTransaction } from '../../../lib/db.ts';

const VALID_ABILITIES = ['read', 'write', 'deploy'];
const DEFAULT_TOKEN_TTL_DAYS = 90;
const MAX_TOKEN_TTL_DAYS = 365;

export default withAuth(async (req, res, session) => {
  const db = getDb();

  if (req.method === 'GET') {
    const tokens = db.prepare(`
      SELECT id, name, abilities, last_used_at, created_at, expires_at
      FROM api_tokens WHERE user_id = ? AND team_id = ? ORDER BY created_at DESC
    `).all(session.userId, session.teamId);
    return res.json(tokens);
  }

  if (req.method === 'POST') {
    const { name, abilities = ['read'], expiresInDays = DEFAULT_TOKEN_TTL_DAYS } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const clean = (Array.isArray(abilities) ? abilities : [abilities])
      .filter((a: string) => VALID_ABILITIES.includes(a));
    if (!clean.length) return res.status(400).json({ error: 'At least one valid ability required' });

    // Tokens used to live forever: one leaked token was a permanent credential with no
    // natural expiry to limit the blast radius. They now expire, capped at one year.
    const days = Number(expiresInDays);
    if (!Number.isFinite(days) || days < 1 || days > MAX_TOKEN_TTL_DAYS) {
      return res.status(400).json({ error: `expiresInDays must be between 1 and ${MAX_TOKEN_TTL_DAYS}` });
    }
    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();

    const raw = `of_${crypto.randomBytes(32).toString('hex')}`;
    const id = crypto.randomUUID();
    withTransaction((tx) => {
      tx.prepare(`
        INSERT INTO api_tokens (id, user_id, team_id, name, token_hash, abilities, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, session.userId, session.teamId, String(name), sha256(raw), clean.join(','), expiresAt);
    });
    logAudit({
      teamId: session.teamId, userId: session.userId, action: 'token.created',
      meta: { name, abilities: clean, expiresAt },
    });
    return res.status(201).json({ ok: true, id, token: raw, expiresAt }); // raw shown once, only hash stored
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    const r = withTransaction((tx) => tx.prepare('DELETE FROM api_tokens WHERE id = ? AND user_id = ?').run(String(id), session.userId));
    if (!r.changes) return res.status(404).json({ error: 'Token not found' });
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'token.revoked', meta: { id } });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).end();
}, { ability: 'write' });
