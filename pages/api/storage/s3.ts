/**
 * /api/storage/s3 — S3-compatible backup destinations.
 * GET / POST { name, bucket, region?, endpoint?, accessKey, secretKey } / DELETE { id }
 * POST { id, test: true } — verify the bucket is reachable
 */
import crypto from 'crypto';
import { getDb } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';
import { encryptSecret } from '../../../lib/crypto.ts';
import { testS3Storage } from '../../../lib/s3.ts';
import { logAudit } from '../../../lib/audit.ts';
import { withTransaction } from '../../../lib/db.ts';

export default withAuth(async (req, res, session) => {
  const db = getDb();

  if (req.method === 'GET') {
    const rows = db.prepare(`
      SELECT id, name, bucket, region, endpoint, created_at FROM s3_storages WHERE team_id = ? ORDER BY created_at DESC
    `).all(session.teamId);
    return res.json(rows);
  }

  if (req.method === 'POST') {
    const { id, test, name, bucket, region = 'us-east-1', endpoint = null, accessKey, secretKey } = req.body || {};

    if (test && id) {
      const owned = db.prepare('SELECT id FROM s3_storages WHERE id = ? AND team_id = ?').get(String(id), session.teamId);
      if (!owned) return res.status(404).json({ error: 'Storage not found' });
      return res.json(await testS3Storage(String(id)));
    }

    if (!name || !bucket || !accessKey || !secretKey) {
      return res.status(400).json({ error: 'name, bucket, accessKey and secretKey are required' });
    }
    const newId = crypto.randomUUID();
    withTransaction((tx) => {
      tx.prepare(`
        INSERT INTO s3_storages (id, team_id, name, endpoint, bucket, region, access_key_enc, secret_key_enc)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(newId, session.teamId, String(name), endpoint, String(bucket), String(region),
             encryptSecret(String(accessKey)), encryptSecret(String(secretKey)));
    });
    logAudit({ teamId: session.teamId, userId: session.userId, action: 's3.created', resourceId: newId, meta: { name, bucket } });
    return res.status(201).json({ ok: true, id: newId });
  }

  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    const r = withTransaction((tx) => tx.prepare('DELETE FROM s3_storages WHERE id = ? AND team_id = ?').run(String(id), session.teamId));
    if (!r.changes) return res.status(404).json({ error: 'Storage not found' });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).end();
}, { adminOnly: true, ability: 'write' });
