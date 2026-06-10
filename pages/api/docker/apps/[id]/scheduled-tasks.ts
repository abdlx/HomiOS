/**
 * /api/docker/apps/[id]/scheduled-tasks — cron tasks executed inside the container.
 * GET / POST { name, command, frequency } / PATCH { taskId, ...fields } / DELETE { taskId }
 */
import crypto from 'crypto';
import { getDb } from '../../../../../lib/db.ts';
import { withAuth } from '../../../../../lib/api-auth.ts';
import { getApp } from '../../../../../lib/docker-db.ts';
import { isValidCron } from '../../../../../lib/scheduler.ts';
import { logAudit } from '../../../../../lib/audit.ts';

export default withAuth(async (req, res, session) => {
  const appId = String(req.query.id);
  const app = getApp(appId);
  if (!app) return res.status(404).json({ error: 'App not found' });
  const db = getDb();

  if (req.method === 'GET') {
    return res.json(db.prepare('SELECT * FROM scheduled_tasks WHERE app_id = ? ORDER BY created_at DESC').all(appId));
  }

  if (req.method === 'POST') {
    const { name, command, frequency } = req.body || {};
    if (!name || !command || !frequency) return res.status(400).json({ error: 'name, command and frequency are required' });
    if (!isValidCron(String(frequency))) return res.status(400).json({ error: 'Invalid cron expression' });
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO scheduled_tasks (id, app_id, name, command, frequency) VALUES (?, ?, ?, ?, ?)')
      .run(id, appId, String(name), String(command), String(frequency));
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'task.created', resourceId: id, meta: { appId, name } });
    return res.status(201).json({ ok: true, id });
  }

  if (req.method === 'PATCH') {
    const { taskId, name, command, frequency, enabled } = req.body || {};
    if (frequency !== undefined && !isValidCron(String(frequency))) {
      return res.status(400).json({ error: 'Invalid cron expression' });
    }
    db.prepare(`
      UPDATE scheduled_tasks SET
        name = COALESCE(?, name), command = COALESCE(?, command),
        frequency = COALESCE(?, frequency), enabled = COALESCE(?, enabled)
      WHERE id = ? AND app_id = ?
    `).run(name ?? null, command ?? null, frequency ?? null,
           enabled === undefined ? null : (enabled ? 1 : 0), String(taskId), appId);
    return res.json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { taskId } = req.body || {};
    db.prepare('DELETE FROM scheduled_tasks WHERE id = ? AND app_id = ?').run(String(taskId), appId);
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
  return res.status(405).end();
}, { ability: 'write' });
