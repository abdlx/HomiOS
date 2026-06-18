import path from 'path';
import { execFile } from 'child_process';
import { createHash } from 'crypto';
import { getDb } from './db.ts';

const isDev = process.env.NODE_ENV !== 'production';
const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');
const OCR_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp', '.tif', '.tiff']);

function idFor(value: string) {
  return createHash('sha1').update(value).digest('hex');
}

function execFileText(command: string, args: string[], timeout = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { timeout, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, stdout, stderr) => {
      if (error) reject(new Error(stderr || error.message));
      else resolve(String(stdout || ''));
    });
  });
}

export async function runOcr(input: { path: string; teamId?: string; onProgress?: (progress: number, message?: string) => void }) {
  const sourceFullPath = path.resolve(BASE_PATH, input.path.replace(/^\/+/, ''));
  const ext = path.extname(sourceFullPath).toLowerCase();
  if (!OCR_IMAGE_EXTENSIONS.has(ext)) {
    throw new Error('OCR currently supports image files only. Scanned PDF OCR requires a PDF renderer/Poppler pipeline.');
  }

  input.onProgress?.(10, 'Starting OCR');
  const text = await execFileText('tesseract', [sourceFullPath, 'stdout']);
  input.onProgress?.(80, 'Saving OCR text');

  const relPath = path.relative(BASE_PATH, sourceFullPath).replace(/\\/g, '/');
  const id = idFor(relPath);
  const db = getDb();
  db.prepare(`
    INSERT INTO file_index (id, team_id, path, name, kind, content, metadata, indexed_at)
    VALUES (?, ?, ?, ?, 'media', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(path) DO UPDATE SET content = excluded.content, metadata = excluded.metadata, indexed_at = CURRENT_TIMESTAMP
  `).run(id, input.teamId || null, relPath, path.basename(sourceFullPath), text, JSON.stringify({ ocr: true, ext }));

  try {
    db.prepare('DELETE FROM file_index_fts WHERE id = ?').run(id);
    db.prepare('INSERT INTO file_index_fts (id, name, path, content) VALUES (?, ?, ?, ?)')
      .run(id, path.basename(sourceFullPath), relPath, text);
  } catch {
    // FTS is optional.
  }

  input.onProgress?.(100, 'OCR completed');
  return { path: relPath, characters: text.length };
}
