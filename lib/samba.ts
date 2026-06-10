/**
 * Samba (SMB/CIFS) integration — smb.conf generation + smbpasswd management.
 * Schema lives in lib/db.ts; callers pass the shared connection in.
 */
import { writeFileSync } from 'fs';
import { execSync, spawnSync } from 'child_process';

// ─── smb.conf regeneration ────────────────────────────────────────────────────

export function regenerateSmbConf(db: any) {
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
  server min protocol = SMB2
  client min protocol = SMB2
  ntlm auth = yes

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
  force user = root

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
    const idCheck = spawnSync('id', ['-u', username]);
    if (idCheck.status !== 0) {
      // Create a system user without home directory and no shell
      const userAdd = spawnSync('useradd', ['-M', '-s', '/sbin/nologin', username]);
      if (userAdd.status !== 0) {
        // Fallback for Alpine Linux
        const adduser = spawnSync('adduser', ['-D', '-s', '/sbin/nologin', '-H', username]);
        if (adduser.status !== 0) {
          return { ok: false, error: 'Failed to create system user. ' + (userAdd.stderr?.toString() || '') + ' ' + (adduser.stderr?.toString() || '') };
        }
      }
    }

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
