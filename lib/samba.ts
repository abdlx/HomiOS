/**
 * Samba (SMB/CIFS) integration — smb.conf generation + smbpasswd management.
 * Schema lives in lib/db.ts; callers pass the shared connection in.
 */
import { copyFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
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

const MANAGED_BEGIN = '# BEGIN HOMIOS MANAGED SHARES';
const MANAGED_END = '# END HOMIOS MANAGED SHARES';

export type ConfiguredSambaShare = {
  name: string;
  path: string;
  comment: string;
  browsable: boolean;
  readOnly: boolean;
  guestOk: boolean;
  validUsers: string[];
};

function sambaBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return /^(yes|true|1)$/i.test(value.trim());
}

/** Parse normalized testparm output, or smb.conf itself as a fallback. */
export function parseSambaShares(config: string): ConfiguredSambaShare[] {
  const sections: Array<{ name: string; values: Map<string, string> }> = [];
  let current: { name: string; values: Map<string, string> } | null = null;

  for (const rawLine of String(config || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const section = line.match(/^\[([^\]]+)]$/);
    if (section) {
      current = { name: section[1].trim(), values: new Map() };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    const separator = line.indexOf('=');
    if (separator < 1) continue;
    current.values.set(
      line.slice(0, separator).trim().toLowerCase(),
      line.slice(separator + 1).trim(),
    );
  }

  return sections
    .filter((section) => section.name.toLowerCase() !== 'global')
    .map((section) => {
      const writable = section.values.get('writable') ?? section.values.get('writeable');
      const readOnly = section.values.has('read only')
        ? sambaBoolean(section.values.get('read only'), true)
        : !sambaBoolean(writable, false);
      const validUsers = String(section.values.get('valid users') || '')
        .split(/[\s,]+/)
        .map((value) => value.trim())
        .filter(Boolean);
      return {
        name: section.name,
        path: section.values.get('path') || '',
        comment: section.values.get('comment') || '',
        browsable: sambaBoolean(section.values.get('browsable') ?? section.values.get('browseable'), true),
        readOnly,
        guestOk: sambaBoolean(section.values.get('guest ok') ?? section.values.get('public'), false),
        validUsers,
      };
    });
}

/** Read every live Samba service, including shares configured outside HomiOS. */
export function discoverSambaShares(): ConfiguredSambaShare[] {
  const target = process.env.SAMBA_CONF_PATH || '/etc/samba/smb.conf';
  if (!existsSync(target)) return [];

  const testparmBin = process.env.SAMBA_TESTPARM_BIN || 'testparm';
  const result = spawnSync(testparmBin, ['-s', target], { timeout: 5000, encoding: 'utf8' });
  const normalized = String(result.stdout || '');
  if (result.status === 0 && /^\s*\[global\]\s*$/im.test(normalized)) {
    return parseSambaShares(normalized);
  }

  try {
    return parseSambaShares(readFileSync(target, 'utf8'));
  } catch {
    return [];
  }
}

function stripManagedBlock(config: string): string {
  const start = config.indexOf(MANAGED_BEGIN);
  if (start < 0) return config;
  const end = config.indexOf(MANAGED_END, start);
  return end < 0
    ? config.slice(0, start)
    : `${config.slice(0, start)}${config.slice(end + MANAGED_END.length)}`;
}

function stripSections(config: string, names: Set<string>): string {
  if (names.size === 0) return config;
  const kept: string[] = [];
  let skip = false;
  for (const line of config.split(/\r?\n/)) {
    const section = line.trim().match(/^\[([^\]]+)]$/);
    if (section) skip = names.has(section[1].trim().toLowerCase());
    if (!skip) kept.push(line);
  }
  return kept.join('\n');
}

function isLegacyOpenStorageShare(share: ConfiguredSambaShare): boolean {
  return share.name.toLowerCase() === 'homios-storage'
    && share.path === '/mnt/homios-storage'
    && share.guestOk
    && !share.readOnly;
}

function secureBaseConfig(): string {
  return `[global]
  workgroup = WORKGROUP
  server string = HomiOS
  security = user
  server role = standalone server
  map to guest = never
  log file = /var/log/samba/log.%m
  max log size = 50
  passdb backend = tdbsam
  server min protocol = SMB2
  client min protocol = SMB2
  ntlm auth = yes
`;
}

/** Generate, validate, atomically install, and reload smb.conf. Errors are never swallowed. */
export function regenerateSmbConf(db: any): SambaApplyResult {
  const target = process.env.SAMBA_CONF_PATH || '/etc/samba/smb.conf';
  const tmp = `${target}.homios.tmp`;
  const backup = `${target}.homios.previous`;
  const hadTarget = existsSync(target);
  try {
    const shares = db.prepare(`
      SELECT * FROM shares
      WHERE enabled = 1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    `).all() as any[];

    let baseConfig = hadTarget ? readFileSync(target, 'utf8') : secureBaseConfig();
    baseConfig = stripManagedBlock(baseConfig);

    // Migrate configurations written by older HomiOS builds, which had no
    // ownership markers, and remove the installer's unsafe anonymous share.
    const managedNames = new Set(shares.map((share) => String(share.name).toLowerCase()));
    for (const share of parseSambaShares(baseConfig)) {
      if (isLegacyOpenStorageShare(share)) managedNames.add(share.name.toLowerCase());
    }
    baseConfig = stripSections(baseConfig, managedNames).trimEnd();

    let managedConfig = `${MANAGED_BEGIN}\n`;

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

      managedConfig += `[${shareName}]
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

    managedConfig += `${MANAGED_END}\n`;
    const config = `${baseConfig}\n\n${managedConfig}`;

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
