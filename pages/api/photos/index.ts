import { readdir, stat } from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { getSession } from '../../../lib/auth';

const execAsync = (cmd: string): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg']);
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'Windows', 'Program Files', 'Program Files (x86)',
  'ProgramData', 'AppData', '$Recycle.Bin', 'System Volume Information',
  'temp', 'tmp'
]);

let isTimedOut = false;

async function findPhotosInDir(dir: string, results: any[]): Promise<void> {
  if (isTimedOut) return;
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          // Fire and forget but await all at end? No, just await sequentially or chunked.
          // For speed, let's just do sequential await for now, or Promise.all.
          await findPhotosInDir(path.join(dir, entry.name), results).catch(() => {});
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (IMAGE_EXTENSIONS.has(ext)) {
          const fullPath = path.join(dir, entry.name);
          try {
            const s = await stat(fullPath);
            results.push({
              id: fullPath,
              name: entry.name,
              path: fullPath,
              size: s.size,
              modified: s.mtime.toISOString(),
            });
          } catch {
            // ignore
          }
        }
      }
    }
  } catch (err) {
    // Ignore permissions errors etc.
  }
}

export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  isTimedOut = false;
  // Start a timeout to stop searching after 15 seconds
  const timeoutId = setTimeout(() => {
    isTimedOut = true;
  }, 15000);

  try {
    const results: any[] = [];
    const isDev = process.env.NODE_ENV !== 'production';

    if (os.platform() === 'win32') {
      const { stdout } = await execAsync('wmic logicaldisk get name');
      const drives = stdout
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length === 2 && line.endsWith(':'))
        .map(line => line + '\\');

      // To avoid waiting forever, we will search drives
      // But actually Node.js sequential traverse of C:\ could take 5-10 minutes.
      // We will do our best. Next.js limits might hit, so let's stream it or use a background cache.
      // Wait, we can use powershell to do it fast? No, powershell isn't much faster than node.
      // Let's run Promise.all on drives.
      await Promise.all(drives.map(drive => findPhotosInDir(drive, results).catch(() => {})));

    } else {
      // Linux/macOS
      const rootDirs = ['/'];
      await Promise.all(rootDirs.map(dir => findPhotosInDir(dir, results).catch(() => {})));
    }

    // Sort by modified date descending
    results.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());

    clearTimeout(timeoutId);
    
    // Limit to 1000 to prevent huge payloads
    res.json(results.slice(0, 1000));
  } catch (err: any) {
    clearTimeout(timeoutId);
    res.status(500).json({ error: err.message });
  }
}
