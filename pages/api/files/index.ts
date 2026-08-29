import { readdir, stat, writeFile, unlink, rename as fsRename } from 'fs/promises';
import path from 'path';
import { withAuth, requireAbility } from '../../../lib/api-auth.ts';
import { logAudit } from '../../../lib/audit.ts';
import { ZipArchive } from 'archiver';
import { Readable } from 'node:stream';
import {
  CLOUD_ROOT,
  CloudDriveError,
  createCloudFolder,
  downloadCloudFile,
  listCloudFiles,
  mutateCloudItem,
  uploadCloudStream,
} from '../../../lib/cloud-drive.ts';

const isDev = process.env.NODE_ENV !== 'production';
const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');
const FILE_STAT_CONCURRENCY = Number(process.env.FILE_STAT_CONCURRENCY || 32);
const DETAILED_STAT_LIMIT = Number(process.env.DETAILED_STAT_LIMIT || 500);
const MAX_JSON_WRITE_BYTES = Number(process.env.MAX_JSON_WRITE_BYTES || 8 * 1024 * 1024);

const isCloudPath = (value: unknown) => {
  const normalized = String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized === CLOUD_ROOT || normalized.startsWith(`${CLOUD_ROOT}/`);
};

function securePath(p: string) {
  // Paths resolve relative to BASE_PATH, which is '/' in production: HomiOS is a
  // server console, so an admin browsing the whole host is the intended behaviour.
  // The gate is the ADMIN CHECK on this route (see withAuth below), not a path jail.
  // '.' and '..' are still rejected so a path can never mean something other than it
  // reads as.
  const parts = String(p || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid path');
  }
  const resolved = path.resolve(BASE_PATH, parts.join('/'));
  return resolved;
}

/**
 * File contents are attacker-controlled: anything served from here could be an
 * uploaded .html or .svg. Serving those inline on our own origin is stored XSS —
 * the script runs with the victim's session. So: force a download, declare an inert
 * type, and sandbox the response. Only formats that cannot execute script get to
 * render inline.
 */
const INLINE_SAFE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
};

/** RFC 5987 — a filename can contain quotes, newlines, or non-ASCII. */
function contentDisposition(mode: 'inline' | 'attachment', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${mode}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), items.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }));

  return results;
}

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false, // Prevent Next.js from throwing error on large zip streams
  },
};

export default withAuth(async function handler(req: any, res: any, session: any) {
  try {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      const chunks: Buffer[] = [];
      let received = 0;
      for await (const chunk of req) {
        received += chunk.length;
        // bodyParser is disabled on this route, so nothing else bounds this read.
        if (received > MAX_JSON_WRITE_BYTES) {
          return res.status(413).json({ error: 'Request body too large' });
        }
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      if (rawBody) {
        req.body = JSON.parse(rawBody);
      } else {
        req.body = {};
      }
    }

    const { path: filePath } = req.query;

    // Cloud Drive is a virtual HomiOS mount. Keep its identifiers inside this
    // server route so the Files UI can use the same operations without learning
    // about 9Drive or receiving its service credential.
    if (req.method === 'GET' && isCloudPath(filePath)) {
      if (!requireAbility(res, session, 'read')) return;
      if (req.query.raw === 'true') {
        const upstream = await downloadCloudFile(String(filePath), req.headers.range);
        for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition']) {
          const value = upstream.headers.get(header);
          if (value) res.setHeader(header, value);
        }
        res.status(upstream.status);
        if (!upstream.body) return res.end();
        Readable.fromWeb(upstream.body as any).pipe(res);
        return;
      }
      return res.json(await listCloudFiles(String(filePath)));
    }

    if (req.method === 'POST') {
      const uploadPath = req.body?.path || req.query.path;
      if (isCloudPath(uploadPath)) {
        if (!requireAbility(res, session, 'write')) return;
        if (req.body?.isDir) {
          const normalized = String(uploadPath).replace(/\\/g, '/');
          const parts = normalized.split('/').filter(Boolean);
          const name = parts.pop();
          if (!name) return res.status(400).json({ error: 'Missing folder name' });
          await createCloudFolder(parts.join('/'), name);
          return res.json({ ok: true, path: uploadPath });
        }
        const contentLength = contentType.includes('application/json')
          ? Buffer.byteLength(String(req.body?.content || ''))
          : Number(req.headers['content-length'] || 0);
        if (!Number.isSafeInteger(contentLength) || contentLength < 0) return res.status(411).json({ error: 'Content-Length is required' });
        const source = contentType.includes('application/json')
          ? (async function* () { yield Buffer.from(String(req.body?.content || '')); })()
          : req;
        await uploadCloudStream(String(uploadPath), source, contentLength, String(req.headers['content-type'] || 'application/octet-stream'));
        return res.json({ ok: true, path: uploadPath });
      }
    }

    if (req.method === 'DELETE' && isCloudPath(req.body?.path)) {
      if (!requireAbility(res, session, 'write')) return;
      await mutateCloudItem(String(req.body.path), 'DELETE');
      return res.json({ ok: true });
    }

    if (req.method === 'PATCH' && isCloudPath(req.body?.path)) {
      if (!requireAbility(res, session, 'write')) return;
      const name = String(req.body?.newPath || '').replace(/\\/g, '/').split('/').filter(Boolean).pop();
      if (!name) return res.status(400).json({ error: 'Missing new name' });
      await mutateCloudItem(String(req.body.path), 'PATCH', { name });
      return res.json({ ok: true });
    }

    const fullPath = securePath((filePath as string) || '/');

    if (req.method === 'GET') {
      if (!requireAbility(res, session, 'read')) return;

      if (req.query.downloadZip === 'true') {
        const s = await stat(fullPath);
        if (!s.isDirectory()) {
          return res.status(400).json({ error: 'Not a directory' });
        }

        const archive = new ZipArchive({
          zlib: { level: Number(process.env.ZIP_COMPRESSION_LEVEL || 3) }
        });

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${path.basename(fullPath) || 'folder'}.zip"`);

        archive.on('error', function(err: any) {
          res.status(500).send({error: err.message});
        });

        archive.pipe(res);
        archive.directory(fullPath, false);
        await archive.finalize();
        return;
      }

      if (req.query.raw === 'true') {
        const { createReadStream } = await import('fs');
        const s = await stat(fullPath);
        if (s.isDirectory()) return res.status(400).json({ error: 'Not a file' });

        const ext = path.extname(fullPath).toLowerCase();
        const inlineType = INLINE_SAFE_TYPES[ext];
        const name = path.basename(fullPath);

        // Anything not on the inline allowlist — .html, .svg, .js, .css, unknown —
        // is served as an inert download. Previously .html came back as text/html and
        // .svg as image/svg+xml, both of which execute script on our own origin.
        res.setHeader('Content-Type', inlineType || 'application/octet-stream');
        res.setHeader('Content-Disposition', contentDisposition(inlineType ? 'inline' : 'attachment', name));
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
        res.setHeader('Content-Length', s.size);

        const stream = createReadStream(fullPath);
        stream.on('error', () => { if (!res.headersSent) res.status(500).end(); else res.destroy(); });
        stream.pipe(res);
        return;
      }

      try {
        const files = await readdir(fullPath, { withFileTypes: true });
        const shouldStatEntries = files.length <= DETAILED_STAT_LIMIT || req.query.details === 'true';
        const detailed = await mapWithConcurrency(
          files,
          FILE_STAT_CONCURRENCY,
          async (f) => {
            const fullPath_ = path.join(fullPath, f.name);
            let size = 0;
            let itemCount: number | null = null;
            let modified = new Date().toISOString();
            let isDir = f.isDirectory();
            
            try {
              if (isDir) {
                try {
                  itemCount = (await readdir(fullPath_)).length;
                } catch {
                  itemCount = null;
                }
              }

              if (!shouldStatEntries) {
                return {
                  name: f.name,
                  isDir,
                  size,
                  itemCount,
                  modified,
                  path: path.relative(BASE_PATH, fullPath_)
                };
              }

              const s = await stat(fullPath_);
              size = s.size;
              modified = s.mtime.toISOString();
              isDir = s.isDirectory();
            } catch (statErr) {
              // Ignore stat errors (like broken symlinks or permission denied)
              // and just use the basic info from readdir
            }

            return {
              name: f.name,
              isDir,
              size,
              itemCount,
              modified,
              path: path.relative(BASE_PATH, fullPath_)
            };
          }
        );
        return res.json(detailed.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name)));
      } catch (err) {
        if ((err as any).code === 'ENOENT') {
          return res.json([]);
        } else {
          throw err;
        }
      }
    }

    if (req.method === 'POST') {
      if (!requireAbility(res, session, 'write')) return;

      const uploadPath = req.body?.path || req.query.path;
      if (!uploadPath) return res.status(400).json({ error: 'Missing path' });
      
      const uploadFullPath = securePath(uploadPath);
      
      if (req.body?.isDir) {
        const { mkdir } = await import('fs/promises');
        await mkdir(uploadFullPath, { recursive: true });
        return res.json({ ok: true, path: uploadPath });
      }

      const { mkdir } = await import('fs/promises');
      await mkdir(path.dirname(uploadFullPath), { recursive: true });

      if (contentType.includes('application/json')) {
        let contentToWrite: string | Buffer = '';
        if (req.body && req.body.content !== undefined) {
          contentToWrite = req.body.content;
        }
        await writeFile(uploadFullPath, contentToWrite);
        return res.json({ ok: true, path: uploadPath });
      } else {
        const { createWriteStream } = await import('fs');
        const { pipeline } = await import('stream/promises');
        const writeStream = createWriteStream(uploadFullPath);
        await pipeline(req, writeStream);
        return res.json({ ok: true, path: uploadPath });
      }
    }

    if (req.method === 'DELETE') {
      if (!requireAbility(res, session, 'write')) return;

      const deletePath = req.body?.path;
      if (!deletePath) return res.status(400).json({ error: 'Missing path' });
      const deleteFullPath = securePath(deletePath);
      const s = await stat(deleteFullPath);

      logAudit({
        teamId: session.teamId, userId: session.userId,
        action: 'files.delete', resourceType: 'path', resourceId: String(deletePath),
      });

      if (s.isDirectory()) {
        const { rm } = await import('fs/promises');
        await rm(deleteFullPath, { recursive: true });
      } else {
        await unlink(deleteFullPath);
      }
      return res.json({ ok: true });
    }

    if (req.method === 'PATCH') {
      if (!requireAbility(res, session, 'write')) return;

      const { path: oldPath, newPath } = req.body || {};
      if (!oldPath || !newPath) return res.status(400).json({ error: 'Missing path or newPath' });
      const oldFull = securePath(oldPath);
      const newFull = securePath(newPath);
      await fsRename(oldFull, newFull);
      logAudit({
        teamId: session.teamId, userId: session.userId,
        action: 'files.rename', resourceType: 'path', resourceId: String(oldPath),
        meta: { to: String(newPath) },
      });
      return res.json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'PATCH']);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    // Never hand back err.message: fs errors embed absolute host paths
    // ("ENOENT: ... open '/etc/shadow'"), which map out the filesystem for free.
    console.error('[/api/files]', req.method, err);
    if (err instanceof CloudDriveError) return res.status(err.status).json({ error: err.message });
    if (err?.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
    if (err?.code === 'EACCES' || err?.code === 'EPERM') return res.status(403).json({ error: 'Permission denied' });
    if (err?.code === 'EEXIST') return res.status(409).json({ error: 'Already exists' });
    if (err?.message === 'Invalid path') return res.status(400).json({ error: 'Invalid path' });
    if (res.headersSent) return res.destroy();
    return res.status(500).json({ error: 'File operation failed' });
  }
}, { adminOnly: true });
