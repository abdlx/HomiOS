import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { getSession } from '../../../lib/auth';

export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  const db = new Database('/app/data/filemanager.db');

  try {
    if (req.method === 'GET') {
      const shares = db.prepare('SELECT * FROM shares WHERE user_id = ?').all(session.userId);
      res.json(shares);
    }

    if (req.method === 'POST') {
      const { name, path, readOnly } = req.body;

      if (!name || !path) return res.status(400).json({ error: 'Missing fields' });
      if (!path.startsWith('/app/drives')) {
        return res.status(400).json({ error: 'Invalid path' });
      }

      // Check if table exists, create if not
      db.exec(`
        CREATE TABLE IF NOT EXISTS shares (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          path TEXT NOT NULL,
          read_only INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY(user_id) REFERENCES users(id)
        );
      `);

      const stmt = db.prepare(
        'INSERT INTO shares (user_id, name, path, read_only) VALUES (?, ?, ?, ?)'
      );
      const result = stmt.run(session.userId, name, path, readOnly ? 1 : 0);

      regenerateSmbConf(db);

      res.json({
        ok: true,
        id: result.lastInsertRowid,
        uncPath: `\\\\filemanager\\${name}`
      });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;

      db.prepare('DELETE FROM shares WHERE id = ? AND user_id = ?').run(id, session.userId);

      regenerateSmbConf(db);

      res.json({ ok: true });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

function regenerateSmbConf(db: any) {
  try {
    const shares = db.prepare('SELECT * FROM shares').all();

    let config = `
[global]
  workgroup = WORKGROUP
  server string = FileManager
  security = user
  map to guest = bad user
  log file = /var/log/samba/log.%m
  max log size = 50

`;

    shares.forEach((share: any) => {
      config += `
[${share.name}]
  path = ${share.path}
  browsable = yes
  writable = ${share.read_only ? 'no' : 'yes'}
  guest ok = no
  valid users = smbuser
  create mask = 0755
  directory mask = 0755

`;
    });

    writeFileSync('/etc/samba/smb.conf', config);

    try {
      execSync('smbcontrol smbd reload-config');
    } catch {
      execSync('pkill -9 smbd; smbd -D');
    }
  } catch (e) {
    console.error('Samba reload failed:', e);
  }
}
