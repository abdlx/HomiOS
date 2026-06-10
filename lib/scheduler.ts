/**
 * Background scheduler — Coolify's queue workers, translated to in-process
 * loops (no Redis required; this is a single-node control plane).
 *
 *  - HTTP health checks per app (hc_* columns), with team notifications on
 *    healthy -> unhealthy transitions.
 *  - Cron scheduled tasks: `docker exec <container> sh -c <command>`.
 *  - Cron scheduled backups: volume snapshots, optional S3 upload, retention.
 *  - Server reachability sweep (SSH ping every 5 min) with notifications.
 *
 * Started once from server.js via startScheduler().
 */
import path from 'path';
import fs from 'fs';
import { Cron } from 'croner';
import { getDb } from './db.ts';
import { getExecutor } from './docker.ts';
import { notifyTeam } from './notify.ts';
import { validateServer } from './ssh.ts';
import { backupApp } from './deploy-engine.ts';
import { uploadBackupToS3 } from './s3.ts';
import { containerSlug } from './validate.ts';

const STACKS_DIR = path.join(process.cwd(), 'data', 'stacks');
let started = false;

function teamIdForApp(app: any): string | null {
  const p = getDb().prepare('SELECT team_id FROM docker_projects WHERE id = ?').get(app.project_id) as any;
  return p?.team_id ?? null;
}

/** Validate a cron expression without throwing. */
export function isValidCron(expr: string): boolean {
  try { new Cron(expr, { paused: true }).stop(); return true; } catch { return false; }
}

function cronDue(expr: string, lastRunAt: string | null, now: Date): boolean {
  try {
    const from = lastRunAt ? new Date(lastRunAt) : new Date(now.getTime() - 60_000);
    const job = new Cron(expr, { paused: true });
    const next = job.nextRun(from);
    job.stop();
    return !!next && next <= now;
  } catch {
    return false;
  }
}

// ── Health checks ────────────────────────────────────────────────────────────

async function runHealthChecks(): Promise<void> {
  const db = getDb();
  const apps = db.prepare(`
    SELECT * FROM docker_apps WHERE hc_enabled = 1 AND status = 'running'
  `).all() as any[];

  for (const app of apps) {
    const interval = Math.max(10, app.hc_interval || 60) * 1000;
    if (app.hc_checked_at && Date.now() - new Date(app.hc_checked_at).getTime() < interval) continue;

    const port = app.hc_port || (() => {
      try { return JSON.parse(app.ports || '[]')[0]?.host; } catch { return null; }
    })();
    if (!port) continue;

    const url = `http://localhost:${port}${app.hc_path || '/'}`;
    let healthy = false;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10_000);
      const resp = await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
      clearTimeout(t);
      healthy = resp.status < 500;
    } catch {
      healthy = false;
    }

    const newStatus = healthy ? 'healthy' : 'unhealthy';
    const prev = app.hc_status;
    db.prepare('UPDATE docker_apps SET hc_status = ?, hc_checked_at = ? WHERE id = ?')
      .run(newStatus, new Date().toISOString(), app.id);

    if (prev === 'healthy' && newStatus === 'unhealthy') {
      const teamId = teamIdForApp(app);
      if (teamId) void notifyTeam(teamId, 'health.unhealthy', `${app.name}: health check failing at ${app.hc_path || '/'} (port ${port}).`);
    }
  }
}

// ── Scheduled tasks ──────────────────────────────────────────────────────────

async function runScheduledTasks(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const tasks = db.prepare(`
    SELECT t.*, a.container_name, a.server_id, a.project_id, a.name AS app_name, a.status AS app_status
    FROM scheduled_tasks t JOIN docker_apps a ON a.id = t.app_id
    WHERE t.enabled = 1
  `).all() as any[];

  for (const task of tasks) {
    if (!cronDue(task.frequency, task.last_run_at, now)) continue;
    db.prepare('UPDATE scheduled_tasks SET last_run_at = ? WHERE id = ?').run(now.toISOString(), task.id);
    if (task.app_status !== 'running') continue;

    const slug = task.container_name || containerSlug(task.app_id);
    try {
      const exec = await getExecutor(task.server_id || null, STACKS_DIR);
      const res = await exec.docker(['exec', slug, 'sh', '-c', task.command]);
      const output = (res.stdout + res.stderr).slice(-8192);
      db.prepare('UPDATE scheduled_tasks SET last_status = ?, last_output = ? WHERE id = ?')
        .run(res.code === 0 ? 'success' : 'failed', output, task.id);
      if (res.code !== 0) {
        const teamId = teamIdForApp(task);
        if (teamId) void notifyTeam(teamId, 'task.failed', `Task "${task.name}" on ${task.app_name} exited ${res.code}.`);
      }
    } catch (e: any) {
      db.prepare('UPDATE scheduled_tasks SET last_status = ?, last_output = ? WHERE id = ?')
        .run('failed', String(e.message || e).slice(0, 2000), task.id);
    }
  }
}

// ── Scheduled backups ────────────────────────────────────────────────────────

async function runScheduledBackups(): Promise<void> {
  const db = getDb();
  const now = new Date();
  const schedules = db.prepare(`
    SELECT b.*, a.container_name, a.project_id, a.name AS app_name
    FROM scheduled_backups b JOIN docker_apps a ON a.id = b.app_id
    WHERE b.enabled = 1
  `).all() as any[];

  for (const sched of schedules) {
    if (!cronDue(sched.frequency, sched.last_run_at, now)) continue;
    db.prepare('UPDATE scheduled_backups SET last_run_at = ? WHERE id = ?').run(now.toISOString(), sched.id);

    const teamId = teamIdForApp(sched);
    try {
      const result = await backupApp(sched.app_id);
      db.prepare('UPDATE scheduled_backups SET last_status = ? WHERE id = ?')
        .run(result.ok ? 'success' : 'failed', sched.id);

      const slug = sched.container_name || containerSlug(sched.app_id);
      const dir = path.resolve(process.cwd(), 'data', 'backups', slug);

      if (result.ok && sched.s3_storage_id) {
        for (const file of result.files) {
          await uploadBackupToS3(sched.s3_storage_id, path.join(dir, file), `${slug}/${file}`);
        }
      }

      // Retention: keep newest N archives.
      if (fs.existsSync(dir)) {
        const archives = fs.readdirSync(dir).filter((f) => f.endsWith('.tar.gz'))
          .map((f) => ({ f, m: fs.statSync(path.join(dir, f)).mtimeMs }))
          .sort((a, b) => b.m - a.m);
        for (const old of archives.slice(Math.max(1, sched.retention || 7))) {
          fs.rmSync(path.join(dir, old.f), { force: true });
        }
      }

      if (teamId) {
        void notifyTeam(teamId, result.ok ? 'backup.success' : 'backup.failed',
          result.ok ? `${sched.app_name}: backup created (${result.files.length} archive(s)).`
                    : `${sched.app_name}: backup failed — ${result.message || 'unknown error'}.`);
      }
    } catch (e: any) {
      db.prepare('UPDATE scheduled_backups SET last_status = ? WHERE id = ?').run('failed', sched.id);
      if (teamId) void notifyTeam(teamId, 'backup.failed', `${sched.app_name}: backup failed — ${e.message}.`);
    }
  }
}

// ── Server reachability sweep ────────────────────────────────────────────────

async function sweepServers(): Promise<void> {
  const db = getDb();
  const servers = db.prepare('SELECT * FROM servers WHERE is_localhost = 0').all() as any[];
  for (const server of servers) {
    const wasReachable = !!server.is_reachable;
    const status = await validateServer(server.id);
    if (wasReachable && !status.reachable) {
      void notifyTeam(server.team_id, 'server.unreachable', `${server.name} (${server.ip}) is unreachable over SSH.`);
    } else if (!wasReachable && status.reachable) {
      void notifyTeam(server.team_id, 'server.recovered', `${server.name} (${server.ip}) is reachable again.`);
    }
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────

export function startScheduler(): void {
  if (started) return;
  started = true;

  const safe = (fn: () => Promise<void>) => () => fn().catch((e) => console.error('[scheduler]', e));

  setInterval(safe(runHealthChecks), 15_000);
  setInterval(safe(runScheduledTasks), 30_000);
  setInterval(safe(runScheduledBackups), 60_000);
  setInterval(safe(sweepServers), 300_000);

  console.log('✅ Scheduler started (health checks, cron tasks, backups, server sweeps)');
}
