import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { getDb } from './db.ts';

export type ThumbnailVariant = 'grid' | 'preview';

const isDev = process.env.NODE_ENV !== 'production';
const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');
const CACHE_ROOT = process.env.THUMBNAIL_CACHE_DIR || path.join(process.cwd(), 'data', '.cache', 'thumbnails');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif', '.tif', '.tiff', '.svg']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi']);

function dynamicImport(specifier: string): Promise<any> {
  return (new Function('specifier', 'return import(specifier)'))(specifier);
}

function idFor(sourcePath: string, variant: ThumbnailVariant) {
  return createHash('sha1').update(`${sourcePath}:${variant}`).digest('hex');
}

function resolveSource(p: string) {
  return path.resolve(BASE_PATH, p.replace(/^\/+/, ''));
}

function targetSize(variant: ThumbnailVariant) {
  return variant === 'preview' ? 900 : 320;
}

async function ensureDir() {
  await fsp.mkdir(CACHE_ROOT, { recursive: true });
}

function runFfmpeg(source: string, dest: string, size: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('ffmpeg', [
      '-y',
      '-ss', '00:00:01',
      '-i', source,
      '-frames:v', '1',
      '-vf', `scale='min(${size},iw)':-2`,
      dest,
    ], { windowsHide: true });

    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(stderr || `ffmpeg exited ${code}`)));
  });
}

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

export async function ensureThumbnail(sourcePath: string, variant: ThumbnailVariant = 'grid') {
  const db = getDb();
  const sourceFullPath = resolveSource(sourcePath);
  const ext = path.extname(sourceFullPath).toLowerCase();
  const stat = await fsp.stat(sourceFullPath);
  if (!stat.isFile()) throw new Error('Thumbnail source is not a file');

  await ensureDir();
  const id = idFor(sourceFullPath, variant);
  const size = targetSize(variant);
  const isVideo = VIDEO_EXTENSIONS.has(ext);
  const isImage = IMAGE_EXTENSIONS.has(ext);
  if (!isVideo && !isImage) throw new Error('Unsupported thumbnail type');

  const dest = path.join(CACHE_ROOT, `${id}.jpg`);
  const existing = db.prepare('SELECT * FROM thumbnail_cache WHERE source_path = ? AND variant = ?')
    .get(sourceFullPath, variant) as any;
  if (existing?.status === 'ready' && existing.cache_path && fs.existsSync(existing.cache_path) && existing.source_mtime === Math.floor(stat.mtimeMs) && existing.source_size === stat.size) {
    return { path: existing.cache_path, contentType: contentTypeFor(existing.cache_path), cached: true };
  }

  try {
    if (isImage) {
      const sharpModule = await dynamicImport('sharp');
      const sharp = sharpModule.default || sharpModule;
      await sharp(sourceFullPath)
        .rotate()
        .resize({ width: size, height: size, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: variant === 'preview' ? 84 : 76, mozjpeg: true })
        .toFile(dest);
    } else {
      await runFfmpeg(sourceFullPath, dest, size);
    }

    db.prepare(`
      INSERT INTO thumbnail_cache (id, source_path, variant, cache_path, source_mtime, source_size, status, error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'ready', NULL, CURRENT_TIMESTAMP)
      ON CONFLICT(source_path, variant) DO UPDATE SET
        cache_path = excluded.cache_path,
        source_mtime = excluded.source_mtime,
        source_size = excluded.source_size,
        status = 'ready',
        error = NULL,
        updated_at = CURRENT_TIMESTAMP
    `).run(id, sourceFullPath, variant, dest, Math.floor(stat.mtimeMs), stat.size);

    return { path: dest, contentType: contentTypeFor(dest), cached: false };
  } catch (err: any) {
    db.prepare(`
      INSERT INTO thumbnail_cache (id, source_path, variant, source_mtime, source_size, status, error, updated_at)
      VALUES (?, ?, ?, ?, ?, 'error', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(source_path, variant) DO UPDATE SET
        source_mtime = excluded.source_mtime,
        source_size = excluded.source_size,
        status = 'error',
        error = excluded.error,
        updated_at = CURRENT_TIMESTAMP
    `).run(id, sourceFullPath, variant, Math.floor(stat.mtimeMs), stat.size, err.message || 'Thumbnail failed');
    throw err;
  }
}

export function listThumbnailCache(limit = 100) {
  return getDb().prepare(`
    SELECT source_path as sourcePath, variant, cache_path as cachePath, status, error, updated_at as updatedAt
    FROM thumbnail_cache
    ORDER BY updated_at DESC
    LIMIT ?
  `).all(Math.min(Math.max(1, limit), 500));
}
