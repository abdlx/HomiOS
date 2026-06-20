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

export default withAuth(async (req, res, session) => {
  const db = getDb();

  if (req.method === 'GET') {
    const tokens = db.prepare(`
      SELECT id, name, abilities, last_used_at, created_at
      FROM api_tokens WHERE user_id = ? AND team_id = ? ORDER BY created_at DESC
    `).all(session.userId, session.teamId);
    return res.json(tokens);
  }

  if (req.method === 'POST') {
    const { name, abilities = ['read'] } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    const clean = (Array.isArray(abilities) ? abilities : [abilities])
      .filter((a: string) => VALID_ABILITIES.includes(a));
    if (!clean.length) return res.status(400).json({ error: 'At least one valid ability required' });

    const raw = `of_${crypto.randomBytes(32).toString('hex')}`;
    const id = crypto.randomUUID();
    withTransaction((tx) => {
      tx.prepare('INSERT INTO api_tokens (id, user_id, team_id, name, token_hash, abilities) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, session.userId, session.teamId, String(name), sha256(raw), clean.join(','));
    });
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'token.created', meta: { name, abilities: clean } });
    return res.status(201).json({ ok: true, id, token: raw }); // raw shown once, only hash stored
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
