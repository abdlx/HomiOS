/**
 * Safe Docker CLI primitives.
 *
 * Every Docker invocation goes through spawn() with an ARGUMENT ARRAY and
 * shell:false. No user input is ever interpolated into a shell string, so
 * command injection is structurally impossible here. The old engine built
 * strings like `git clone ${repo}` and ran them with shell:true — that entire
 * class of bug is gone.
 */
import { spawn } from 'child_process';

const DOCKER = process.env.DOCKER_BIN || 'docker';

export type RunResult = { code: number; stdout: string; stderr: string };
export type OnData = (chunk: string) => void;

function guardArgs(args: string[]): void {
  for (const a of args) {
    if (typeof a !== 'string') throw new Error('Docker arg must be a string');
    if (a.includes('\0')) throw new Error('Docker arg contains NUL');
  }
}

/** Run docker with streamed output. Resolves with the exit code + captured text. */
export function docker(args: string[], onData?: OnData): Promise<RunResult> {
  guardArgs(args);
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(DOCKER, args, { shell: false });
    child.stdout.on('data', (d) => { const s = d.toString(); stdout += s; onData?.(s); });
    child.stderr.on('data', (d) => { const s = d.toString(); stderr += s; onData?.(s); });
    child.on('error', (err) => { onData?.(`\n[spawn error] ${err.message}\n`); resolve({ code: 127, stdout, stderr: stderr + err.message }); });
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

/** Spawn an arbitrary command safely (used for `git`, `nixpacks` host shell-free chains). */
export function run(bin: string, args: string[], onData?: OnData): Promise<RunResult> {
  guardArgs(args);
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(bin, args, { shell: false });
    child.stdout.on('data', (d) => { const s = d.toString(); stdout += s; onData?.(s); });
    child.stderr.on('data', (d) => { const s = d.toString(); stderr += s; onData?.(s); });
    child.on('error', (err) => { onData?.(`\n[spawn error] ${err.message}\n`); resolve({ code: 127, stdout, stderr: stderr + err.message }); });
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

/** `docker inspect <name>` → parsed object, or null if it doesn't exist. */
export async function inspect(name: string): Promise<any | null> {
  const res = await docker(['inspect', name]);
  if (res.code !== 0) return null;
  try {
    const arr = JSON.parse(res.stdout);
    return Array.isArray(arr) ? arr[0] : arr;
  } catch {
    return null;
  }
}

/** Derive a simple status string + health from a `docker inspect` object. */
export function statusFromInspect(info: any | null): { status: string; health: string } {
  if (!info || !info.State) return { status: 'stopped', health: 'unknown' };
  const s = info.State;
  const health = s.Health?.Status || (s.Running ? 'healthy' : 'unknown');
  if (s.Running) return { status: 'running', health };
  if (s.Restarting) return { status: 'deploying', health };
  if (s.Dead || (s.ExitCode && s.ExitCode !== 0)) return { status: 'error', health: 'unhealthy' };
  return { status: 'stopped', health };
}

export async function ensureNetwork(name: string): Promise<void> {
  const res = await docker(['network', 'inspect', name]);
  if (res.code !== 0) await docker(['network', 'create', name]);
}

export async function stopContainer(name: string): Promise<RunResult> {
  return docker(['stop', name]);
}
export async function startContainer(name: string): Promise<RunResult> {
  return docker(['start', name]);
}
export async function restartContainer(name: string): Promise<RunResult> {
  return docker(['restart', name]);
}
export async function removeContainer(name: string, force = true): Promise<RunResult> {
  return docker(force ? ['rm', '-f', name] : ['rm', name]);
}

/** Stream live container logs. Returns the child so the caller can kill it. */
export function streamLogs(name: string, onData: OnData, tail = 200) {
  guardArgs([name]);
  const child = spawn(DOCKER, ['logs', '-f', '--tail', String(tail), name], { shell: false });
  child.stdout.on('data', (d) => onData(d.toString()));
  child.stderr.on('data', (d) => onData(d.toString()));
  return child;
}

export type ContainerStat = { name: string; cpu: string; mem: string; memPerc: string; netIO: string };

/** One-shot stats for a set of container names. */
export async function statsOnce(names: string[]): Promise<ContainerStat[]> {
  if (!names.length) return [];
  const res = await docker(['stats', '--no-stream', '--format', '{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}', ...names]);
  if (res.code !== 0) return [];
  return res.stdout.trim().split('\n').filter(Boolean).map((line) => {
    const [name, cpu, mem, memPerc, netIO] = line.split('|');
    return { name, cpu, mem, memPerc, netIO };
  });
}

export function composeArgs(file: string, project: string, rest: string[]): string[] {
  return ['compose', '-f', file, '-p', project, ...rest];
}

// ── Server-aware execution (local spawn OR remote over SSH) ──────────────────
//
// Every deploy-engine call goes through an executor. serverId null/localhost
// keeps the existing local spawn path; a remote server id routes the same
// argument arrays through lib/ssh.ts with strict shell quoting.

export type DockerExecutor = {
  docker(args: string[], onData?: OnData): Promise<RunResult>;
  run(bin: string, args: string[], onData?: OnData): Promise<RunResult>;
  writeFile(filePath: string, content: string): Promise<void>;
  inspect(name: string): Promise<any | null>;
  isRemote: boolean;
  stacksDir: string;
};

const REMOTE_STACKS_DIR = '/data/openfinder/stacks';

export function localExecutor(stacksDir: string): DockerExecutor {
  return {
    isRemote: false,
    stacksDir,
    docker: (args, onData) => docker(args, onData),
    run: (bin, args, onData) => run(bin, args, onData),
    writeFile: async (filePath, content) => {
      const fs = await import('fs');
      const path = await import('path');
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    },
    inspect: (name) => inspect(name),
  };
}

export async function getExecutor(serverId: string | null | undefined, localStacksDir: string): Promise<DockerExecutor> {
  if (!serverId) return localExecutor(localStacksDir);

  const { getDb } = await import('./db.ts');
  const server = getDb().prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as any;
  if (!server || server.is_localhost) return localExecutor(localStacksDir);

  const { sshTargetForServer, sshRun, sshWriteFile } = await import('./ssh.ts');
  const target = sshTargetForServer(serverId);

  const remoteDocker = (args: string[], onData?: OnData) => {
    guardArgs(args);
    return sshRun(target, 'docker', args, onData);
  };
  return {
    isRemote: true,
    stacksDir: REMOTE_STACKS_DIR,
    docker: remoteDocker,
    run: (bin, args, onData) => { guardArgs(args); return sshRun(target, bin, args, onData); },
    writeFile: (filePath, content) => sshWriteFile(target, filePath, content),
    inspect: async (name) => {
      const res = await remoteDocker(['inspect', name]);
      if (res.code !== 0) return null;
      try {
        const arr = JSON.parse(res.stdout);
        return Array.isArray(arr) ? arr[0] : arr;
      } catch { return null; }
    },
  };
}
