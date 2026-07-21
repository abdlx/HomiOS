import { createWriteStream } from 'fs';
import { stat } from 'fs/promises';
import path from 'path';
import { withAuth } from '../../../lib/api-auth.ts';
import { logAudit } from '../../../lib/audit.ts';
import { ZipArchive } from 'archiver';

const isDev = process.env.NODE_ENV !== 'production';
const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');

export const config = {
  api: {
    responseLimit: false,
  },
};

function securePath(p: string) {
  const parts = String(p || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid path');
  }
  return path.resolve(BASE_PATH, parts.join('/'));
}

function writeEvent(res: any, event: Record<string, unknown>) {
  res.write(`${JSON.stringify(event)}\n`);
}

async function pathExists(target: string) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bulk compress: takes an array of source paths (files and/or folders) plus a
 * destination directory and archive name, and writes a single .zip there.
 * Streams NDJSON progress so the UI can show a transfer card, matching copy/move.
 */
export default withAuth(async function handler(req: any, res: any, session: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sourcePaths, destinationDir, archiveName } = req.body || {};
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    return res.status(400).json({ error: 'Missing sourcePaths' });
  }
  if (!archiveName || typeof archiveName !== 'string') {
    return res.status(400).json({ error: 'Missing archiveName' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  let destinationFullPath = '';
  try {
    const finalName = archiveName.endsWith('.zip') ? archiveName : `${archiveName}.zip`;
    const destDirFull = securePath(destinationDir || '/');
    destinationFullPath = path.join(destDirFull, path.basename(finalName));

    // Never silently clobber an existing archive.
    if (await pathExists(destinationFullPath)) {
      writeEvent(res, { type: 'error', error: 'An archive with that name already exists' });
      return res.end();
    }

    const sources = sourcePaths.map((p: string) => securePath(p));
    // Total bytes across all sources for progress reporting.
    let totalBytes = 0;
    for (const src of sources) {
      const s = await stat(src);
      if (s.isFile()) totalBytes += s.size;
    }

    writeEvent(res, { type: 'start', name: finalName });

    const archive = new ZipArchive({
      zlib: { level: Number(process.env.ZIP_COMPRESSION_LEVEL || 3) },
    });
    const output = createWriteStream(destinationFullPath);

    let lastEmit = 0;
    const emitProgress = (force = false) => {
      const now = Date.now();
      if (!force && now - lastEmit < 200) return;
      lastEmit = now;
      const processed = archive.pointer(); // compressed bytes written so far
      const progress = totalBytes > 0 ? Math.min(99, Math.round((processed / totalBytes) * 100)) : 50;
      writeEvent(res, { type: 'progress', progress, bytesMoved: processed, totalBytes });
    };

    archive.on('progress', () => emitProgress());
    archive.on('entry', () => emitProgress());

    const done = new Promise<void>((resolve, reject) => {
      output.on('close', () => resolve());
      output.on('error', reject);
      archive.on('error', reject);
      archive.on('warning', (warn: any) => {
        if (warn?.code !== 'ENOENT') reject(warn);
      });
    });

    archive.pipe(output);

    for (const src of sources) {
      const s = await stat(src);
      const base = path.basename(src);
      if (s.isDirectory()) {
        archive.directory(src, base);
      } else {
        archive.file(src, { name: base });
      }
    }

    await archive.finalize();
    await done;

    logAudit({
      teamId: session.teamId, userId: session.userId,
      action: 'files.zip', resourceType: 'path', resourceId: destinationDir || '/',
      meta: { archive: finalName, count: sourcePaths.length },
    });

    writeEvent(res, { type: 'progress', progress: 100, bytesMoved: totalBytes, totalBytes });
    writeEvent(res, { type: 'done', path: path.relative(BASE_PATH, destinationFullPath) });
    res.end();
  } catch (err: any) {
    console.error('[/api/files/zip]', err);
    // Clean up a half-written archive so a retry with the same name works.
    if (destinationFullPath) {
      try { (await import('fs/promises')).unlink(destinationFullPath); } catch { /* best effort */ }
    }
    writeEvent(res, { type: 'error', error: 'Compression failed' });
    res.end();
  }
}, { adminOnly: true, ability: 'write' });
