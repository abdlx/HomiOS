import { readdir } from 'fs/promises';
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

export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  const isDev = process.env.NODE_ENV !== 'production';

  if (os.platform() === 'linux') {
    try {
      const { stdout } = await execAsync('df -hP | grep "^/dev/"');
      const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
      const drives = lines.map((line) => {
        const parts = line.split(/\s+/);
        const mountPoint = parts[5];
        const label = mountPoint === '/' ? 'Rootfs' : mountPoint.split('/').pop() || mountPoint;
        return { label, path: mountPoint };
      });
      // Ensure unique paths just in case
      const uniqueDrives = Array.from(new Map(drives.map((d) => [d.path, d])).values());
      return res.json(uniqueDrives);
    } catch (e) {
      console.error('Failed to get Linux drives:', e);
    }
  }

  const drivesPath = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');

  try {
    const drives = await readdir(drivesPath, { withFileTypes: true });
    res.json(
      drives
        .filter((d) => d.isDirectory())
        .map((d) => ({
          label: d.name,
          path: isDev ? d.name : `/${d.name}`
        }))
    );
  } catch (err) {
    console.error(`Failed to read drives from ${drivesPath}:`, err);
    res.json([]);
  }
}
