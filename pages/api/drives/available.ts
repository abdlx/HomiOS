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
      // Use lsblk to get ALL connected drives (mounted and unmounted)
      const { stdout } = await execAsync('lsblk -J -o NAME,MOUNTPOINT,TYPE,SIZE');
      const parsed = JSON.parse(stdout);
      
      const extractDrives = (devices: any[]): any[] => {
        const result: any[] = [];
        for (const dev of devices) {
          if (dev.children && dev.children.length > 0) {
            result.push(...extractDrives(dev.children));
          } else {
            // Leaf node (partition or standalone disk)
            // Skip loop devices (snaps, etc)
            if (dev.type === 'loop') continue;
            
            const isMounted = !!dev.mountpoint;
            const label = isMounted ? (dev.mountpoint === '/' ? 'Rootfs' : dev.mountpoint.split('/').pop()) : dev.name;
            
            result.push({
              label: `${label} (${dev.size})`,
              path: dev.mountpoint || '',
              isMounted
            });
          }
        }
        return result;
      };

      const drives = extractDrives(parsed.blockdevices || []);
      return res.json(drives);
    } catch (e) {
      console.error('Failed to get Linux drives via lsblk:', e);
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
