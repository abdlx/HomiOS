/**
 * /api/docker/apps/[id]/backup-schedule — cron-based volume backups.
 * GET / POST { frequency, retention?, s3StorageId? } / PATCH / DELETE
 */
import crypto from 'crypto';
import { getDb } from '../../../../../lib/db.ts';
import { withAuth } from '../../../../../lib/api-auth.ts';
import { getApp } from '../../../../../lib/docker-db.ts';
import { isValidCron } from '../../../../../lib/scheduler.ts';
import { logAudit } from '../../../../../lib/audit.ts';

export default withAuth(async (req, res, session) => {
  const appId = String(req.query.id);
  if (!getApp(appId)) return res.status(404).json({ error: 'App not found' });
  const db = getDb();

  if (req.method === 'GET') {
    return res.json(db.prepare('SELECT * FROM scheduled_backups WHERE app_id = ?').all(appId));
  }

  if (req.method === 'POST') {
    const { frequency, retention = 7, s3StorageId = null } = req.body || {};
    if (!isValidCron(String(frequency || ''))) return res.status(400).json({ error: 'Invalid cron expression' });
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO scheduled_backups (id, app_id, frequency, retention, s3_storage_id) VALUES (?, ?, ?, ?, ?)')
      .run(id, appId, String(frequency), Number(retention) || 7, s3StorageId);
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'backup_schedule.created', resourceId: id, meta: { appId } });
    return res.status(201).json({ ok: true, id });
  }

  if (req.method === 'PATCH') {
    const { scheduleId, frequency, retention, s3StorageId, enabled } = req.body || {};
    if (frequency !== undefined && !isValidCron(String(frequency))) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }
    db.prepare(`
      UPDATE scheduled_backups SET
        frequency = COALESCE(?, frequency), retention = COALESCE(?, retention),
        s3_storage_id = COALESCE(?, s3_storage_id), enabled = COALESCE(?, enabled)
      WHERE id = ? AND app_id = ?
    `).run(frequency ?? null, retention ?? null, s3StorageId ?? null,
           enabled === undefined ? null : (enabled ? 1 : 0), String(scheduleId), appId);
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { scheduleId } = req.body || {};
    db.prepare('DELETE FROM scheduled_backups WHERE id = ? AND app_id = ?').run(String(scheduleId), appId);
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
  return res.status(405).end();
}, { ability: 'write' });
