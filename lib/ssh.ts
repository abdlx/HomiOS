/**
 * SSH primitives for remote server management (Coolify model: SSH + docker CLI).
 *
 * Commands are built from argument arrays and shell-quoted with a strict
 * single-quote escaper — no raw user input ever lands in a remote shell
 * unquoted. File pushes use SFTP, not heredocs.
 */
import { Client, type ConnectConfig } from 'ssh2';
import { getDb } from './db.ts';
import { decryptSecret } from './crypto.ts';

export type SshTarget = {
  host: string;
  port: number;
  username: string;
  privateKey: string;
};

export type ExecResult = { code: number; stdout: string; stderr: string };

/** POSIX single-quote escaping: ' -> '\'' */
export function shellQuote(arg: string): string {
  return `'${String(arg).replace(/'/g, `'\\''`)}'`;
}

export function quoteCommand(bin: string, args: string[]): string {
  return [bin, ...args].map(shellQuote).join(' ');
}

export function sshTargetForServer(serverId: string): SshTarget {
  const db = getDb();
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
  if (!server) throw new Error('Server not found');
  if (!server.private_key_id) throw new Error('Server has no SSH key assigned');
  const key = db.prepare('SELECT * FROM private_keys WHERE id = ?').get(server.private_key_id) as any;
  if (!key) throw new Error('SSH key not found');
  return {
    host: server.ip,
    port: server.port || 22,
    username: server.ssh_user || 'root',
    privateKey: decryptSecret(key.private_key_enc),
  };
}

function connect(target: SshTarget, timeoutMs = 15000): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const cfg: ConnectConfig = {
      host: target.host,
      port: target.port,
      username: target.username,
      privateKey: target.privateKey,
      readyTimeout: timeoutMs,
    };
    conn.on('ready', () => resolve(conn));
    conn.on('error', (err) => reject(err));
    conn.connect(cfg);
  });
}

/** Run a single command remotely. The command must already be safely quoted. */
export async function sshExec(
  target: SshTarget,
  command: string,
  onData?: (chunk: string) => void,
  timeoutMs = 600_000,
): Promise<ExecResult> {
  const conn = await connect(target);
  try {
    return await new Promise<ExecResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        conn.end();
        reject(new Error(`SSH command timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      conn.exec(command, (err, stream) => {
        if (err) { clearTimeout(timer); return reject(err); }
        let stdout = '';
        let stderr = '';
        stream.on('data', (d: Buffer) => { const s = d.toString(); stdout += s; onData?.(s); });
        stream.stderr.on('data', (d: Buffer) => { const s = d.toString(); stderr += s; onData?.(s); });
        stream.on('close', (code: number) => {
          clearTimeout(timer);
          resolve({ code: code ?? 0, stdout, stderr });
        });
      });
    });
  } finally {
    conn.end();
  }
}

/** Run a binary with args remotely, safely quoted. */
export async function sshRun(
  target: SshTarget,
  bin: string,
  args: string[],
  onData?: (chunk: string) => void,
): Promise<ExecResult> {
  return sshExec(target, quoteCommand(bin, args), onData);
}

/** Write a file on the remote host via SFTP (mkdir -p the parent first). */
export async function sshWriteFile(target: SshTarget, remotePath: string, content: string): Promise<void> {
  const dir = remotePath.slice(0, remotePath.lastIndexOf('/')) || '/';
  await sshExec(target, `mkdir -p ${shellQuote(dir)}`);
  const conn = await connect(target);
  try {
    await new Promise<void>((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err);
        const stream = sftp.createWriteStream(remotePath);
        stream.on('close', () => resolve());
        stream.on('error', reject);
        stream.end(content);
      });
    });
  } finally {
    conn.end();
  }
}

// ── Server actions (Coolify's ValidateServer / InstallDocker) ────────────────

export async function validateServer(serverId: string): Promise<{
  reachable: boolean; usable: boolean; dockerVersion?: string; error?: string;
}> {
  const db = getDb();
  try {
    const target = sshTargetForServer(serverId);
    const uname = await sshExec(target, 'uname -a', undefined, 20_000);
    if (uname.code !== 0) throw new Error(uname.stderr || 'uname failed');

    const dockerV = await sshExec(target, 'docker version --format {{.Server.Version}}', undefined, 20_000);
    const usable = dockerV.code === 0;
    const dockerVersion = usable ? dockerV.stdout.trim() : undefined;

    db.prepare(`
      UPDATE servers SET is_reachable = 1, is_usable = ?, docker_version = ?, last_check_at = ? WHERE id = ?
    `).run(usable ? 1 : 0, dockerVersion ?? null, new Date().toISOString(), serverId);

    return { reachable: true, usable, dockerVersion };
  } catch (e: any) {
    db.prepare('UPDATE servers SET is_reachable = 0, is_usable = 0, last_check_at = ? WHERE id = ?')
      .run(new Date().toISOString(), serverId);
    return { reachable: false, usable: false, error: e.message };
  }
}

/** Install Docker on the remote host via the official convenience script. */
export async function installDocker(serverId: string, onData?: (s: string) => void): Promise<ExecResult> {
  const target = sshTargetForServer(serverId);
  const result = await sshExec(
    target,
    'command -v docker >/dev/null 2>&1 && echo "docker already installed" || (curl -fsSL https://get.docker.com | sh)',
    onData,
  );
  if (result.code === 0) await validateServer(serverId);
  return result;
}
