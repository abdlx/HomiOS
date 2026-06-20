import { getDb } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';
import { setResourceProfile } from '../../../lib/resource-profile.ts';
import { createBackupPlan } from '../../../lib/backups.ts';
import { withTransaction } from '../../../lib/db.ts';

export default withAuth(async (req, res, session) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const { drives, performanceProfile, photoSources, backupDestination } = req.body || {};
    const db = getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS drives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mount_path TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      );
    `);

    withTransaction((tx) => {
      const insert = tx.prepare('INSERT INTO drives (user_id, mount_path, label) VALUES (?, ?, ?)');
      for (const drivePath of drives || []) {
        const label = String(drivePath).split('/').pop() || 'Drive';
        insert.run(session.userId, drivePath, label);
      }

      if (['beautiful', 'balanced', 'server_saver'].includes(performanceProfile)) {
        tx.prepare(`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('setup.performance_profile', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify(performanceProfile));
      }

      if (Array.isArray(photoSources)) {
        tx.prepare(`
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('photos.sources', ?, CURRENT_TIMESTAMP)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify(photoSources.filter(Boolean)));
      }
    });

    if (['beautiful', 'balanced', 'server_saver'].includes(performanceProfile)) {
      setResourceProfile(performanceProfile);
    }

    if (backupDestination && drives?.[0]) {
      createBackupPlan({
        teamId: session.teamId,
        userId: session.userId,
        name: 'Default Local Backup',
        sourcePath: drives[0],
        destinationType: 'local',
        destination: String(backupDestination),
      });
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error('[/api/setup/complete]', err);
    res.status(500).json({ error: 'Setup completion failed' });
  }
}, { ability: 'write', minRole: 'admin' });
