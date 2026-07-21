import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import path from 'path';
import yauzl from 'yauzl';
import { withAuth } from '../../../lib/api-auth.ts';
import { logAudit } from '../../../lib/audit.ts';

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
 * Extract a .zip archive into a destination directory. Streams NDJSON progress.
 *
 * Archive entry names are fully attacker-controlled, so each extracted path is
 * resolved and confirmed to stay within destRoot before any write ("zip slip"
 * defence). Entries that escape are skipped, not fatal.
 */
export default withAuth(async function handler(req: any, res: any, session: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { archivePath, destinationDir } = req.body || {};
  if (!archivePath || typeof archivePath !== 'string') {
    return res.status(400).json({ error: 'Missing archivePath' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const archiveFull = securePath(archivePath);
    const archiveStat = await stat(archiveFull);
    if (archiveStat.isDirectory()) {
      writeEvent(res, { type: 'error', error: 'Not a file' });
      return res.end();
    }

    // Default extract target: a sibling folder named after the archive, so
    // extracting "photos.zip" produces "photos/".
    const baseName = path.basename(archiveFull).replace(/\.zip$/i, '') || 'extracted';
    const destRoot = destinationDir
      ? securePath(destinationDir)
      : path.join(path.dirname(archiveFull), baseName);

    if (await pathExists(destRoot)) {
      const s = await stat(destRoot);
      if (!s.isDirectory()) {
        writeEvent(res, { type: 'error', error: 'A file with the target name already exists' });
        return res.end();
      }
    }
    await mkdir(destRoot, { recursive: true });

    writeEvent(res, { type: 'start', name: path.basename(archiveFull) });

    await new Promise<void>((resolve, reject) => {
      yauzl.open(archiveFull, { lazyEntries: true }, (err, zipfile) => {
        if (err || !zipfile) return reject(err || new Error('Could not open archive'));

        const totalEntries = zipfile.entryCount;
        let processed = 0;
        let lastEmit = 0;

        const emitProgress = (force = false) => {
          const now = Date.now();
          if (!force && now - lastEmit < 150) return;
          lastEmit = now;
          const progress = totalEntries > 0 ? Math.min(99, Math.round((processed / totalEntries) * 100)) : 50;
          writeEvent(res, { type: 'progress', progress, bytesMoved: processed, totalBytes: totalEntries });
        };

        const resolveSafe = (entryName: string): string | null => {
          // Normalise separators, then resolve against destRoot and verify the
          // result never climbs out of it.
          const cleaned = entryName.replace(/\\/g, '/');
          const target = path.resolve(destRoot, cleaned);
          const rel = path.relative(destRoot, target);
          if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
          return target;
        };

        zipfile.on('error', reject);
        zipfile.on('end', () => resolve());

        zipfile.on('entry', (entry: any) => {
          const isDir = /\/$/.test(entry.fileName);
          const target = resolveSafe(entry.fileName);

          if (!target) {
            // Zip-slip attempt — skip this entry and continue.
            processed++;
            emitProgress();
            zipfile.readEntry();
            return;
          }

          if (isDir) {
            mkdir(target, { recursive: true })
              .then(() => { processed++; emitProgress(); zipfile.readEntry(); })
              .catch(reject);
            return;
          }

          zipfile.openReadStream(entry, (streamErr, readStream) => {
            if (streamErr || !readStream) return reject(streamErr || new Error('Read stream failed'));
            mkdir(path.dirname(target), { recursive: true })
              .then(() => {
                const writeStream = createWriteStream(target);
                writeStream.on('error', reject);
                readStream.on('error', reject);
                writeStream.on('close', () => { processed++; emitProgress(); zipfile.readEntry(); });
                readStream.pipe(writeStream);
              })
              .catch(reject);
          });
        });

        zipfile.readEntry();
      });
    });

    logAudit({
      teamId: session.teamId, userId: session.userId,
      action: 'files.unzip', resourceType: 'path', resourceId: String(archivePath),
      meta: { to: path.relative(BASE_PATH, destRoot) },
    });

    writeEvent(res, { type: 'progress', progress: 100 });
    writeEvent(res, { type: 'done', path: path.relative(BASE_PATH, destRoot) });
    res.end();
  } catch (err: any) {
    console.error('[/api/files/unzip]', err);
    writeEvent(res, { type: 'error', error: 'Extraction failed' });
    res.end();
  }
}, { adminOnly: true, ability: 'write' });
