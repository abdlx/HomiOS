import Database from 'better-sqlite3';
import { writeFileSync } from 'fs';
import { execSync, spawnSync } from 'child_process';

export const DB_PATH = process.env.DATABASE_URL || './data/filemanager.db';

// ─── Schema bootstrap ────────────────────────────────────────────────────────

export function bootstrapSambaSchema(db: ReturnType<typeof Database>) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      name          TEXT    NOT NULL UNIQUE,
      path          TEXT    NOT NULL,
      read_only     INTEGER DEFAULT 0,
      comment       TEXT    DEFAULT '',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS samba_users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL UNIQUE,
      enabled    INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS share_users (
      share_id      INTEGER NOT NULL,
      samba_user_id INTEGER NOT NULL,
      PRIMARY KEY (share_id, samba_user_id),
      FOREIGN KEY(share_id)      REFERENCES shares(id)      ON DELETE CASCADE,
      FOREIGN KEY(samba_user_id) REFERENCES samba_users(id) ON DELETE CASCADE
    );
  `);
}

// ─── smb.conf regeneration ────────────────────────────────────────────────────

export function regenerateSmbConf(db: ReturnType<typeof Database>) {
  try {
    const shares = db.prepare('SELECT * FROM shares').all() as any[];

    let config = `[global]
  workgroup = WORKGROUP
  server string = OpenFinder
  security = user
  map to guest = never
  log file = /var/log/samba/log.%m
  max log size = 50
  passdb backend = tdbsam
  smb encrypt = desired

`;

    for (const share of shares) {
      // Resolve the valid users for this share from share_users join
      const rows = db.prepare(`
        SELECT su.username FROM samba_users su
        JOIN share_users shu ON shu.samba_user_id = su.id
        WHERE shu.share_id = ? AND su.enabled = 1
      `).all(share.id) as { username: string }[];

      const validUsers = rows.map(r => r.username).join(', ');

      config += `[${share.name}]
  path = ${share.path}
  comment = ${share.comment || share.name}
  browsable = yes
  writable = ${share.read_only ? 'no' : 'yes'}
  guest ok = no
  valid users = ${validUsers || '@nobody'}
  create mask = 0664
  directory mask = 0775
  force group = sambashare

`;
    }

    writeFileSync('/etc/samba/smb.conf', config);

    // Graceful reload, fall back to restart
    const reload = spawnSync('smbcontrol', ['smbd', 'reload-config'], { timeout: 3000 });
    if (reload.status !== 0) {
      execSync('systemctl reload smbd 2>/dev/null || pkill -HUP smbd || true');
    }
  } catch (e) {
    console.error('[samba] smb.conf regeneration failed:', e);
  }
}

// ─── smbpasswd helpers ────────────────────────────────────────────────────────

/** Add or update a samba user's password via smbpasswd. Returns true on success. */
export function setSambaPassword(username: string, password: string): { ok: boolean; error?: string } {
  try {
    // First ensure the OS user exists (required by smbpasswd)
    spawnSync('id', [username]); // will fail silently — smbpasswd will catch it

    // Pipe password twice (new + confirm) to smbpasswd -a -s
    const result = spawnSync(
      'smbpasswd',
      ['-a', '-s', username],
      { input: `${password}\n${password}\n`, encoding: 'utf8', timeout: 5000 }
    );

    if (result.status !== 0) {
      return { ok: false, error: result.stderr?.toString() || 'smbpasswd failed' };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/** Remove a samba user from the passdb. */
export function removeSambaUser(username: string): { ok: boolean; error?: string } {
  try {
    const result = spawnSync('smbpasswd', ['-x', username], { encoding: 'utf8', timeout: 5000 });
    if (result.status !== 0) {
      return { ok: false, error: result.stderr?.toString() || 'smbpasswd -x failed' };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}

/** Enable or disable a samba user in the passdb. */
export function toggleSambaUser(username: string, enable: boolean): { ok: boolean; error?: string } {
  try {
    const flag = enable ? '-e' : '-d';
    const result = spawnSync('smbpasswd', [flag, username], { encoding: 'utf8', timeout: 5000 });
    if (result.status !== 0) {
      return { ok: false, error: result.stderr?.toString() };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message };
  }
}
