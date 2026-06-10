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
