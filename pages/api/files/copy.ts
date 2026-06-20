import { createReadStream, createWriteStream } from 'fs';
import { mkdir, readdir, stat } from 'fs/promises';
import path from 'path';
import { getSession } from '../../../lib/auth';

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

async function collectFiles(source: string): Promise<{ path: string; relative: string; size: number }[]> {
  const s = await stat(source);
  if (!s.isDirectory()) return [{ path: source, relative: path.basename(source), size: s.size }];

  const files: { path: string; relative: string; size: number }[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const itemStat = await stat(fullPath);
        files.push({ path: fullPath, relative: path.relative(source, fullPath), size: itemStat.size });
      }
    }
  };

  await walk(source);
  return files;
}

async function copyFileWithProgress(source: string, destination: string, onProgress: (bytes: number) => void) {
  await mkdir(path.dirname(destination), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const read = createReadStream(source);
    const write = createWriteStream(destination);
    read.on('data', (chunk) => onProgress(chunk.length));
    read.on('error', reject);
    write.on('error', reject);
    write.on('finish', resolve);
    read.pipe(write);
  });
}

export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sourcePath, destinationPath } = req.body || {};
  if (!sourcePath || !destinationPath) {
    return res.status(400).json({ error: 'Missing sourcePath or destinationPath' });
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const sourceFullPath = securePath(sourcePath);
    const destinationFullPath = securePath(destinationPath);
    const sourceStat = await stat(sourceFullPath);

    if (sourceFullPath === destinationFullPath) {
      writeEvent(res, { type: 'error', error: 'Source and destination are the same' });
      return res.end();
    }

    if (await pathExists(destinationFullPath)) {
      writeEvent(res, { type: 'error', error: 'Destination already exists' });
      return res.end();
    }

    writeEvent(res, { type: 'start', name: path.basename(sourceFullPath), isDirectory: sourceStat.isDirectory() });
    const files = await collectFiles(sourceFullPath);
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
    let bytesCopied = 0;
    let lastEmit = 0;

    const emitProgress = (force = false) => {
      const now = Date.now();
      if (!force && now - lastEmit < 200) return;
      lastEmit = now;
      const progress = totalBytes > 0 ? Math.min(99, Math.round((bytesCopied / totalBytes) * 100)) : 99;
      writeEvent(res, { type: 'progress', progress, bytesMoved: bytesCopied, totalBytes });
    };

    if (sourceStat.isDirectory()) await mkdir(destinationFullPath, { recursive: true });

    for (const file of files) {
      const target = sourceStat.isDirectory()
        ? path.join(destinationFullPath, file.relative)
        : destinationFullPath;
      await copyFileWithProgress(file.path, target, (bytes) => {
        bytesCopied += bytes;
        emitProgress();
      });
      emitProgress(true);
    }

    writeEvent(res, { type: 'progress', progress: 100, bytesMoved: totalBytes, totalBytes });
    writeEvent(res, { type: 'done' });
    res.end();
  } catch (err: any) {
    writeEvent(res, { type: 'error', error: err.message || 'Copy failed' });
    res.end();
  }
}
