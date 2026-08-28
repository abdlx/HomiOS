import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { getDb, withTransaction } from './db.ts';
import { getResourceProfileConfig } from './resource-profile.ts';
import { createNotification } from './notifications.ts';
import { rebuildFileIndex } from './indexer.ts';
import { ensureThumbnail } from './thumbnails.ts';
import { runBackup, restoreBackup } from './backups.ts';
import { runSyncPlan } from './sync.ts';
import { runOcr } from './ocr.ts';
import { runFileTransfer, TransferCancelledError } from './file-transfers.ts';

export type JobType =
  | 'index.files'
  | 'index.photos'
  | 'thumbnail.generate'
  | 'backup.run'
  | 'backup.restore'
  | 'sync.run'
  | 'ocr.run'
  | 'zip.create'
  | 'file.move'
  | 'file.copy'
  | 'app.install';

export type JobStatus = 'queued' | 'running' | 'paused' | 'cancelled' | 'failed' | 'completed';
export type JobResourceClass = 'cpu' | 'io' | 'media' | 'backup';

const JOB_RESOURCE_CLASS: Record<JobType, JobResourceClass> = {
  'index.files': 'io',
  'index.photos': 'io',
  'thumbnail.generate': 'media',
  'backup.run': 'backup',
  'backup.restore': 'backup',
  'sync.run': 'backup',
  'ocr.run': 'cpu',
  'zip.create': 'cpu',
  'file.move': 'io',
  'file.copy': 'io',
  'app.install': 'io',
};

let workerStarted = false;
let workerTimer: NodeJS.Timeout | null = null;
const runningJobs = new Set<string>();
const lastProgressEventAt = new Map<string, number>();
const jobEventBus = new EventEmitter();

export function onJobProgress(listener: (payload: any) => void) {
  jobEventBus.on('apps:install-progress', listener);
  return () => jobEventBus.off('apps:install-progress', listener);
}

function parseJson(value: string | null | undefined, fallback: any = {}) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeJob(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    type: row.type,
    status: row.status,
    resourceClass: row.resource_class,
    priority: row.priority,
    progress: row.progress,
    name: row.name,
    payload: parseJson(row.payload),
    result: parseJson(row.result),
    progressData: parseJson(row.progress_data),
    error: row.error,
    attempts: row.attempts || 0,
    maxAttempts: row.max_attempts || 3,
    runAt: row.run_at,
    heartbeatAt: row.heartbeat_at,
    cancelRequestedAt: row.cancel_requested_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function addEvent(jobId: string, type: string, message: string, data: any = {}) {
  getDb().prepare('INSERT INTO job_events (job_id, type, message, data) VALUES (?, ?, ?, ?)')
    .run(jobId, type, message, JSON.stringify(data || {}));
}

function updateProgress(jobId: string, progress: number, message?: string, data: any = {}) {
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));
  getDb().prepare(`
    UPDATE jobs SET progress = ?, progress_data = ?, heartbeat_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'running'
  `).run(safeProgress, JSON.stringify(data || {}), jobId);
  if (data?.appId) jobEventBus.emit('apps:install-progress', { jobId, appId: data.appId, stage: data.stage, progress: safeProgress, message });
  const now = Date.now();
  if (message && (safeProgress === 100 || now - (lastProgressEventAt.get(jobId) || 0) >= 2000)) {
    lastProgressEventAt.set(jobId, now);
    addEvent(jobId, 'progress', message, { progress: safeProgress, ...data });
  }
}

function setJobStatus(jobId: string, status: JobStatus, patch: Record<string, any> = {}) {
  const sets = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const values: any[] = [status];
  if (patch.progress !== undefined) { sets.push('progress = ?'); values.push(patch.progress); }
  if (patch.result !== undefined) { sets.push('result = ?'); values.push(JSON.stringify(patch.result || {})); }
  if (patch.error !== undefined) { sets.push('error = ?'); values.push(patch.error); }
  if (patch.runAt !== undefined) { sets.push('run_at = ?'); values.push(patch.runAt); }
  if (status === 'running') {
    sets.push('started_at = COALESCE(started_at, CURRENT_TIMESTAMP)');
    sets.push('heartbeat_at = CURRENT_TIMESTAMP');
  }
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    sets.push('finished_at = CURRENT_TIMESTAMP');
  }
  values.push(jobId);
  getDb().prepare(`UPDATE jobs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
}

function normalizeRunAt(value?: string | Date | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid runAt date');
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

export function enqueueJob(input: {
  type: JobType;
  name?: string;
  payload?: any;
  teamId?: string;
  userId?: number;
  priority?: number;
  runAt?: string | Date | null;
  maxAttempts?: number;
  idempotencyKey?: string;
}) {
  const resourceClass = JOB_RESOURCE_CLASS[input.type] || 'io';
  const name = input.name || input.type;
  const priority = Math.min(100, Math.max(-100, Math.round(input.priority || 0)));
  const maxAttempts = Math.min(10, Math.max(1, Math.round(input.maxAttempts || 3)));
  const runAt = normalizeRunAt(input.runAt);
  const rawIdempotencyKey = input.idempotencyKey?.trim().slice(0, 180) || null;
  const idempotencyKey = rawIdempotencyKey
    ? `${input.teamId || 'global'}:${input.userId || 'global'}:${rawIdempotencyKey}`
    : null;

  if (idempotencyKey) {
    const existing = getDb().prepare(`
      SELECT id FROM jobs WHERE idempotency_key = ?
    `).get(idempotencyKey) as { id: string } | undefined;
    if (existing) return existing.id;
  }

  const id = randomUUID();
  withTransaction((db) => {
    db.prepare(`
      INSERT INTO jobs (
        id, team_id, user_id, type, status, resource_class, priority, progress, name,
        payload, run_at, max_attempts, idempotency_key, updated_at
      ) VALUES (?, ?, ?, ?, 'queued', ?, ?, 0, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id,
      input.teamId || null,
      input.userId || null,
      input.type,
      resourceClass,
      priority,
      name,
      JSON.stringify(input.payload || {}),
      runAt,
      maxAttempts,
      idempotencyKey,
    );
    db.prepare('INSERT INTO job_events (job_id, type, message, data) VALUES (?, ?, ?, ?)')
      .run(id, runAt ? 'scheduled' : 'queued', runAt ? `${name} scheduled` : `${name} queued`, JSON.stringify({ runAt }));
  });
  startJobWorker();
  return id;
}

export function listJobs(options: { status?: string; limit?: number; teamId?: string; userId?: number; types?: JobType[] } = {}) {
  const limit = Math.min(Math.max(1, options.limit || 50), 200);
  const values: any[] = [];
  const where = ['1 = 1'];
  if (options.status) {
    const statuses = options.status.split(',').map((value) => value.trim()).filter(Boolean);
    if (statuses.length) {
      where.push(`status IN (${statuses.map(() => '?').join(', ')})`);
      values.push(...statuses);
    }
  }
  if (options.teamId || options.userId) {
    where.push('(team_id = ? OR user_id = ? OR (team_id IS NULL AND user_id IS NULL))');
    values.push(options.teamId || null, options.userId || null);
  }
  if (options.types?.length) {
    where.push(`type IN (${options.types.map(() => '?').join(', ')})`);
    values.push(...options.types);
  }
  values.push(limit);
  const rows = getDb().prepare(`
    SELECT * FROM jobs
    WHERE ${where.join(' AND ')}
    ORDER BY
      CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
      priority DESC,
      COALESCE(run_at, created_at) ASC,
      created_at DESC
    LIMIT ?
  `).all(...values) as any[];
  return rows.map(normalizeJob);
}

export function getJob(id: string) {
  return normalizeJob(getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id));
}

export function canAccessJob(job: any, session: { teamId?: string; userId?: number }) {
  return !!job && (
    (job.teamId && job.teamId === session.teamId)
    || job.userId === session.userId
    || (!job.teamId && !job.userId)
  );
}

export function listJobEvents(jobId: string, limit = 200) {
  return getDb().prepare(`
    SELECT id, job_id as jobId, type, message, data, created_at as createdAt
    FROM job_events
    WHERE job_id = ?
    ORDER BY id ASC
    LIMIT ?
  `).all(jobId, Math.min(Math.max(1, limit), 500)).map((row: any) => ({ ...row, data: parseJson(row.data) }));
}

export function isCancellationRequested(id: string): boolean {
  const row = getDb().prepare('SELECT cancel_requested_at as requested FROM jobs WHERE id = ?').get(id) as any;
  return !!row?.requested;
}

export function updateJobAction(id: string, action: 'pause' | 'resume' | 'cancel' | 'retry') {
  const job = getJob(id);
  if (!job) throw new Error('Job not found');
  if (action === 'pause' && job.status === 'queued') {
    setJobStatus(id, 'paused');
    addEvent(id, 'paused', 'Job paused');
  }
  if (action === 'resume' && job.status === 'paused') {
    getDb().prepare(`
      UPDATE jobs SET status = 'queued', run_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);
    addEvent(id, 'resumed', 'Job resumed');
    startJobWorker();
  }
  if (action === 'cancel' && (job.status === 'queued' || job.status === 'paused')) {
    setJobStatus(id, 'cancelled');
    addEvent(id, 'cancelled', 'Job cancelled');
  } else if (action === 'cancel' && job.status === 'running') {
    getDb().prepare(`
      UPDATE jobs SET cancel_requested_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(id);
    addEvent(id, 'cancelling', 'Cancellation requested');
  }
  if (action === 'retry' && (job.status === 'failed' || job.status === 'cancelled')) {
    getDb().prepare(`
      UPDATE jobs SET status = 'queued', progress = 0, error = NULL, result = '{}',
        run_at = NULL, attempts = 0, cancel_requested_at = NULL, started_at = NULL,
        finished_at = NULL, heartbeat_at = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(id);
    addEvent(id, 'queued', 'Job queued for retry');
    startJobWorker();
  }
  return getJob(id);
}

function canStartResource(resourceClass: JobResourceClass, db = getDb()) {
  const config = getResourceProfileConfig();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM jobs WHERE status = 'running' AND resource_class = ?
  `).get(resourceClass) as any;
  return (row?.count || 0) < config.concurrency[resourceClass];
}

/** Atomically reserves one due job. Multiple Node workers cannot claim the same row. */
function claimNextJob() {
  return withTransaction((db) => {
    const candidates = db.prepare(`
      SELECT * FROM jobs
      WHERE status = 'queued'
        AND cancel_requested_at IS NULL
        AND (run_at IS NULL OR julianday(run_at) <= julianday('now'))
      ORDER BY
        (priority + MIN(20, CAST((julianday('now') - julianday(created_at)) * 24 AS INTEGER))) DESC,
        COALESCE(run_at, created_at) ASC,
        created_at ASC
      LIMIT 50
    `).all() as any[];
    const candidate = candidates.map(normalizeJob).find((job: any) => job && canStartResource(job.resourceClass, db));
    if (!candidate) return null;
    const claimed = db.prepare(`
      UPDATE jobs SET status = 'running', attempts = attempts + 1,
        started_at = COALESCE(started_at, CURRENT_TIMESTAMP), heartbeat_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP, error = NULL
      WHERE id = ? AND status = 'queued'
    `).run(candidate.id);
    if (!claimed.changes) return null;
    return normalizeJob(db.prepare('SELECT * FROM jobs WHERE id = ?').get(candidate.id));
  });
}

function retryDelaySeconds(attempt: number) {
  return Math.min(300, Math.max(2, 2 ** Math.max(1, attempt)));
}

async function executeJob(job: any) {
  runningJobs.add(job.id);
  const heartbeat = setInterval(() => {
    getDb().prepare(`
      UPDATE jobs SET heartbeat_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = 'running'
    `).run(job.id);
  }, 10_000);
  heartbeat.unref?.();
  addEvent(job.id, 'running', `${job.name} started`, { attempt: job.attempts, maxAttempts: job.maxAttempts });
  try {
    const payload = job.payload || {};
    const onProgress = (progress: number, message?: string, data?: any) => {
      if (isCancellationRequested(job.id)) throw new TransferCancelledError();
      updateProgress(job.id, progress, message, data);
    };
    let result: any = {};

    if (job.type === 'index.files' || job.type === 'index.photos') {
      result = await rebuildFileIndex({ rootPath: payload.rootPath, teamId: job.teamId, onProgress });
    } else if (job.type === 'thumbnail.generate') {
      result = await ensureThumbnail(payload.path, payload.variant || 'grid');
    } else if (job.type === 'backup.run') {
      result = await runBackup({ ...payload, jobId: job.id, onProgress });
    } else if (job.type === 'backup.restore') {
      result = await restoreBackup({ ...payload, onProgress });
    } else if (job.type === 'sync.run') {
      result = await runSyncPlan({ planId: payload.planId, jobId: job.id, onProgress });
    } else if (job.type === 'ocr.run') {
      result = await runOcr({ ...payload, teamId: job.teamId, onProgress });
    } else if (job.type === 'file.copy' || job.type === 'file.move') {
      result = await runFileTransfer({
        sourcePath: payload.sourcePath,
        destinationPath: payload.destinationPath,
        jobId: job.id,
        move: job.type === 'file.move',
        onProgress,
        shouldCancel: () => isCancellationRequested(job.id),
      });
    } else if (job.type === 'zip.create') {
      throw new Error('zip.create jobs are queued, but folder zip export is still handled by /api/files in v1.');
    } else if (job.type === 'app.install') {
      const { runAppInstall } = await import('./apps/app-service.ts');
      result = await runAppInstall({
        jobId: job.id,
        catalogId: payload.appId,
        storage: payload.storage,
        mountIds: payload.mountIds,
        serverUuid: payload.serverUuid,
        teamId: job.teamId,
        userId: job.userId,
        onProgress,
      });
    }

    setJobStatus(job.id, 'completed', { progress: 100, result, error: null });
    addEvent(job.id, 'completed', `${job.name} completed`, result);
    createNotification({
      teamId: job.teamId,
      userId: job.userId,
      title: job.type === 'app.install' ? 'App installation completed' : job.type.startsWith('file.') ? 'Transfer completed' : 'Job completed',
      message: job.name,
      tone: 'success',
      sourceType: job.type.startsWith('file.') ? 'transfer' : 'job',
      sourceId: job.id,
    });
  } catch (error: any) {
    const cancelled = error instanceof TransferCancelledError || isCancellationRequested(job.id);
    const current = getJob(job.id);
    if (cancelled) {
      setJobStatus(job.id, 'cancelled', { error: 'Cancelled' });
      addEvent(job.id, 'cancelled', 'Job cancelled');
    } else if ((current?.attempts || 1) < (current?.maxAttempts || 1)) {
      const delaySeconds = retryDelaySeconds(current?.attempts || 1);
      getDb().prepare(`
        UPDATE jobs SET status = 'queued', error = ?, run_at = datetime('now', ?),
          heartbeat_at = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(error?.message || 'Job failed', `+${delaySeconds} seconds`, job.id);
      addEvent(job.id, 'retrying', `Attempt failed; retrying in ${delaySeconds}s`, {
        error: error?.message || 'Job failed',
        attempt: current?.attempts || 1,
        maxAttempts: current?.maxAttempts || 1,
      });
    } else {
      setJobStatus(job.id, 'failed', { error: error?.message || 'Job failed' });
      addEvent(job.id, 'failed', error?.message || 'Job failed');
      createNotification({
        teamId: job.teamId,
        userId: job.userId,
        title: job.type.startsWith('file.') ? 'Transfer failed' : 'Job failed',
        message: `${job.name}: ${error?.message || 'Unknown error'}`,
        tone: 'danger',
        sourceType: job.type.startsWith('file.') ? 'transfer' : 'job',
        sourceId: job.id,
      });
    }
  } finally {
    clearInterval(heartbeat);
    runningJobs.delete(job.id);
    lastProgressEventAt.delete(job.id);
  }
}

async function tickWorker() {
  const maxTotal = Object.values(getResourceProfileConfig().concurrency).reduce((sum, value) => sum + value, 0);
  while (runningJobs.size < maxTotal) {
    const job = claimNextJob();
    if (!job) break;
    void executeJob(job);
  }
}

function recoverInterruptedJobs() {
  // A lease heartbeat prevents a second Next.js module/worker from stealing a
  // healthy job. Only abandoned leases (heartbeat > 45 s stale) are touched.
  const staleCondition = `status = 'running'
      AND (heartbeat_at IS NULL OR heartbeat_at < datetime('now', '-45 seconds'))`;

  const interrupted = getDb().prepare(`
    SELECT id, name, type, payload FROM jobs WHERE ${staleCondition}
  `).all() as any[];

  if (interrupted.length === 0) return;

  const AUTO_RECOVERABLE_JOB_TYPES = new Set([
    'index.refresh',
    'thumbnail.generate',
    'index.files',
  ]);

  const recoverableIds: string[] = [];
  const failedIds: string[] = [];

  for (const job of interrupted) {
    if (AUTO_RECOVERABLE_JOB_TYPES.has(job.type)) {
      recoverableIds.push(job.id);
    } else {
      failedIds.push(job.id);
    }
  }

  // ── Non-recoverable jobs: mark failed, NOT re-queued ─────────────────────
  // A reboot or crash mid-backup or mid-move leaves partial data. Silently restarting
  // could be dangerous. The user (or the normal scheduler) must trigger the next run.
  if (failedIds.length > 0) {
    const placeholders = failedIds.map(() => '?').join(',');
    getDb().prepare(`
      UPDATE jobs
      SET status     = 'failed',
          error      = 'Server restarted during execution — check Job Center to retry',
          finished_at = CURRENT_TIMESTAMP,
          heartbeat_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `).run(...failedIds);
  }

  // ── Whitelisted jobs: re-queue (strictly idempotent operations) ────────────
  if (recoverableIds.length > 0) {
    const placeholders = recoverableIds.map(() => '?').join(',');
    getDb().prepare(`
      UPDATE jobs
      SET status     = 'queued',
          error      = 'Recovered after server restart',
          run_at     = datetime('now', '+2 seconds'),
          heartbeat_at = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `).run(...recoverableIds);
  }

  for (const job of interrupted) {
    const isRecoverable = AUTO_RECOVERABLE_JOB_TYPES.has(job.type);
    addEvent(
      job.id,
      isRecoverable ? 'recovered' : 'failed',
      isRecoverable
        ? `${job.name} recovered after server restart`
        : `${job.name} interrupted by server restart`
    );
  }

  // ── cleanup stale partials from interrupted backup jobs ────────────────────
  // Run asynchronously; failures are non-fatal (partials are just wasted space).
  const syncJobIds = new Set(
    interrupted.filter((j) => j.type === 'sync.run').map((j) => j.id)
  );
  if (syncJobIds.size > 0) {
    import('./sync.ts').then(async ({ listSyncPlans, cleanupStalePartials, SYNC_FOLDER }) => {
      const plans = listSyncPlans();
      const roots = new Set<string>();
      for (const plan of plans) {
        for (const dest of plan.destinations) {
          roots.add(dest);
        }
      }
      for (const root of roots) {
        await cleanupStalePartials(root, syncJobIds).catch(() => {});
      }
    }).catch(() => {});
  }
}


export function startJobWorker() {
  if (workerStarted) return;
  workerStarted = true;
  recoverInterruptedJobs();
  workerTimer = setInterval(() => {
    recoverInterruptedJobs();
    tickWorker().catch((error) => console.error('[jobs] worker tick failed', error));
  }, 1000);
  workerTimer.unref?.();
  tickWorker().catch((error) => console.error('[jobs] initial tick failed', error));
}

export function stopJobWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  workerStarted = false;
}

export async function drainJobWorker(timeoutMs = 10_000) {
  stopJobWorker();
  const deadline = Date.now() + Math.max(0, timeoutMs);
  while (runningJobs.size > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { drained: runningJobs.size === 0, running: runningJobs.size };
}
