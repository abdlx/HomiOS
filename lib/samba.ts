/**
 * Samba (SMB/CIFS) integration — smb.conf generation + smbpasswd management.
 * Schema lives in lib/db.ts; callers pass the shared connection in.
 */
import { copyFileSync, existsSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { resolveWithinRoot, sanitizeSambaText, validateSambaShareName } from './safe-paths.ts';
import { ValidationError } from './validate.ts';

// ─── smb.conf regeneration ────────────────────────────────────────────────────

export type SambaApplyResult = {
  ok: boolean;
  applied: boolean;
  reloaded: boolean;
  warning?: string;
};

export class SambaConfigError extends Error {
  code: 'unavailable' | 'validation' | 'write' | 'reload';
  constructor(code: SambaConfigError['code'], message: string) {
    super(message);
    this.name = 'SambaConfigError';
    this.code = code;
  }
}

function commandOutput(result: ReturnType<typeof spawnSync>): string {
  return String(result.stderr || result.stdout || '').trim();
}

/** Generate, validate, atomically install, and reload smb.conf. Errors are never swallowed. */
export function regenerateSmbConf(db: any): SambaApplyResult {
  const target = process.env.SAMBA_CONF_PATH || '/etc/samba/smb.conf';
  const tmp = `${target}.openfinder.tmp`;
  const backup = `${target}.openfinder.previous`;
  const hadTarget = existsSync(target);
  try {
    const shares = db.prepare(`
      SELECT * FROM shares
      WHERE enabled = 1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    `).all() as any[];

    let config = `[global]
  workgroup = WORKGROUP
  server string = OpenFinder
  security = user
  server role = standalone server
  map to guest = bad user
  log file = /var/log/samba/log.%m
  max log size = 50
  passdb backend = tdbsam
  server min protocol = SMB2
  client min protocol = SMB2
  ntlm auth = yes

`;

    for (const share of shares) {
      const shareName = validateSambaShareName(share.name);
      const sharePath = resolveWithinRoot(share.path);
      // Resolve the valid users for this share from share_users join
      const rows = db.prepare(`
        SELECT su.username, COALESCE(shu.access, 'write') as access FROM samba_users su
        JOIN share_users shu ON shu.samba_user_id = su.id
        WHERE shu.share_id = ? AND su.enabled = 1
      `).all(share.id) as { username: string; access: string }[];

      const validUsers = rows.map(r => r.username).join(', ');
      const readUsers = rows.filter(r => r.access === 'read').map(r => r.username).join(', ');
      const writeUsers = rows.filter(r => r.access !== 'read').map(r => r.username).join(', ');

      config += `[${shareName}]
  path = ${sharePath}
  comment = ${sanitizeSambaText(share.comment, shareName)}
  browsable = yes
  writable = ${share.read_only ? 'no' : 'yes'}
  guest ok = no
  valid users = ${validUsers || '@nobody'}
  read list = ${readUsers || ''}
  write list = ${share.read_only ? '' : writeUsers}
  create mask = 0664
  directory mask = 0775
  force user = root

`;
    }

    writeFileSync(tmp, config, { mode: 0o644 });
    const testparmBin = process.env.SAMBA_TESTPARM_BIN || 'testparm';
    const smbcontrolBin = process.env.SAMBA_CONTROL_BIN || 'smbcontrol';
    const systemctlBin = process.env.SAMBA_SYSTEMCTL_BIN || 'systemctl';
    const pkillBin = process.env.SAMBA_PKILL_BIN || 'pkill';
    const test = spawnSync(testparmBin, ['-s', tmp], { timeout: 5000, encoding: 'utf8' });
    if (test.error && (test.error as any).code === 'ENOENT') {
      throw new SambaConfigError('unavailable', 'Samba validation tool (testparm) is not installed');
    }
    if (test.status !== 0) {
      throw new SambaConfigError('validation', commandOutput(test) || 'Generated Samba configuration failed validation');
    }
    if (existsSync(target)) copyFileSync(target, backup);
    renameSync(tmp, target);

    // Graceful daemon reload. Do not run through a shell: this preserves precise
    // exit codes and avoids claiming success when every fallback failed.
    const attempts = [
      spawnSync(smbcontrolBin, ['smbd', 'reload-config'], { timeout: 5000, encoding: 'utf8' }),
      spawnSync(systemctlBin, ['reload', 'smbd'], { timeout: 8000, encoding: 'utf8' }),
      spawnSync(pkillBin, ['-HUP', 'smbd'], { timeout: 5000, encoding: 'utf8' }),
    ];
    if (!attempts.some((result) => result.status === 0)) {
      if (existsSync(backup)) copyFileSync(backup, target);
      else if (!hadTarget) try { unlinkSync(target); } catch {}
      throw new SambaConfigError(
        'reload',
        commandOutput(attempts[2]) || commandOutput(attempts[1]) || commandOutput(attempts[0]) || 'Samba service could not reload the new configuration',
      );
    }
    try { unlinkSync(backup); } catch {}
    return { ok: true, applied: true, reloaded: true };
  } catch (error: any) {
    try { unlinkSync(tmp); } catch {}
    if (error instanceof SambaConfigError) throw error;
    if (error instanceof ValidationError) throw new SambaConfigError('validation', error.message);
    const code: SambaConfigError['code'] = error?.code === 'EACCES' || error?.code === 'EPERM' ? 'write' : 'unavailable';
    throw new SambaConfigError(code, error?.message || 'Samba configuration could not be applied');
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
