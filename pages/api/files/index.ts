import { readdir, stat, writeFile, unlink, rename as fsRename } from 'fs/promises';
import path from 'path';
import { getSession } from '../../../lib/auth';

const isDev = process.env.NODE_ENV !== 'production';
const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');

function securePath(p: string) {
  const resolved = path.resolve(BASE_PATH, p.replace(/^\/+/, ''));
  if (!resolved.startsWith(BASE_PATH)) throw new Error('Invalid path');
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
