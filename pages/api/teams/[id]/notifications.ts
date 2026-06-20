/**
 * /api/teams/[id]/notifications — per-channel notification settings.
 * GET                       — all channels with config
 * PATCH { channel, enabled?, config? }
 * POST  { channel }         — send a test notification through one channel
 */
import { getDb, withTransaction } from '../../../../lib/db.ts';
import { withAuth } from '../../../../lib/api-auth.ts';
import { roleInTeam } from '../../../../lib/auth.ts';
import { notifyTeam } from '../../../../lib/notify.ts';
import { logAudit } from '../../../../lib/audit.ts';

const CHANNELS = ['email', 'discord', 'slack', 'telegram', 'pushover', 'webhook'];

export default withAuth(async (req, res, session) => {
  const teamId = String(req.query.id);
  if (!roleInTeam(session.userId, teamId)) return res.status(404).json({ error: 'Team not found' });
  const db = getDb();

  if (req.method === 'GET') {
    const rows = db.prepare('SELECT channel, enabled, config FROM notification_settings WHERE team_id = ?').all(teamId);
    return res.json(rows.map((r: any) => ({ ...r, config: JSON.parse(r.config || '{}') })));
  }

  if (req.method === 'PATCH') {
    const { channel, enabled, config } = req.body || {};
    if (!CHANNELS.includes(channel)) return res.status(400).json({ error: 'Unknown channel' });
    const existing = db.prepare('SELECT config FROM notification_settings WHERE team_id = ? AND channel = ?').get(teamId, channel) as any;
    const mergedConfig = config !== undefined ? JSON.stringify(config) : (existing?.config ?? '{}');
    withTransaction((tx) => {
      tx.prepare(`
        INSERT INTO notification_settings (team_id, channel, enabled, config) VALUES (?, ?, ?, ?)
        ON CONFLICT(team_id, channel) DO UPDATE SET
          enabled = COALESCE(?, enabled), config = ?
      `).run(teamId, channel, enabled === undefined ? 0 : (enabled ? 1 : 0), mergedConfig,
             enabled === undefined ? null : (enabled ? 1 : 0), mergedConfig);
    });
    logAudit({ teamId, userId: session.userId, action: 'notifications.updated', meta: { channel } });
    return res.json({ ok: true });
  }

  if (req.method === 'POST') {
    const { channel } = req.body || {};
    if (!CHANNELS.includes(channel)) return res.status(400).json({ error: 'Unknown channel' });
    // Temporarily scope the test to one channel by reading its row directly.
    const row = db.prepare('SELECT enabled FROM notification_settings WHERE team_id = ? AND channel = ?').get(teamId, channel) as any;
    if (!row?.enabled) return res.status(400).json({ error: 'Channel is not enabled' });
    await notifyTeam(teamId, 'test', `Test notification from OpenFinder (${channel}) — configuration works!`);
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'PATCH', 'POST']);
  return res.status(405).end();
}, { minRole: 'admin' });
