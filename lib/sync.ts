/**
 * Drive-to-drive backup sync.
 *
 * A sync plan fans several source drives out to several destination drives:
 * every source is mirrored into `<destination>/HomiOS-Backups/<slug>`.
 * Runs happen through the job queue (type `sync.run`, resource class `backup`),
 * so they are asynchronous, concurrency-limited and visible in Activity.
 *
 * Copies are incremental — a file whose size and mtime already match at the
 * destination is skipped — which makes repeat runs cheap.
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { getDb, withTransaction } from './db.ts';

/** Everything this feature writes lives under this folder on the destination. */
export const SYNC_FOLDER = 'HomiOS-Backups';

export type SyncSchedule = 'manual' | 'hourly' | 'six_hourly' | 'daily' | 'weekly';

const SCHEDULE_MINUTES: Record<SyncSchedule, number> = {
  manual: 0,
  hourly: 60,
  six_hourly: 360,
  daily: 1440,
  weekly: 10080,
};

export interface SyncPlan {
  id: string;
  teamId: string | null;
  userId: number | null;
  name: string;
  sources: string[];
  destinations: string[];
  mirrorDeletes: boolean;
  schedule: SyncSchedule;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  createdAt: string;
  updatedAt: string;
}

function parseList(value: any): string[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

function normalizePlan(row: any): SyncPlan | null {
  if (!row) return null;
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    name: row.name,
    sources: parseList(row.sources),
    destinations: parseList(row.destinations),
    mirrorDeletes: !!row.mirror_deletes,
    schedule: (row.schedule || 'manual') as SyncSchedule,
    enabled: !!row.enabled,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Absolute, control-character-free host path. Drive roots are admin-only territory. */
function normalizeDrivePath(input: any): string {
  const raw = String(input || '').trim();
  if (!raw) throw new Error('Path is required');
  if (/[\u0000-\u001f\u007f]/.test(raw)) throw new Error('Path contains invalid characters');
  const resolved = path.resolve(raw);
  if (!path.isAbsolute(resolved)) throw new Error(`Path must be absolute: ${raw}`);
  return resolved;
}

function uniquePaths(list: any): string[] {
  const seen = new Set<string>();
  for (const entry of Array.isArray(list) ? list : []) {
    seen.add(normalizeDrivePath(entry));
  }
  return [...seen];
}

/** `/mnt/photos` -> `photos`, `E:\` -> `E`, `/` -> `root`. */
function slugForSource(sourcePath: string): string {
  const base = path.basename(sourcePath) || sourcePath.replace(/[:\\/]/g, '') || 'root';
  const clean = base.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+|-+$/g, '');
  return clean || 'root';
}

/**
 * Folder name per source, disambiguated when two sources share a basename
 * (e.g. `/mnt/a/data` and `/mnt/b/data` both landing on one destination).
 */
function buildSlugMap(sources: string[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const source of sources) {
    const slug = slugForSource(source);
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }
  const map = new Map<string, string>();
  for (const source of sources) {
    const slug = slugForSource(source);
    const unique = (counts.get(slug) || 0) > 1
      ? `${slug}-${createHash('sha1').update(source).digest('hex').slice(0, 6)}`
      : slug;
    map.set(source, unique);
  }
  return map;
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

export function listSyncPlans(teamId: string, userId: number): SyncPlan[] {
  return getDb().prepare(`
    SELECT * FROM sync_plans
    WHERE team_id = ? OR user_id = ?
    ORDER BY created_at DESC
  `).all(teamId, userId).map(normalizePlan).filter(Boolean) as SyncPlan[];
}

export function getSyncPlan(id: string): SyncPlan | null {
  return normalizePlan(getDb().prepare('SELECT * FROM sync_plans WHERE id = ?').get(id));
}

/** A plan is visible to its owning user or anyone in its team. */
export function canAccessPlan(plan: SyncPlan, session: { teamId?: string; userId?: number }): boolean {
  return (!!plan.teamId && plan.teamId === session.teamId) || plan.userId === session.userId;
}

function validateSchedule(schedule: any): SyncSchedule {
  const value = String(schedule || 'manual') as SyncSchedule;
  // `manual` maps to 0 minutes, so test for membership rather than truthiness.
  if (!(value in SCHEDULE_MINUTES)) throw new Error(`Unknown schedule: ${schedule}`);
  return value;
}

/** Reject pairings that would copy a drive into itself (or into its own subtree). */
function assertUsablePairs(sources: string[], destinations: string[]): void {
  if (sources.length === 0) throw new Error('Select at least one source drive');
  if (destinations.length === 0) throw new Error('Select at least one destination drive');
  const usable = sources.some((source) =>
    destinations.some((destination) => !isInside(source, destination) && !isInside(destination, source))
  );
  if (!usable) {
    throw new Error('Sources and destinations overlap — pick destination drives outside the source drives');
  }
}

export function createSyncPlan(input: {
  teamId: string;
  userId: number;
  name: string;
  sources: string[];
  destinations: string[];
  mirrorDeletes?: boolean;
  schedule?: SyncSchedule;
  enabled?: boolean;
}): string {
  const name = String(input.name || '').trim().slice(0, 120);
  if (!name) throw new Error('Name is required');
  const sources = uniquePaths(input.sources);
  const destinations = uniquePaths(input.destinations);
  assertUsablePairs(sources, destinations);
  const schedule = validateSchedule(input.schedule);

  const id = randomUUID();
  withTransaction((db) => {
    db.prepare(`
      INSERT INTO sync_plans (id, team_id, user_id, name, sources, destinations, mirror_deletes, schedule, enabled)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.teamId,
      input.userId,
      name,
      JSON.stringify(sources),
      JSON.stringify(destinations),
      input.mirrorDeletes ? 1 : 0,
      schedule,
      input.enabled === false ? 0 : 1
    );
  });
  return id;
}

export function updateSyncPlan(id: string, patch: {
  name?: string;
  sources?: string[];
  destinations?: string[];
  mirrorDeletes?: boolean;
  schedule?: SyncSchedule;
  enabled?: boolean;
}): SyncPlan | null {
  const existing = getSyncPlan(id);
  if (!existing) throw new Error('Sync plan not found');

  const next = {
    name: patch.name !== undefined ? String(patch.name).trim().slice(0, 120) : existing.name,
    sources: patch.sources !== undefined ? uniquePaths(patch.sources) : existing.sources,
    destinations: patch.destinations !== undefined ? uniquePaths(patch.destinations) : existing.destinations,
    mirrorDeletes: patch.mirrorDeletes !== undefined ? !!patch.mirrorDeletes : existing.mirrorDeletes,
    schedule: patch.schedule !== undefined ? validateSchedule(patch.schedule) : existing.schedule,
    enabled: patch.enabled !== undefined ? !!patch.enabled : existing.enabled,
  };
  if (!next.name) throw new Error('Name is required');
  assertUsablePairs(next.sources, next.destinations);

  getDb().prepare(`
    UPDATE sync_plans
    SET name = ?, sources = ?, destinations = ?, mirror_deletes = ?, schedule = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    next.name,
    JSON.stringify(next.sources),
    JSON.stringify(next.destinations),
    next.mirrorDeletes ? 1 : 0,
    next.schedule,
    next.enabled ? 1 : 0,
    id
  );
  return getSyncPlan(id);
}

export function deleteSyncPlan(id: string): void {
  getDb().prepare('DELETE FROM sync_plans WHERE id = ?').run(id);
}

export function listSyncRuns(options: { planIds?: string[]; limit?: number } = {}) {
  const limit = Math.min(Math.max(1, options.limit || 25), 100);
  const planIds = options.planIds;
  if (planIds && planIds.length === 0) return [];
  const where = planIds ? `WHERE plan_id IN (${planIds.map(() => '?').join(', ')})` : '';
  const rows = getDb().prepare(`
    SELECT id, plan_id as planId, job_id as jobId, status, files_copied as filesCopied,
           files_skipped as filesSkipped, files_deleted as filesDeleted, bytes_copied as bytesCopied,
           pairs, error, created_at as createdAt, finished_at as finishedAt
    FROM sync_runs
    ${where}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...(planIds || []), limit) as any[];
  return rows.map((row) => ({ ...row, pairs: safeJson(row.pairs) }));
}

function safeJson(value: any): any[] {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** True when a run for this plan is already queued or in flight. */
export function hasActiveSyncRun(planId: string): boolean {
  const row = getDb().prepare(`
    SELECT 1 FROM jobs
    WHERE type = 'sync.run' AND status IN ('queued', 'running') AND payload LIKE ?
    LIMIT 1
  `).get(`%"planId":"${planId}"%`);
  return !!row;
}

type PairResult = {
  source: string;
  target: string;
  status: 'completed' | 'skipped' | 'failed';
  filesCopied: number;
  filesSkipped: number;
  filesDeleted: number;
  bytesCopied: number;
  error?: string;
};

type SyncTotals = { filesCopied: number; filesSkipped: number; filesDeleted: number; bytesCopied: number };

/**
 * Mirror one directory tree into another.
 *
 * Symlinks are skipped rather than followed: a link pointing back up the tree
 * would otherwise turn a sync into an infinite copy.
 */
async function mirrorDirectory(
  source: string,
  target: string,
  options: { mirrorDeletes: boolean; skipPaths: string[]; totals: SyncTotals; onFile: () => void }
): Promise<void> {
  await fsp.mkdir(target, { recursive: true });
  const entries = await fsp.readdir(source, { withFileTypes: true });
  const keep = new Set<string>();

  for (const entry of entries) {
    const sourceEntry = path.join(source, entry.name);
    if (options.skipPaths.some((skip) => isInside(skip, sourceEntry))) continue;
    if (entry.isSymbolicLink()) continue;
    keep.add(entry.name);
    const targetEntry = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await mirrorDirectory(sourceEntry, targetEntry, options);
      continue;
    }
    if (!entry.isFile()) continue;

    const stat = await fsp.stat(sourceEntry).catch(() => null);
    if (!stat) continue;
    const existing = await fsp.stat(targetEntry).catch(() => null);
    const unchanged = existing
      && existing.size === stat.size
      && Math.abs(existing.mtimeMs - stat.mtimeMs) < 2000;

    if (unchanged) {
      options.totals.filesSkipped += 1;
    } else {
      await fsp.copyFile(sourceEntry, targetEntry);
      await fsp.utimes(targetEntry, stat.atime, stat.mtime).catch(() => {});
      options.totals.filesCopied += 1;
      options.totals.bytesCopied += stat.size;
    }
    options.onFile();
  }

  if (!options.mirrorDeletes) return;
  const targetEntries = await fsp.readdir(target, { withFileTypes: true }).catch(() => []);
  for (const entry of targetEntries) {
    if (keep.has(entry.name)) continue;
    await fsp.rm(path.join(target, entry.name), { recursive: true, force: true });
    options.totals.filesDeleted += 1;
  }
}

/**
 * Execute a plan: every source into every non-overlapping destination.
 * Called by the job worker, never inline from a request handler.
 */
export async function runSyncPlan(input: {
  planId: string;
  jobId?: string;
  onProgress?: (progress: number, message?: string) => void;
}) {
  const db = getDb();
  const plan = getSyncPlan(input.planId);
  if (!plan) throw new Error('Sync plan not found');

  const slugs = buildSlugMap(plan.sources);
  const pairs: { source: string; destination: string }[] = [];
  for (const destination of plan.destinations) {
    for (const source of plan.sources) {
      pairs.push({ source, destination });
    }
  }

  const runId = randomUUID();
  db.prepare(`
    INSERT INTO sync_runs (id, plan_id, job_id, status)
    VALUES (?, ?, ?, 'running')
  `).run(runId, plan.id, input.jobId || null);

  const totals: SyncTotals = { filesCopied: 0, filesSkipped: 0, filesDeleted: 0, bytesCopied: 0 };
  const results: PairResult[] = [];
  let lastReport = 0;

  const persist = (status: string) => {
    db.prepare(`
      UPDATE sync_runs
      SET files_copied = ?, files_skipped = ?, files_deleted = ?, bytes_copied = ?, pairs = ?, status = ?
      WHERE id = ?
    `).run(
      totals.filesCopied,
      totals.filesSkipped,
      totals.filesDeleted,
      totals.bytesCopied,
      JSON.stringify(results),
      status,
      runId
    );
  };

  try {
    for (const [index, pair] of pairs.entries()) {
      const targetRoot = path.join(pair.destination, SYNC_FOLDER, slugs.get(pair.source) || slugForSource(pair.source));
      const before = { ...totals };
      const progress = Math.round((index / pairs.length) * 100);

      const skipPair = (error: string) => {
        results.push({
          source: pair.source,
          target: targetRoot,
          status: 'skipped',
          filesCopied: 0,
          filesSkipped: 0,
          filesDeleted: 0,
          bytesCopied: 0,
          error,
        });
        persist('running');
      };

      if (isInside(pair.source, pair.destination) || isInside(pair.destination, pair.source)) {
        skipPair('Source and destination overlap');
        continue;
      }
      if (!fs.existsSync(pair.source)) {
        skipPair('Source drive is not available');
        continue;
      }
      if (!fs.existsSync(pair.destination)) {
        skipPair('Destination drive is not available');
        continue;
      }

      input.onProgress?.(progress, `Syncing ${pair.source} → ${pair.destination}`);

      try {
        await mirrorDirectory(pair.source, targetRoot, {
          mirrorDeletes: plan.mirrorDeletes,
          // Never copy the backup folder into itself when a drive is both source and target.
          skipPaths: [path.join(pair.source, SYNC_FOLDER)],
          totals,
          onFile: () => {
            const now = Date.now();
            if (now - lastReport < 1000) return;
            lastReport = now;
            persist('running');
            input.onProgress?.(
              progress,
              `${totals.filesCopied} copied, ${totals.filesSkipped} up to date — ${pair.source} → ${pair.destination}`
            );
          },
        });
        results.push({
          source: pair.source,
          target: targetRoot,
          status: 'completed',
          filesCopied: totals.filesCopied - before.filesCopied,
          filesSkipped: totals.filesSkipped - before.filesSkipped,
          filesDeleted: totals.filesDeleted - before.filesDeleted,
          bytesCopied: totals.bytesCopied - before.bytesCopied,
        });
      } catch (err: any) {
        results.push({
          source: pair.source,
          target: targetRoot,
          status: 'failed',
          filesCopied: totals.filesCopied - before.filesCopied,
          filesSkipped: totals.filesSkipped - before.filesSkipped,
          filesDeleted: totals.filesDeleted - before.filesDeleted,
          bytesCopied: totals.bytesCopied - before.bytesCopied,
          error: err?.message || 'Sync failed',
        });
      }
      persist('running');
    }

    const failed = results.filter((result) => result.status === 'failed');
    const status = failed.length === 0 ? 'completed' : failed.length === results.length ? 'failed' : 'partial';
    persist(status);
    db.prepare('UPDATE sync_runs SET finished_at = CURRENT_TIMESTAMP WHERE id = ?').run(runId);
    db.prepare('UPDATE sync_plans SET last_run_at = CURRENT_TIMESTAMP, last_status = ? WHERE id = ?').run(status, plan.id);
    input.onProgress?.(100, `${totals.filesCopied} files copied, ${totals.filesSkipped} already up to date`);

    if (status === 'failed') {
      throw new Error(failed[0]?.error || 'Every sync target failed');
    }
    return { runId, ...totals, pairs: results };
  } catch (err: any) {
    persist('failed');
    db.prepare('UPDATE sync_runs SET error = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(err?.message || 'Sync failed', runId);
    db.prepare("UPDATE sync_plans SET last_run_at = CURRENT_TIMESTAMP, last_status = 'failed' WHERE id = ?").run(plan.id);
    throw err;
  }
}

function isDue(plan: SyncPlan): boolean {
  const minutes = SCHEDULE_MINUTES[plan.schedule];
  if (!plan.enabled || !minutes) return false;
  if (!plan.lastRunAt) return true;
  // SQLite CURRENT_TIMESTAMP is UTC without a zone marker.
  const last = Date.parse(`${plan.lastRunAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= minutes * 60 * 1000;
}

let schedulerTimer: NodeJS.Timeout | null = null;

/** Enqueue scheduled plans that have come due. Safe to call repeatedly. */
export async function tickSyncScheduler(): Promise<void> {
  const { enqueueJob } = await import('./jobs.ts');
  const plans = getDb().prepare("SELECT * FROM sync_plans WHERE enabled = 1 AND schedule != 'manual'")
    .all().map(normalizePlan).filter(Boolean) as SyncPlan[];
  for (const plan of plans) {
    if (!isDue(plan) || hasActiveSyncRun(plan.id)) continue;
    enqueueJob({
      type: 'sync.run',
      name: `Backup sync: ${plan.name}`,
      payload: { planId: plan.id },
      teamId: plan.teamId || undefined,
      userId: plan.userId || undefined,
      priority: 5,
    });
  }
}

export function startSyncScheduler(): void {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => {
    tickSyncScheduler().catch((err) => console.error('[sync] scheduler tick failed', err));
  }, 60 * 1000);
  tickSyncScheduler().catch((err) => console.error('[sync] initial scheduler tick failed', err));
}

export function stopSyncScheduler(): void {
  if (schedulerTimer) clearInterval(schedulerTimer);
  schedulerTimer = null;
}
