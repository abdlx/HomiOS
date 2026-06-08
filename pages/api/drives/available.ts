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
      // Use lsblk with MOUNTPOINTS (plural) which works on both old and new kernels
      const { stdout } = await execAsync('lsblk -J -o NAME,MOUNTPOINTS,TYPE,SIZE,FSTYPE');
      const parsed = JSON.parse(stdout);

      const extractDrives = (devices: any[]): any[] => {
        const result: any[] = [];
        for (const dev of devices) {
          if (dev.children && dev.children.length > 0) {
            result.push(...extractDrives(dev.children));
            continue;
          }

          // Skip loop devices (snaps), swap partitions, optical drives (CD-ROMs), and extended partition containers
          if (
            dev.type === 'loop' || 
            dev.fstype === 'swap' || 
            dev.type === 'rom' || 
            dev.type === 'extended' ||
            dev.size === '1K'
          ) {
            continue;
          }
          // Skip small partitions like EFI (< 2G) — show them but mark clearly
          
          // Handle both: mountpoints (array, newer kernels) and mountpoint (string, older)
          const mountpointsRaw: (string | null)[] = dev.mountpoints || (dev.mountpoint ? [dev.mountpoint] : []);
          const validMounts = mountpointsRaw.filter((m: string | null) => m && m !== '[SWAP]');
          const mountPoint = validMounts[0] || null;

          // Skip the main root drive and boot partitions as they are accessed via the dedicated "Root" folder
          if (mountPoint === '/' || mountPoint === '/boot/efi') continue;

          const isMounted = !!mountPoint;

          let label: string;
          if (!isMounted) {
            label = dev.name; // e.g. "sda1"
          } else {
            // e.g. /mnt/data → "data"
            label = mountPoint!.split('/').filter(Boolean).pop() || mountPoint!;
          }

          result.push({
            label: `${label} (${dev.size})`,
            path: mountPoint || '',
            name: dev.name,
            isMounted,
          });
        }
        return result;
      };

      const drives = extractDrives(parsed.blockdevices || []);
      return res.json(drives);
    } catch (e) {
      console.error('Failed to get Linux drives via lsblk:', e);
      // If lsblk fails entirely, fall through to the readdir fallback below
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
