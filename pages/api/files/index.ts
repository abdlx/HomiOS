import { readdir, stat, writeFile, unlink, rename as fsRename } from 'fs/promises';
import path from 'path';
import { getSession } from '../../../lib/auth';
import { requireAbility } from '../../../lib/api-auth';
import { ZipArchive } from 'archiver';

const isDev = process.env.NODE_ENV !== 'production';
const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');
const FILE_STAT_CONCURRENCY = Number(process.env.FILE_STAT_CONCURRENCY || 32);
const DETAILED_STAT_LIMIT = Number(process.env.DETAILED_STAT_LIMIT || 500);

function securePath(p: string) {
  // We strip leading slashes so that path resolves relative to BASE_PATH.
  // If BASE_PATH is '/' (production), 'mnt/data' resolves to '/mnt/data'.
  // If BASE_PATH is 'data_mock', 'Projects' resolves to 'data_mock/Projects'.
  // This allows full system access in production without path jail errors.
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

export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  try {
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('application/json')) {
      const chunks = [];
      for await (const chunk of req) {
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
        
        // Simple mime-type guessing for standard web formats
        const ext = path.extname(fullPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.png': 'image/png',
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.gif': 'image/gif',
          '.svg': 'image/svg+xml',
          '.webp': 'image/webp',
          '.mp4': 'video/mp4',
          '.webm': 'video/webm',
          '.mov': 'video/quicktime',
          '.m4v': 'video/x-m4v',
          '.mkv': 'video/x-matroska',
          '.avi': 'video/x-msvideo',
          '.pdf': 'application/pdf',
          '.txt': 'text/plain',
          '.md': 'text/markdown',
          '.json': 'application/json',
          '.js': 'text/javascript',
          '.cjs': 'text/javascript',
          '.mjs': 'text/javascript',
          '.jsx': 'text/javascript',
          '.ts': 'text/typescript',
          '.tsx': 'text/typescript',
          '.css': 'text/css',
          '.scss': 'text/css',
          '.html': 'text/html'
        };
        
        if (mimeTypes[ext]) {
          res.setHeader('Content-Type', mimeTypes[ext]);
        } else {
          res.setHeader('Content-Type', 'application/octet-stream');
        }
        
        res.setHeader('Content-Length', s.size);
        const stream = createReadStream(fullPath);
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
            let modified = new Date().toISOString();
            let isDir = f.isDirectory();
            
            try {
              if (!shouldStatEntries) {
                return {
                  name: f.name,
                  isDir,
                  size,
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

      const deletePath = req.body.path;
      const deleteFullPath = securePath(deletePath);
      const s = await stat(deleteFullPath);
      
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

      const { path: oldPath, newPath } = req.body;
      const oldFull = securePath(oldPath);
      const newFull = securePath(newPath);
      await fsRename(oldFull, newFull);
      return res.json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'DELETE', 'PATCH']);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}
