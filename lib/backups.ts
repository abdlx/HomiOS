import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { randomUUID } from 'crypto';
import { ZipArchive } from 'archiver';
import { getDb, withTransaction } from './db.ts';
import { uploadBackupToS3 } from './s3.ts';

const BACKUP_ROOT = process.env.BACKUP_WORK_DIR || path.join(process.cwd(), 'data', '.cache', 'backups');

async function copyRecursive(source: string, destination: string, onProgress?: (bytes: number) => void) {
  const stat = await fsp.stat(source);
  if (stat.isDirectory()) {
    await fsp.mkdir(destination, { recursive: true });
    const entries = await fsp.readdir(source, { withFileTypes: true });
    for (const entry of entries) {
      await copyRecursive(path.join(source, entry.name), path.join(destination, entry.name), onProgress);
    }
    return;
  }

  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const read = fs.createReadStream(source);
    const write = fs.createWriteStream(destination);
    read.on('data', (chunk) => onProgress?.(chunk.length));
    read.on('error', reject);
    write.on('error', reject);
    write.on('finish', resolve);
    read.pipe(write);
  });
}

async function collectFiles(source: string): Promise<{ source: string; relative: string; size: number }[]> {
  const stat = await fsp.stat(source);
  if (!stat.isDirectory()) return [{ source, relative: path.basename(source), size: stat.size }];
  const files: { source: string; relative: string; size: number }[] = [];
  const walk = async (dir: string) => {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        const s = await fsp.stat(full);
        files.push({ source: full, relative: path.relative(source, full), size: s.size });
      }
    }
  };
  await walk(source);
  return files;
}

function zipDirectory(source: string, zipPath: string) {
  return new Promise<void>(async (resolve, reject) => {
    await fsp.mkdir(path.dirname(zipPath), { recursive: true });
    const output = createWriteStream(zipPath);
    const archive = new ZipArchive({ zlib: { level: Number(process.env.ZIP_COMPRESSION_LEVEL || 3) } });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(source, false);
    archive.finalize();
  });
}

export function listBackupPlans(teamId: string, userId: number) {
  return getDb().prepare(`
    SELECT id, name, source_path as sourcePath, destination_type as destinationType, destination, schedule, enabled, created_at as createdAt
    FROM backup_plans
    WHERE team_id = ? OR user_id = ?
    ORDER BY created_at DESC
  `).all(teamId, userId);
}

export function listBackupRuns(teamId: string, userId: number, limit = 50) {
  return getDb().prepare(`
    SELECT r.id, r.plan_id as planId, r.job_id as jobId, r.status, r.source_path as sourcePath, r.destination, r.bytes_total as bytesTotal,
           r.bytes_copied as bytesCopied, r.error, r.created_at as createdAt, r.finished_at as finishedAt
    FROM backup_runs r
    LEFT JOIN backup_plans p ON p.id = r.plan_id
    WHERE p.team_id = ? OR p.user_id = ? OR r.plan_id IS NULL
    ORDER BY r.created_at DESC
    LIMIT ?
  `).all(teamId, userId, Math.min(Math.max(1, limit), 100));
}

export function createBackupPlan(input: {
  teamId: string;
  userId: number;
  name: string;
  sourcePath: string;
  destinationType: 'local' | 's3';
  destination: string;
  schedule?: string;
}) {
  const id = randomUUID();
  withTransaction((db) => {
    db.prepare(`
      INSERT INTO backup_plans (id, team_id, user_id, name, source_path, destination_type, destination, schedule)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.teamId, input.userId, input.name, input.sourcePath, input.destinationType, input.destination, input.schedule || null);
  });
  return id;
}

export async function runBackup(input: {
  planId?: string;
  jobId?: string;
  sourcePath?: string;
  destinationType?: 'local' | 's3';
  destination?: string;
  onProgress?: (progress: number, message?: string) => void;
}) {
  const db = getDb();
  const plan = input.planId ? db.prepare('SELECT * FROM backup_plans WHERE id = ?').get(input.planId) as any : null;
  const sourcePath = path.resolve(plan?.source_path || input.sourcePath);
  const destinationType = (plan?.destination_type || input.destinationType || 'local') as 'local' | 's3';
  const destination = String(plan?.destination || input.destination || '');
  if (!sourcePath || !destination) throw new Error('Backup source and destination are required');

  const files = await collectFiles(sourcePath);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  const runId = randomUUID();
  db.prepare(`
    INSERT INTO backup_runs (id, plan_id, job_id, status, source_path, destination, bytes_total)
    VALUES (?, ?, ?, 'running', ?, ?, ?)
  `).run(runId, input.planId || null, input.jobId || null, sourcePath, destination, total);

  let copied = 0;
  const updateProgress = (bytes: number) => {
    copied += bytes;
    const progress = total > 0 ? Math.min(99, Math.round((copied / total) * 100)) : 99;
    db.prepare('UPDATE backup_runs SET bytes_copied = ? WHERE id = ?').run(copied, runId);
    input.onProgress?.(progress, `Backed up ${(copied / 1024 / 1024).toFixed(1)} MB`);
  };

  try {
    if (destinationType === 'local') {
      const target = path.join(path.resolve(destination), `${path.basename(sourcePath)}-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      await copyRecursive(sourcePath, target, updateProgress);
      for (const file of files) {
        db.prepare('INSERT INTO backup_items (run_id, source_path, backup_path, size) VALUES (?, ?, ?, ?)')
          .run(runId, file.source, path.join(target, file.relative), file.size);
      }
    } else {
      await fsp.mkdir(BACKUP_ROOT, { recursive: true });
      const zipPath = path.join(BACKUP_ROOT, `${runId}.zip`);
      await zipDirectory(sourcePath, zipPath);
      const zipStat = await fsp.stat(zipPath);
      copied = zipStat.size;
      db.prepare('UPDATE backup_runs SET bytes_copied = ? WHERE id = ?').run(copied, runId);
      await uploadBackupToS3(destination, zipPath, `${runId}.zip`);
      db.prepare('INSERT INTO backup_items (run_id, source_path, backup_path, size) VALUES (?, ?, ?, ?)')
        .run(runId, sourcePath, `s3:${destination}:openfinder-backups/${runId}.zip`, zipStat.size);
    }

    db.prepare("UPDATE backup_runs SET status = 'completed', finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(runId);
    input.onProgress?.(100, 'Backup completed');
    return { runId, files: files.length, bytes: copied || total };
  } catch (err: any) {
    db.prepare("UPDATE backup_runs SET status = 'failed', error = ?, finished_at = CURRENT_TIMESTAMP WHERE id = ?").run(err.message, runId);
    throw err;
  }
}

export async function restoreBackup(input: { runId: string; targetPath?: string; onProgress?: (progress: number, message?: string) => void }) {
  const db = getDb();
  const run = db.prepare('SELECT * FROM backup_runs WHERE id = ?').get(input.runId) as any;
  if (!run) throw new Error('Backup run not found');
  const items = db.prepare('SELECT * FROM backup_items WHERE run_id = ?').all(input.runId) as any[];
  if (items.length === 0) throw new Error('No backup items recorded for this run');
  if (String(items[0].backup_path).startsWith('s3:')) throw new Error('S3 restore requires downloading the backup archive first; use local backups for v1 restore.');

  const targetRoot = path.resolve(input.targetPath || run.source_path);
  let copied = 0;
  for (const item of items) {
    const rel = path.relative(run.source_path, item.source_path);
    await copyRecursive(item.backup_path, path.join(targetRoot, rel), (bytes) => {
      copied += bytes;
      const progress = run.bytes_total > 0 ? Math.min(99, Math.round((copied / run.bytes_total) * 100)) : 99;
      input.onProgress?.(progress, 'Restoring backup');
    });
  }
  input.onProgress?.(100, 'Restore completed');
  return { restored: items.length };
}
