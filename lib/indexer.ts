import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { getDb } from './db.ts';
import { getResourceProfileConfig } from './resource-profile.ts';

const isDev = process.env.NODE_ENV !== 'production';
const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.csv', '.log', '.js', '.ts', '.jsx', '.tsx', '.css', '.html', '.xml', '.yml', '.yaml',
  '.sh', '.ps1', '.py', '.go', '.rs', '.java', '.c', '.cpp', '.h', '.hpp', '.sql', '.env'
]);
const MEDIA_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.heic', '.heif', '.tif', '.tiff', '.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi']);
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.heic', '.heif', '.tif', '.tiff']);
const DOCUMENT_EXTENSIONS = new Set(['.pdf', '.docx', '.xlsx']);
const IGNORED_DIRS = new Set(['node_modules', '.git', '.next', '.cache', '$recycle.bin', 'system volume information', 'windows', 'program files', 'program files (x86)', 'appdata']);

function idFor(value: string) {
  return createHash('sha1').update(value).digest('hex');
}

function asRelativePath(fullPath: string) {
  return path.relative(BASE_PATH, fullPath).replace(/\\/g, '/');
}

function execFileText(command: string, args: string[], timeout = 8000): Promise<string> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, maxBuffer: 1024 * 1024, windowsHide: true }, (error, stdout) => {
      resolve(error ? '' : String(stdout || ''));
    });
  });
}

async function readTextContent(fullPath: string, maxBytes: number) {
  const ext = path.extname(fullPath).toLowerCase();
  try {
    if (TEXT_EXTENSIONS.has(ext)) {
      const fh = await fsp.open(fullPath, 'r');
      try {
        const buffer = Buffer.alloc(maxBytes);
        const { bytesRead } = await fh.read(buffer, 0, maxBytes, 0);
        return buffer.subarray(0, bytesRead).toString('utf8');
      } finally {
        await fh.close();
      }
    }

    if (ext === '.pdf') {
      return await execFileText('pdftotext', ['-layout', '-enc', 'UTF-8', fullPath, '-']);
    }

    if (DOCUMENT_EXTENSIONS.has(ext)) {
      // Without extra native/zip parsers this is a metadata-level index. The job events mention optional dependency gaps.
      return '';
    }
  } catch {
    return '';
  }
  return '';
}

async function walk(root: string, visitor: (fullPath: string, dirent: fs.Dirent) => Promise<void>, limit: number, counter: { count: number }) {
  if (counter.count >= limit) return;
  let entries: fs.Dirent[] = [];
  try {
    entries = await fsp.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (counter.count >= limit) return;
    if (IGNORED_DIRS.has(entry.name.toLowerCase())) continue;
    const fullPath = path.join(root, entry.name);
    await visitor(fullPath, entry);
    counter.count += 1;
    if (entry.isDirectory()) await walk(fullPath, visitor, limit, counter);
  }
}

function upsertFts(db: any, row: { id: string; name: string; path: string; content: string }) {
  try {
    db.prepare('DELETE FROM file_index_fts WHERE id = ?').run(row.id);
    db.prepare('INSERT INTO file_index_fts (id, name, path, content) VALUES (?, ?, ?, ?)')
      .run(row.id, row.name, row.path, row.content || '');
  } catch {
    // FTS table is optional.
  }
}

export async function rebuildFileIndex(options: { rootPath?: string; teamId?: string; onProgress?: (progress: number, message?: string) => void } = {}) {
  const config = getResourceProfileConfig();
  const db = getDb();
  const root = path.resolve(BASE_PATH, String(options.rootPath || '').replace(/^\/+/, ''));
  const rootStat = await fsp.stat(root);
  if (!rootStat.isDirectory()) throw new Error('Index root is not a directory');

  const counter = { count: 0 };
  const maxFiles = Number(process.env.INDEX_MAX_FILES || config.indexing.maxFilesPerRun);
  const maxTextBytes = Number(process.env.INDEX_MAX_TEXT_BYTES || config.indexing.maxTextBytes);
  const startedAt = Date.now();

  db.prepare(`
    INSERT INTO index_state (scope, status, root_path, last_run_at, meta)
    VALUES ('files', 'running', ?, CURRENT_TIMESTAMP, '{}')
    ON CONFLICT(scope) DO UPDATE SET status = 'running', root_path = excluded.root_path, last_run_at = CURRENT_TIMESTAMP
  `).run(root);

  await walk(root, async (fullPath, entry) => {
    const stat = await fsp.stat(fullPath).catch(() => null);
    if (!stat) return;

    const ext = path.extname(fullPath).toLowerCase();
    const relPath = asRelativePath(fullPath);
    const kind = entry.isDirectory() ? 'folder' : MEDIA_EXTENSIONS.has(ext) ? 'media' : 'file';
    const content = entry.isFile() ? await readTextContent(fullPath, maxTextBytes) : '';
    const id = idFor(relPath);

    db.prepare(`
      INSERT INTO file_index (id, team_id, path, name, kind, size, modified, content, metadata, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(path) DO UPDATE SET
        name = excluded.name,
        kind = excluded.kind,
        size = excluded.size,
        modified = excluded.modified,
        content = excluded.content,
        metadata = excluded.metadata,
        indexed_at = CURRENT_TIMESTAMP
    `).run(id, options.teamId || null, relPath, entry.name, kind, stat.size, stat.mtime.toISOString(), content, JSON.stringify({ ext }));

    upsertFts(db, { id, name: entry.name, path: relPath, content });

    if (MEDIA_EXTENSIONS.has(ext) && entry.isFile()) {
      db.prepare(`
        INSERT INTO media_index (id, team_id, path, name, media_type, size, modified, metadata, indexed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(path) DO UPDATE SET
          name = excluded.name,
          media_type = excluded.media_type,
          size = excluded.size,
          modified = excluded.modified,
          metadata = excluded.metadata,
          indexed_at = CURRENT_TIMESTAMP
      `).run(id, options.teamId || null, relPath, entry.name, IMAGE_EXTENSIONS.has(ext) ? 'image' : 'video', stat.size, stat.mtime.toISOString(), JSON.stringify({ ext }));
    }

    if (counter.count % 100 === 0) {
      const progress = Math.min(95, Math.round((counter.count / maxFiles) * 100));
      options.onProgress?.(progress, `Indexed ${counter.count} items`);
    }
  }, maxFiles, counter);

  const notes = db.prepare('SELECT id, title, content, updated_at as updatedAt FROM notes').all() as any[];
  for (const note of notes) {
    const id = `note:${note.id}`;
    upsertFts(db, { id, name: note.title, path: id, content: note.content || '' });
  }

  db.prepare(`
    INSERT INTO index_state (scope, status, root_path, last_run_at, meta)
    VALUES ('files', 'idle', ?, CURRENT_TIMESTAMP, ?)
    ON CONFLICT(scope) DO UPDATE SET status = 'idle', root_path = excluded.root_path, last_run_at = CURRENT_TIMESTAMP, meta = excluded.meta
  `).run(root, JSON.stringify({ count: counter.count, durationMs: Date.now() - startedAt, hostname: os.hostname() }));

  options.onProgress?.(100, `Indexed ${counter.count} items`);
  return { count: counter.count, rootPath: root };
}

export async function searchIndex(query: string, type = 'all', limit = 25) {
  const db = getDb();
  const q = String(query || '').trim();
  const cappedLimit = Math.min(Math.max(1, Number(limit) || 25), 100);
  if (!q) return [];

  try {
    const rows = db.prepare(`
      SELECT f.id, f.kind, f.name, f.path, snippet(file_index_fts, 3, '<mark>', '</mark>', '…', 12) as snippet, bm25(file_index_fts) as score
      FROM file_index_fts
      LEFT JOIN file_index f ON f.id = file_index_fts.id
      WHERE file_index_fts MATCH ?
      ORDER BY score
      LIMIT ?
    `).all(`${q.replace(/"/g, '""')}*`, cappedLimit) as any[];
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind || (String(row.id).startsWith('note:') ? 'note' : 'file'),
      name: row.name || row.id,
      path: row.path,
      snippet: row.snippet,
      score: row.score,
    })).filter((row) => type === 'all' || row.kind === type);
  } catch {
    const rows = db.prepare(`
      SELECT id, kind, name, path, substr(content, 1, 160) as snippet
      FROM file_index
      WHERE name LIKE ? OR path LIKE ? OR content LIKE ?
      ORDER BY modified DESC
      LIMIT ?
    `).all(`%${q}%`, `%${q}%`, `%${q}%`, cappedLimit) as any[];
    return rows.filter((row) => type === 'all' || row.kind === type);
  }
}

export function getIndexState() {
  return getDb().prepare('SELECT * FROM index_state').all();
}
