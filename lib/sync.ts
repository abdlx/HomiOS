/**
 * Drive-to-drive local protection and backup sync engine for HomiOS.
 *
 * Protection Modes:
 * 1. Mirror: Destination reflects source exactly, propagating file additions, modifications, and deletions.
 * 2. Backup: Preserves destination files. Additions and modifications are copied; source deletions are not removed.
 * 3. Versioned: Overwritten or deleted files on the source are preserved into timestamped snapshot folders
 *    (`<destination>/HomiOS-Backups/<slug>/.homios-versions/<timestamp>/`) with configurable retention pruning.
 *
 * Emits rich lifecycle telemetry (Scanning -> Comparing -> Copying -> Verifying -> Completed)
 * with file count, byte progress, transfer speed, and ETA calculations.
 */
import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { getDb, withTransaction } from './db.ts';

// ── Protection Health ──────────────────────────────────────────────────────

/**
 * Canonical protection-health states for a sync plan.
 *
 * Decision order (evaluated top-to-bottom; first match wins):
 *   no plan              → unprotected
 *   active job running   → syncing
 *   destination missing  → at_risk
 *   last run failed      → at_risk
 *   never succeeded      → not_yet_protected
 *   success too old      → overdue
 *   recent success       → healthy
 */
export type ProtectionHealth =
  | 'healthy'
  | 'overdue'
  | 'at_risk'
  | 'syncing'
  | 'not_yet_protected'
  | 'unprotected';

export interface ProtectionHealthResult {
  planId: string | null;
  health: ProtectionHealth;
  reason: string;
  lastSuccessAt: string | null;
  nextRunAt: string | null;
}

export const SYNC_FOLDER = 'HomiOS-Backups';
export const VERSIONS_FOLDER = '.homios-versions';

export type SyncSchedule = 'manual' | 'hourly' | 'six_hourly' | 'daily' | 'weekly';
export type ProtectionMode = 'mirror' | 'backup' | 'versioned';

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
  sourceUuids: string[];
  destinationUuids: string[];
  mode: ProtectionMode;
  mirrorDeletes: boolean;
  retentionDays: number;
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
  const mirrorDeletes = !!row.mirror_deletes;
  const mode = (row.mode || (mirrorDeletes ? 'mirror' : 'backup')) as ProtectionMode;
  return {
    id: row.id,
    teamId: row.team_id,
    userId: row.user_id,
    name: row.name,
    sources: parseList(row.sources),
    destinations: parseList(row.destinations),
    sourceUuids: parseList(row.source_uuids),
    destinationUuids: parseList(row.destination_uuids),
    mode,
    mirrorDeletes: mode === 'mirror' || mirrorDeletes,
    retentionDays: Number(row.retention_days) || 30,
    schedule: (row.schedule || 'manual') as SyncSchedule,
    enabled: !!row.enabled,
    lastRunAt: row.last_run_at,
    lastStatus: row.last_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

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

function slugForSource(sourcePath: string): string {
  const base = path.basename(sourcePath) || sourcePath.replace(/[:\\/]/g, '') || 'root';
  const clean = base.replace(/[^A-Za-z0-9._-]/g, '-').replace(/^-+|-+$/g, '');
  return clean || 'root';
}

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

export function listSyncPlans(teamId?: string | null, userId?: number | null): SyncPlan[] {
  return getDb().prepare(`
    SELECT * FROM sync_plans
    WHERE ? IS NULL OR team_id = ? OR user_id = ? OR (team_id IS NULL AND user_id IS NULL)
    ORDER BY created_at DESC
  `).all(teamId || null, teamId || null, userId || null).map(normalizePlan).filter(Boolean) as SyncPlan[];
}

export function getSyncPlan(id: string): SyncPlan | null {
  return normalizePlan(getDb().prepare('SELECT * FROM sync_plans WHERE id = ?').get(id));
}

export function canAccessPlan(plan: SyncPlan, session: { teamId?: string; userId?: number }): boolean {
  return (!!plan.teamId && plan.teamId === session.teamId) || plan.userId === session.userId || (!plan.teamId && !plan.userId);
}

function validateSchedule(schedule: any): SyncSchedule {
  const value = String(schedule || 'manual') as SyncSchedule;
  if (!(value in SCHEDULE_MINUTES)) throw new Error(`Unknown schedule: ${schedule}`);
  return value;
}

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
  teamId?: string | null;
  userId?: number | null;
  name: string;
  sources: string[];
  destinations: string[];
  sourceUuids?: string[];
  destinationUuids?: string[];
  mode?: ProtectionMode;
  mirrorDeletes?: boolean;
  retentionDays?: number;
  schedule?: SyncSchedule;
  enabled?: boolean;
}): string {
  const name = String(input.name || '').trim().slice(0, 120);
  if (!name) throw new Error('Name is required');
  const sources = uniquePaths(input.sources);
  const destinations = uniquePaths(input.destinations);
  assertUsablePairs(sources, destinations);
  const schedule = validateSchedule(input.schedule);
  const mode = input.mode || (input.mirrorDeletes ? 'mirror' : 'backup');
  const mirrorDeletes = mode === 'mirror';
  const retentionDays = Number(input.retentionDays) || 30;

  const id = randomUUID();
  withTransaction((db) => {
    db.prepare(`
      INSERT INTO sync_plans (
        id, team_id, user_id, name, sources, destinations, source_uuids, destination_uuids,
        mode, mirror_deletes, retention_days, schedule, enabled
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.teamId || null,
      input.userId || null,
      name,
      JSON.stringify(sources),
      JSON.stringify(destinations),
      JSON.stringify(input.sourceUuids || []),
      JSON.stringify(input.destinationUuids || []),
      mode,
      mirrorDeletes ? 1 : 0,
      retentionDays,
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
  sourceUuids?: string[];
  destinationUuids?: string[];
  mode?: ProtectionMode;
  mirrorDeletes?: boolean;
  retentionDays?: number;
  schedule?: SyncSchedule;
  enabled?: boolean;
}): SyncPlan | null {
  const existing = getSyncPlan(id);
  if (!existing) throw new Error('Sync plan not found');

  const mode = patch.mode !== undefined
    ? patch.mode
    : patch.mirrorDeletes !== undefined
      ? (patch.mirrorDeletes ? 'mirror' : 'backup')
      : existing.mode;
  const next = {
    name: patch.name !== undefined ? String(patch.name).trim().slice(0, 120) : existing.name,
    sources: patch.sources !== undefined ? uniquePaths(patch.sources) : existing.sources,
    destinations: patch.destinations !== undefined ? uniquePaths(patch.destinations) : existing.destinations,
    sourceUuids: patch.sourceUuids !== undefined ? patch.sourceUuids : existing.sourceUuids,
    destinationUuids: patch.destinationUuids !== undefined ? patch.destinationUuids : existing.destinationUuids,
    mode,
    mirrorDeletes: mode === 'mirror' ? true : patch.mirrorDeletes !== undefined ? !!patch.mirrorDeletes : existing.mirrorDeletes,
    retentionDays: patch.retentionDays !== undefined ? Number(patch.retentionDays) : existing.retentionDays,
    schedule: patch.schedule !== undefined ? validateSchedule(patch.schedule) : existing.schedule,
    enabled: patch.enabled !== undefined ? !!patch.enabled : existing.enabled,
  };
  if (!next.name) throw new Error('Name is required');
  assertUsablePairs(next.sources, next.destinations);

  getDb().prepare(`
    UPDATE sync_plans
    SET name = ?, sources = ?, destinations = ?, source_uuids = ?, destination_uuids = ?,
        mode = ?, mirror_deletes = ?, retention_days = ?, schedule = ?, enabled = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    next.name,
    JSON.stringify(next.sources),
    JSON.stringify(next.destinations),
    JSON.stringify(next.sourceUuids),
    JSON.stringify(next.destinationUuids),
    next.mode,
    next.mirrorDeletes ? 1 : 0,
    next.retentionDays,
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

type SyncTotals = {
  filesCopied: number;
  filesSkipped: number;
  filesDeleted: number;
  bytesCopied: number;
  filesTotal: number;
  bytesTotal: number;
};

/** Scan directory tree to discover total files and size for accurate telemetry. */
async function scanDirectory(source: string, skipPaths: string[]): Promise<{ count: number; bytes: number }> {
  let count = 0;
  let bytes = 0;

  const walk = async (dir: string) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (skipPaths.some((skip) => isInside(skip, full))) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile()) {
        const stat = await fsp.stat(full).catch(() => null);
        if (stat) {
          count += 1;
          bytes += stat.size;
        }
      }
    }
  };

  await walk(source);
  return { count, bytes };
}

/** Prune version snapshots older than retentionDays */
async function pruneVersionSnapshots(versionsDir: string, retentionDays: number) {
  if (retentionDays <= 0) return;
  const entries = await fsp.readdir(versionsDir, { withFileTypes: true }).catch(() => []);
  const maxAgeMs = retentionDays * 24 * 3600 * 1000;
  const now = Date.now();

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const full = path.join(versionsDir, entry.name);
    const stat = await fsp.stat(full).catch(() => null);
    if (stat && (now - stat.mtimeMs) > maxAgeMs) {
      await fsp.rm(full, { recursive: true, force: true }).catch(() => {});
    }
  }
}

/**
 * Remove partial files that belong to a specific interrupted/failed HomiOS job.
 *
 * Cleanup is job-aware: it only removes files whose name encodes a job ID that
 * is no longer actively running. This prevents one live sync from deleting
 * another live sync's in-progress partial writes.
 *
 * @param destRoot - The backup destination root to scan (not recursive into sub-dirs beyond SYNC_FOLDER).
 * @param interruptedJobIds - Set of job IDs confirmed as interrupted/failed.
 */
export async function cleanupStalePartials(destRoot: string, interruptedJobIds: Set<string>): Promise<void> {
  if (interruptedJobIds.size === 0) return;
  // Partial filename format: .{basename}.homios-partial-{jobId}-{randomUUID}
  // Job IDs themselves may contain hyphens (e.g. 'sync-job-abc123' or a UUID),
  // so we capture the segment between 'homios-partial-' and the last '-{8hex-...}'
  // by splitting on the known UUID suffix pattern at the end.
  const PARTIAL_PREFIX = '.homios-partial-';

  const scanDir = async (dir: string) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await scanDir(full);
        continue;
      }
      const idx = entry.name.indexOf(PARTIAL_PREFIX);
      if (idx === -1) continue;

      // Everything after 'homios-partial-' is: {jobId}-{randomSuffix}
      // The randomSuffix is a UUID (8-4-4-4-12 hex groups separated by hyphens).
      // We extract the jobId by removing the trailing UUID from the string.
      const afterPrefix = entry.name.slice(idx + PARTIAL_PREFIX.length);
      // UUID pattern at the end: -xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
      const trailingUuidMatch = /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(afterPrefix);
      const embeddedJobId = trailingUuidMatch
        ? afterPrefix.slice(0, trailingUuidMatch.index)
        : afterPrefix; // fallback: whole thing is the jobId

      if (interruptedJobIds.has(embeddedJobId)) {
        await fsp.rm(full, { force: true }).catch(() => {});
      }
    }
  };

  await scanDir(destRoot).catch(() => {});
}

/** Execute copy/mirror with mode handling (mirror, backup, versioned) */
async function executeDirectorySync(
  source: string,
  target: string,
  options: {
    mode: ProtectionMode;
    skipPaths: string[];
    totals: SyncTotals;
    versionTimestamp: string;
    partialJobId: string;
    onProgressUpdate: (currentFile?: string) => void;
  }
): Promise<void> {
  await fsp.mkdir(target, { recursive: true });
  const entries = await fsp.readdir(source, { withFileTypes: true });
  const keep = new Set<string>();

  const versionsDir = path.join(target, VERSIONS_FOLDER);
  const currentVersionSnapshot = path.join(versionsDir, options.versionTimestamp);

  for (const entry of entries) {
    const sourceEntry = path.join(source, entry.name);
    if (options.skipPaths.some((skip) => isInside(skip, sourceEntry))) continue;
    if (entry.name === VERSIONS_FOLDER || entry.name === SYNC_FOLDER) continue;
    if (entry.isSymbolicLink()) continue;
    keep.add(entry.name);
    const targetEntry = path.join(target, entry.name);

    if (entry.isDirectory()) {
      await executeDirectorySync(sourceEntry, targetEntry, options);
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
      // ── Atomic write pipeline ────────────────────────────────────────────
      // Partial filename encodes jobId so cleanup is always job-aware.
      // A second randomUUID() suffix prevents name collisions when the same
      // file is written by concurrent runs (e.g., different destinations).
      const partialPath = path.join(
        path.dirname(targetEntry),
        `.${path.basename(targetEntry)}.homios-partial-${options.partialJobId}-${randomUUID()}`
      );

      try {
        // Step 1 (versioned only): archive the existing destination BEFORE
        // touching it. If this fails, the existing backup is untouched and the
        // error propagates — we never replace a live backup with an incomplete
        // new copy when the version archive itself failed.
        if (existing && options.mode === 'versioned') {
          const versionTarget = path.join(currentVersionSnapshot, entry.name);
          const versionPartial = versionTarget + '.homios-partial-' + options.partialJobId + '-' + randomUUID();
          await fsp.mkdir(path.dirname(versionTarget), { recursive: true });
          try {
            await fsp.copyFile(targetEntry, versionPartial);
            const origStat = await fsp.stat(targetEntry);
            const partialStat = await fsp.stat(versionPartial);
            if (origStat.size !== partialStat.size) {
              throw new Error(`Size mismatch during version archive of ${entry.name}`);
            }
            await fsp.rename(versionPartial, versionTarget);
          } catch (err) {
            await fsp.rm(versionPartial, { force: true }).catch(() => {});
            throw err;
          }
        }

        // Step 2: copy source into partial destination (same filesystem → rename is atomic).
        await fsp.copyFile(sourceEntry, partialPath);
        await fsp.utimes(partialPath, stat.atime, stat.mtime).catch(() => {});

        // Step 3: size verification — guard against truncated copies.
        const [srcStat, partialStat] = await Promise.all([
          fsp.stat(sourceEntry),
          fsp.stat(partialPath),
        ]);
        if (srcStat.size !== partialStat.size) {
          throw new Error(
            `Backup verification failed: size mismatch on "${entry.name}" ` +
            `(expected ${srcStat.size} bytes, got ${partialStat.size} bytes)`
          );
        }

        // Step 4: atomic rename — namespace update is now crash-safe.
        await fsp.rename(partialPath, targetEntry);

        options.totals.filesCopied += 1;
        options.totals.bytesCopied += stat.size;
      } catch (err) {
        // Remove the partial if it exists so stale data is not left behind.
        await fsp.rm(partialPath, { force: true }).catch(() => {});
        throw err;
      }
    }
    options.onProgressUpdate(entry.name);
  }

  // Deletions handling according to mode
  if (options.mode === 'mirror' || (options as any).mirrorDeletes) {
    const targetEntries = await fsp.readdir(target, { withFileTypes: true }).catch(() => []);
    for (const entry of targetEntries) {
      if (entry.name === VERSIONS_FOLDER || keep.has(entry.name)) continue;
      // Skip any partial files that belong to the current job — they are
      // mid-flight writes, not orphans.
      if (entry.name.includes('.homios-partial-')) continue;
      await fsp.rm(path.join(target, entry.name), { recursive: true, force: true });
      options.totals.filesDeleted += 1;
    }
  } else if (options.mode === 'versioned') {
    const targetEntries = await fsp.readdir(target, { withFileTypes: true }).catch(() => []);
    for (const entry of targetEntries) {
      if (entry.name === VERSIONS_FOLDER || keep.has(entry.name)) continue;
      if (entry.name.includes('.homios-partial-')) continue;
      const targetPath = path.join(target, entry.name);
      const versionTarget = path.join(currentVersionSnapshot, entry.name);
      // Archive deleted source files before removal (errors propagate).
      await fsp.mkdir(path.dirname(versionTarget), { recursive: true });
      await fsp.rename(targetPath, versionTarget).catch(async () => {
        const versionPartial = versionTarget + '.homios-partial-' + options.partialJobId + '-' + randomUUID();
        try {
          await fsp.copyFile(targetPath, versionPartial);
          const origStat = await fsp.stat(targetPath);
          const partialStat = await fsp.stat(versionPartial);
          if (origStat.size !== partialStat.size) {
            throw new Error(`Size mismatch during version archive of ${entry.name}`);
          }
          await fsp.rename(versionPartial, versionTarget);
        } catch (err) {
          await fsp.rm(versionPartial, { force: true }).catch(() => {});
          throw err;
        }
        await fsp.rm(targetPath, { recursive: true, force: true });
      });
      options.totals.filesDeleted += 1;
    }
  }
}

export async function runSyncPlan(input: {
  planId: string;
  jobId?: string;
  onProgress?: (progress: number, message?: string, data?: any) => void;
}) {
  const db = getDb();
  const plan = getSyncPlan(input.planId);
  if (!plan) throw new Error('Sync plan not found');

  // A unique ID embedded in every partial filename produced by this run.
  // Always uses randomUUID() even when a jobId is provided so filenames are
  // globally unique and cleanup is unambiguous.
  const partialJobId = input.jobId || randomUUID();

  const slugs = buildSlugMap(plan.sources);
  const pairs: { source: string; destination: string }[] = [];
  for (const destination of plan.destinations) {
    for (const source of plan.sources) {
      pairs.push({ source, destination });
    }
  }

  const runId = randomUUID();
  db.prepare(`
    INSERT INTO sync_runs (id, plan_id, job_id, status, phase)
    VALUES (?, ?, ?, 'running', 'scanning')
  `).run(runId, plan.id, input.jobId || null);

  const totals: SyncTotals = {
    filesCopied: 0,
    filesSkipped: 0,
    filesDeleted: 0,
    bytesCopied: 0,
    filesTotal: 0,
    bytesTotal: 0,
  };
  const results: PairResult[] = [];
  const startTime = Date.now();
  let lastReport = 0;

  // Phase 1: Scanning
  input.onProgress?.(2, `Scanning source drives...`, {
    phase: 'scanning',
    filesTotal: 0,
    bytesTotal: 0,
  });

  for (const pair of pairs) {
    if (fs.existsSync(pair.source)) {
      const scan = await scanDirectory(pair.source, [path.join(pair.source, SYNC_FOLDER)]);
      totals.filesTotal += scan.count;
      totals.bytesTotal += scan.bytes;
    }
  }

  db.prepare('UPDATE sync_runs SET files_total = ?, bytes_total = ? WHERE id = ?')
    .run(totals.filesTotal, totals.bytesTotal, runId);

  const persist = (status: string, phase = 'copying') => {
    db.prepare(`
      UPDATE sync_runs
      SET files_copied = ?, files_skipped = ?, files_deleted = ?, bytes_copied = ?, pairs = ?, status = ?, phase = ?
      WHERE id = ?
    `).run(
      totals.filesCopied,
      totals.filesSkipped,
      totals.filesDeleted,
      totals.bytesCopied,
      JSON.stringify(results),
      status,
      phase,
      runId
    );
  };

  const versionTimestamp = new Date().toISOString().replace(/[:.]/g, '-');

  try {
    for (const [index, pair] of pairs.entries()) {
      const targetRoot = path.join(pair.destination, SYNC_FOLDER, slugs.get(pair.source) || slugForSource(pair.source));
      const before = { ...totals };

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
        skipPair(`Source drive is not available (${pair.source})`);
        continue;
      }
      if (!fs.existsSync(pair.destination)) {
        skipPair(`Destination drive is not available (${pair.destination})`);
        continue;
      }

      // Phase 2: Comparing & Copying
      input.onProgress?.(5, `Comparing ${pair.source} → ${pair.destination}`, {
        phase: 'comparing',
        filesTotal: totals.filesTotal,
        bytesTotal: totals.bytesTotal,
      });

      try {
        await executeDirectorySync(pair.source, targetRoot, {
          mode: plan.mode,
          skipPaths: [path.join(pair.source, SYNC_FOLDER)],
          totals,
          versionTimestamp,
          partialJobId,
          onProgressUpdate: (currentFile) => {
            const now = Date.now();
            if (now - lastReport < 800) return;
            lastReport = now;
            persist('running', 'copying');

            const elapsedSec = (now - startTime) / 1000;
            const speedBps = elapsedSec > 0 ? Math.round(totals.bytesCopied / elapsedSec) : 0;
            const remainingBytes = Math.max(0, totals.bytesTotal - totals.bytesCopied);
            const etaSeconds = speedBps > 0 ? Math.round(remainingBytes / speedBps) : 0;

            const processedFiles = totals.filesCopied + totals.filesSkipped;
            const percent = totals.filesTotal > 0
              ? Math.min(99, Math.round((processedFiles / totals.filesTotal) * 100))
              : Math.min(99, Math.round((index / pairs.length) * 100));

            input.onProgress?.(
              percent,
              `${totals.filesCopied} copied, ${totals.filesSkipped} up to date — ${pair.source} → ${pair.destination}`,
              {
                phase: 'copying',
                bytesTransferred: totals.bytesCopied,
                bytesTotal: totals.bytesTotal,
                filesTransferred: processedFiles,
                filesTotal: totals.filesTotal,
                speedBps,
                etaSeconds,
                currentFile,
              }
            );
          },
        });

        if (plan.mode === 'versioned') {
          const versionsDir = path.join(targetRoot, VERSIONS_FOLDER);
          await pruneVersionSnapshots(versionsDir, plan.retentionDays);
        }

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
    const skipped = results.filter((result) => result.status === 'skipped');
    const status = failed.length === 0 && skipped.length === 0
      ? 'completed'
      : failed.length === results.length || skipped.length === results.length
        ? 'failed'
        : 'partial';

    persist(status, 'completed');
    db.prepare('UPDATE sync_runs SET finished_at = CURRENT_TIMESTAMP WHERE id = ?').run(runId);
    db.prepare('UPDATE sync_plans SET last_run_at = CURRENT_TIMESTAMP, last_status = ? WHERE id = ?').run(status, plan.id);

    const totalSeconds = Math.round((Date.now() - startTime) / 1000);
    const durationFormatted = totalSeconds >= 60
      ? `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`
      : `${totalSeconds}s`;

    const summaryMessage = `Backup completed — ${totals.filesCopied} files · ${((totals.bytesCopied) / 1024 / 1024 / 1024).toFixed(1)} GB · ${durationFormatted}`;
    input.onProgress?.(100, summaryMessage, {
      phase: 'completed',
      bytesTransferred: totals.bytesCopied,
      bytesTotal: totals.bytesTotal,
      filesTransferred: totals.filesCopied + totals.filesSkipped,
      filesTotal: totals.filesTotal,
      speedBps: 0,
      etaSeconds: 0,
    });

    if (status === 'failed') {
      const reason = failed[0]?.error || skipped[0]?.error || 'Every sync target failed';
      throw new Error(reason);
    }
    return { runId, ...totals, pairs: results, duration: durationFormatted };
  } catch (err: any) {
    persist('failed', 'failed');
    db.prepare('UPDATE sync_runs SET error = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(err?.message || 'Sync failed', runId);
    db.prepare("UPDATE sync_plans SET last_run_at = CURRENT_TIMESTAMP, last_status = 'failed' WHERE id = ?").run(plan.id);
    throw err;
  }
}

// ── Protection Health ─────────────────────────────────────────────────────

/**

 * Compute the canonical protection health for a sync plan.
 *
 * Decision order (first match wins):
 *   no plan              → unprotected
 *   active job running   → syncing
 *   destination missing  → at_risk
 *   last run failed      → at_risk
 *   never succeeded      → not_yet_protected
 *   success too old      → overdue  (10 % grace window for scheduler jitter)
 *   recent success       → healthy
 */
export function getProtectionHealth(planId: string): ProtectionHealthResult {
  const plan = getSyncPlan(planId);
  if (!plan) {
    return { planId, health: 'unprotected', reason: 'No protection plan exists', lastSuccessAt: null, nextRunAt: null };
  }

  // Is a job actively running right now?
  if (hasActiveSyncRun(planId)) {
    return {
      planId,
      health: 'syncing',
      reason: 'Backup is currently running',
      lastSuccessAt: plan.lastRunAt,
      nextRunAt: null,
    };
  }

  // Check destination accessibility
  const anyDestAccessible = plan.destinations.some((dest) => {
    try { return fs.existsSync(dest); } catch { return false; }
  });
  if (!anyDestAccessible) {
    return {
      planId,
      health: 'at_risk',
      reason: plan.destinations.length === 0
        ? 'No destination configured'
        : `Destination is not accessible: ${plan.destinations[0]}`,
      lastSuccessAt: plan.lastRunAt,
      nextRunAt: null,
    };
  }

  // Last run outcome
  if (plan.lastStatus === 'failed') {
    return {
      planId,
      health: 'at_risk',
      reason: 'Last protection run failed',
      lastSuccessAt: plan.lastRunAt,
      nextRunAt: null,
    };
  }

  // Has there ever been a successful run?
  // lastRunAt is only set on completion (completed or failed), so check lastStatus.
  if (!plan.lastRunAt || plan.lastStatus === null) {
    return {
      planId,
      health: 'not_yet_protected',
      reason: 'Protection plan exists but has never completed a successful backup',
      lastSuccessAt: null,
      nextRunAt: null,
    };
  }

  // Query actual last-success timestamp from run records
  const lastSuccessRow = getDb().prepare(`
    SELECT finished_at FROM sync_runs
    WHERE plan_id = ? AND status = 'completed'
    ORDER BY finished_at DESC LIMIT 1
  `).get(planId) as { finished_at: string } | undefined;

  if (!lastSuccessRow) {
    return {
      planId,
      health: 'not_yet_protected',
      reason: 'Protection plan exists but no successful run is recorded',
      lastSuccessAt: null,
      nextRunAt: null,
    };
  }

  const lastSuccessAt = lastSuccessRow.finished_at;
  const scheduleMinutes = SCHEDULE_MINUTES[plan.schedule];

  if (!scheduleMinutes) {
    // Manual schedule — Healthy if the last run was successful.
    return {
      planId,
      health: 'healthy',
      reason: 'Last backup completed successfully (manual schedule)',
      lastSuccessAt,
      nextRunAt: null,
    };
  }

  const lastSuccessMs = Date.parse(lastSuccessAt.replace(' ', 'T') + (lastSuccessAt.includes('Z') ? '' : 'Z'));
  const toleranceMs = scheduleMinutes * 60 * 1000 * 1.1; // 10% grace window
  const ageMs = Date.now() - lastSuccessMs;

  if (ageMs > toleranceMs) {
    const nextRunAt = new Date(lastSuccessMs + scheduleMinutes * 60 * 1000).toISOString();
    return {
      planId,
      health: 'overdue',
      reason: `Last successful backup was ${Math.round(ageMs / 60000)} min ago (schedule: every ${scheduleMinutes} min)`,
      lastSuccessAt,
      nextRunAt,
    };
  }

  const nextRunAt = new Date(lastSuccessMs + scheduleMinutes * 60 * 1000).toISOString();
  return {
    planId,
    health: 'healthy',
    reason: 'Backup is current',
    lastSuccessAt,
    nextRunAt,
  };
}

function isDue(plan: SyncPlan): boolean {
  const minutes = SCHEDULE_MINUTES[plan.schedule];
  if (!plan.enabled || !minutes) return false;
  if (!plan.lastRunAt) return true;
  const last = Date.parse(`${plan.lastRunAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(last)) return true;
  return Date.now() - last >= minutes * 60 * 1000;
}

let schedulerTimer: NodeJS.Timeout | null = null;

export async function tickSyncScheduler(): Promise<void> {
  const { enqueueJob } = await import('./jobs.ts');
  const plans = getDb().prepare("SELECT * FROM sync_plans WHERE enabled = 1 AND schedule != 'manual'")
    .all().map(normalizePlan).filter(Boolean) as SyncPlan[];
  for (const plan of plans) {
    if (!isDue(plan) || hasActiveSyncRun(plan.id)) continue;
    enqueueJob({
      type: 'sync.run',
      name: `Backup: ${plan.name}`,
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
