import { randomUUID } from 'crypto';
import { getDb, buildAllowedUpdate, withTransaction } from './db.ts';
import { getResourceProfileConfig } from './resource-profile.ts';
import { createNotification } from './notifications.ts';
import { rebuildFileIndex } from './indexer.ts';
import { ensureThumbnail } from './thumbnails.ts';
import { runBackup, restoreBackup } from './backups.ts';
import { runOcr } from './ocr.ts';

export type JobType =
  | 'index.files'
  | 'index.photos'
  | 'thumbnail.generate'
  | 'backup.run'
  | 'backup.restore'
  | 'ocr.run'
  | 'zip.create'
  | 'file.move';

export type JobStatus = 'queued' | 'running' | 'paused' | 'cancelled' | 'failed' | 'completed';
export type JobResourceClass = 'cpu' | 'io' | 'media' | 'backup';

const JOB_RESOURCE_CLASS: Record<JobType, JobResourceClass> = {
  'index.files': 'io',
  'index.photos': 'io',
  'thumbnail.generate': 'media',
  'backup.run': 'backup',
  'backup.restore': 'backup',
  'ocr.run': 'cpu',
  'zip.create': 'cpu',
  'file.move': 'io',
};

let workerStarted = false;
let workerTimer: NodeJS.Timeout | null = null;
const runningJobs = new Set<string>();

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
    error: row.error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function addEvent(jobId: string, type: string, message: string, data: any = {}) {
  getDb().prepare('INSERT INTO job_events (job_id, type, message, data) VALUES (?, ?, ?, ?)')
    .run(jobId, type, message, JSON.stringify(data || {}));
}

function updateProgress(jobId: string, progress: number, message?: string) {
  const safeProgress = Math.min(100, Math.max(0, Math.round(progress)));
  getDb().prepare('UPDATE jobs SET progress = ? WHERE id = ?').run(safeProgress, jobId);
  if (message) addEvent(jobId, 'progress', message, { progress: safeProgress });
}

function setJobStatus(jobId: string, status: JobStatus, patch: Record<string, any> = {}) {
  const normalized = {
    status,
    progress: patch.progress,
    result: patch.result !== undefined ? JSON.stringify(patch.result || {}) : undefined,
    error: patch.error,
  };
  const { setSql, values } = buildAllowedUpdate(normalized, {
    status: 'status',
    progress: 'progress',
    result: 'result',
    error: 'error',
  });
  const extra: string[] = [];
  if (status === 'running') extra.push('started_at = COALESCE(started_at, CURRENT_TIMESTAMP)');
  if (status === 'completed' || status === 'failed' || status === 'cancelled') extra.push('finished_at = CURRENT_TIMESTAMP');
  getDb().prepare(`UPDATE jobs SET ${[setSql, ...extra].filter(Boolean).join(', ')} WHERE id = ?`).run(...values, jobId);
}

export function enqueueJob(input: {
  type: JobType;
  name?: string;
  payload?: any;
  teamId?: string;
  userId?: number;
  priority?: number;
}) {
  const id = randomUUID();
  const resourceClass = JOB_RESOURCE_CLASS[input.type] || 'io';
  const name = input.name || input.type;
  withTransaction((db) => {
    db.prepare(`
      INSERT INTO jobs (id, team_id, user_id, type, status, resource_class, priority, progress, name, payload)
      VALUES (?, ?, ?, ?, 'queued', ?, ?, 0, ?, ?)
    `).run(id, input.teamId || null, input.userId || null, input.type, resourceClass, input.priority || 0, name, JSON.stringify(input.payload || {}));
    db.prepare('INSERT INTO job_events (job_id, type, message, data) VALUES (?, ?, ?, ?)')
      .run(id, 'queued', `${name} queued`, '{}');
  });
  startJobWorker();
  return id;
}

export function listJobs(options: { status?: string; limit?: number; teamId?: string; userId?: number } = {}) {
  const limit = Math.min(Math.max(1, options.limit || 50), 200);
  const values: any[] = [];
  let where = '1 = 1';
  if (options.status) {
    where += ' AND status = ?';
    values.push(options.status);
  }
  if (options.teamId || options.userId) {
    where += ' AND (team_id = ? OR user_id = ? OR team_id IS NULL)';
    values.push(options.teamId || null, options.userId || null);
  }
  values.push(limit);
  const rows = getDb().prepare(`
    SELECT * FROM jobs
    WHERE ${where}
    ORDER BY
      CASE status WHEN 'running' THEN 0 WHEN 'queued' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
      priority DESC,
      created_at DESC
    LIMIT ?
  `).all(...values) as any[];
  return rows.map(normalizeJob);
}

export function getJob(id: string) {
  return normalizeJob(getDb().prepare('SELECT * FROM jobs WHERE id = ?').get(id));
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

export function updateJobAction(id: string, action: 'pause' | 'resume' | 'cancel' | 'retry') {
  const job = getJob(id);
  if (!job) throw new Error('Job not found');
  if (action === 'pause' && job.status === 'queued') {
    setJobStatus(id, 'paused');
    addEvent(id, 'paused', 'Job paused');
  }
  if (action === 'resume' && job.status === 'paused') {
    setJobStatus(id, 'queued');
    addEvent(id, 'resumed', 'Job resumed');
    startJobWorker();
  }
  if (action === 'cancel' && (job.status === 'queued' || job.status === 'paused')) {
    setJobStatus(id, 'cancelled');
    addEvent(id, 'cancelled', 'Job cancelled');
  }
  if (action === 'retry' && (job.status === 'failed' || job.status === 'cancelled')) {
    getDb().prepare(`
      UPDATE jobs SET status = 'queued', progress = 0, error = NULL, result = '{}', started_at = NULL, finished_at = NULL
      WHERE id = ?
    `).run(id);
    addEvent(id, 'queued', 'Job queued for retry');
    startJobWorker();
  }
  return getJob(id);
}

function canStartResource(resourceClass: JobResourceClass) {
  const config = getResourceProfileConfig();
  const running = getDb().prepare(`
    SELECT resource_class as resourceClass, COUNT(*) as count
    FROM jobs
    WHERE status = 'running'
    GROUP BY resource_class
  `).all() as any[];
  const current = running.find((row) => row.resourceClass === resourceClass)?.count || 0;
  return current < config.concurrency[resourceClass];
}

function nextQueuedJob() {
  const rows = getDb().prepare(`
    SELECT * FROM jobs
    WHERE status = 'queued'
    ORDER BY priority DESC, created_at ASC
    LIMIT 20
  `).all() as any[];
  return rows.map(normalizeJob).find((job: any) => job && canStartResource(job.resourceClass));
}

async function executeJob(job: any) {
  runningJobs.add(job.id);
  setJobStatus(job.id, 'running');
  addEvent(job.id, 'running', `${job.name} started`);
  try {
    const payload = job.payload || {};
    const onProgress = (progress: number, message?: string) => updateProgress(job.id, progress, message);
    let result: any = {};

    if (job.type === 'index.files' || job.type === 'index.photos') {
      result = await rebuildFileIndex({ rootPath: payload.rootPath, teamId: job.teamId, onProgress });
    } else if (job.type === 'thumbnail.generate') {
      result = await ensureThumbnail(payload.path, payload.variant || 'grid');
    } else if (job.type === 'backup.run') {
      result = await runBackup({ ...payload, jobId: job.id, onProgress });
    } else if (job.type === 'backup.restore') {
      result = await restoreBackup({ ...payload, onProgress });
    } else if (job.type === 'ocr.run') {
      result = await runOcr({ ...payload, teamId: job.teamId, onProgress });
    } else if (job.type === 'zip.create') {
      throw new Error('zip.create jobs are queued, but folder zip export is still handled by /api/files in v1.');
    } else if (job.type === 'file.move') {
      throw new Error('file.move jobs are queued, but move execution is still handled by /api/files/move in v1.');
    }

    setJobStatus(job.id, 'completed', { progress: 100, result });
    addEvent(job.id, 'completed', `${job.name} completed`, result);
    createNotification({
      teamId: job.teamId,
      userId: job.userId,
      title: 'Job completed',
      message: job.name,
      tone: 'success',
      sourceType: 'job',
      sourceId: job.id,
    });
  } catch (err: any) {
    setJobStatus(job.id, 'failed', { error: err.message || 'Job failed' });
    addEvent(job.id, 'failed', err.message || 'Job failed');
    createNotification({
      teamId: job.teamId,
      userId: job.userId,
      title: 'Job failed',
      message: `${job.name}: ${err.message || 'Unknown error'}`,
      tone: 'danger',
      sourceType: 'job',
      sourceId: job.id,
    });
  } finally {
    runningJobs.delete(job.id);
  }
}

async function tickWorker() {
  if (runningJobs.size > 8) return;
  let job = nextQueuedJob();
  while (job) {
    executeJob(job);
    job = nextQueuedJob();
  }
}

export function startJobWorker() {
  if (workerStarted) return;
  workerStarted = true;
  getDb().prepare("UPDATE jobs SET status = 'queued', error = 'Recovered after restart' WHERE status = 'running'").run();
  workerTimer = setInterval(() => {
    tickWorker().catch((err) => console.error('[jobs] worker tick failed', err));
  }, 1500);
  tickWorker().catch((err) => console.error('[jobs] initial tick failed', err));
}

export function stopJobWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
  workerStarted = false;
}
