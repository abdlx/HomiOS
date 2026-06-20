/**
 * /api/security/keys — SSH private keys (encrypted at rest)
 * GET    — list keys (never the key material)
 * POST   — create { name, description?, privateKey } or { name, generate: true }
 * DELETE — remove { id } (fails if a server still uses it)
 */
import crypto from 'crypto';
import { getDb } from '../../../../lib/db.ts';
import { withAuth } from '../../../../lib/api-auth.ts';
import { encryptSecret } from '../../../../lib/crypto.ts';
import { logAudit } from '../../../../lib/audit.ts';
import { withTransaction } from '../../../../lib/db.ts';

export default withAuth(async (req, res, session) => {
  const db = getDb();

  if (req.method === 'GET') {
    const keys = db.prepare(`
      SELECT k.id, k.name, k.description, k.created_at,
        (SELECT COUNT(*) FROM servers s WHERE s.private_key_id = k.id) AS server_count
      FROM private_keys k WHERE k.team_id = ? ORDER BY k.created_at DESC
    `).all(session.teamId);
    return res.json(keys);
  }

  if (req.method === 'POST') {
    const { name, description = '', privateKey, generate } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });

    let material = privateKey;
    let publicKey: string | undefined;
    if (generate) {
      const pair = crypto.generateKeyPairSync('ed25519');
      material = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      // OpenSSH authorized_keys form for pasting onto servers
      const raw = pair.publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
      const keyBytes = raw.subarray(raw.length - 32);
      const sshBlob = Buffer.concat([
        Buffer.from([0, 0, 0, 11]), Buffer.from('ssh-ed25519'),
        Buffer.from([0, 0, 0, 32]), keyBytes,
      ]);
      publicKey = `ssh-ed25519 ${sshBlob.toString('base64')} openfinder`;
    }
    if (!material || !String(material).includes('PRIVATE KEY')) {
      return res.status(400).json({ error: 'privateKey must be a PEM private key (or pass generate: true)' });
    }

    const id = crypto.randomUUID();
    withTransaction((tx) => {
      tx.prepare('INSERT INTO private_keys (id, team_id, name, description, private_key_enc) VALUES (?, ?, ?, ?, ?)')
        .run(id, session.teamId, String(name), String(description), encryptSecret(String(material)));
    });
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'ssh_key.created', resourceId: id, meta: { name } });
    return res.status(201).json({ ok: true, id, publicKey });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    const inUse = db.prepare('SELECT COUNT(*) AS c FROM servers WHERE private_key_id = ?').get(String(id)) as any;
    if (inUse.c > 0) return res.status(400).json({ error: `Key is used by ${inUse.c} server(s)` });
    const r = withTransaction((tx) => tx.prepare('DELETE FROM private_keys WHERE id = ? AND team_id = ?').run(String(id), session.teamId));
    if (!r.changes) return res.status(404).json({ error: 'Key not found' });
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'ssh_key.deleted', resourceId: String(id) });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).end();
}, { ability: 'write', minRole: 'admin' });
