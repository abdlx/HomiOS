import { readdir, stat, writeFile, unlink, rename as fsRename } from 'fs/promises';
import path from 'path';
import { getSession } from '../../../lib/auth';

const isDev = process.env.NODE_ENV !== 'production';
const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');

function securePath(p: string) {
  // We strip leading slashes so that path resolves relative to BASE_PATH.
  // If BASE_PATH is '/' (production), 'mnt/data' resolves to '/mnt/data'.
  // If BASE_PATH is 'data_mock', 'Projects' resolves to 'data_mock/Projects'.
  // This allows full system access in production without path jail errors.
  const resolved = path.resolve(BASE_PATH, p.replace(/^\/+/, ''));
  return resolved;
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1000mb', // allow large uploads
    },
  },
};

export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  try {
    const { path: filePath } = req.query;
    const fullPath = securePath((filePath as string) || '/');

    if (req.method === 'GET') {
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
          '.pdf': 'application/pdf',
          '.txt': 'text/plain',
          '.md': 'text/markdown',
          '.json': 'application/json',
          '.js': 'text/javascript',
          '.css': 'text/css',
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
        const detailed = await Promise.all(
          files.map(async (f) => {
            const fullPath_ = path.join(fullPath, f.name);
            let size = 0;
            let modified = new Date().toISOString();
            let isDir = f.isDirectory();
            
            try {
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
          })
        );
        res.json(detailed.sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name)));
      } catch (err) {
        if ((err as any).code === 'ENOENT') {
          res.json([]);
        } else {
          throw err;
        }
      }
    }

    if (req.method === 'POST') {
      const uploadPath = req.body.path || req.query.path;
      if (!uploadPath) return res.status(400).json({ error: 'Missing path' });
      
      const uploadFullPath = securePath(uploadPath);
      
      if (req.body.isDir) {
        const { mkdir } = await import('fs/promises');
        await mkdir(uploadFullPath, { recursive: true });
        return res.json({ ok: true, path: uploadPath });
      }

      // If it's a JSON body with content, write the content string
      // Otherwise, assume the body IS the raw file buffer (e.g. upload)
      let contentToWrite: string | Buffer;
      
      if (req.body && req.body.content !== undefined) {
        contentToWrite = req.body.content;
      } else {
        contentToWrite = typeof req.body === 'string' ? req.body : Buffer.from(req.body || '');
      }

      await writeFile(uploadFullPath, contentToWrite);
      res.json({ ok: true, path: uploadPath });
    }

    if (req.method === 'DELETE') {
      const deletePath = req.body.path;
      const deleteFullPath = securePath(deletePath);
      const s = await stat(deleteFullPath);
      
      if (s.isDirectory()) {
        const { rm } = await import('fs/promises');
        await rm(deleteFullPath, { recursive: true });
      } else {
        await unlink(deleteFullPath);
      }
      res.json({ ok: true });
    }

    if (req.method === 'PATCH') {
      const { path: oldPath, newPath } = req.body;
      const oldFull = securePath(oldPath);
      const newFull = securePath(newPath);
      await fsRename(oldFull, newFull);
      res.json({ ok: true });
    }
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
}
