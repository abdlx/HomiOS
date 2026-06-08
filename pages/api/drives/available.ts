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
      // Added FSUSED and FSUSE% to get live usage statistics
      const { stdout } = await execAsync('lsblk -J -o NAME,MOUNTPOINTS,TYPE,SIZE,FSTYPE,FSUSED,FSUSE%');
      const parsed = JSON.parse(stdout);

      const extractDrives = (devices: any[]): any[] => {
        const result: any[] = [];
        for (const dev of devices) {
          if (dev.children && dev.children.length > 0) {
            result.push(...extractDrives(dev.children));
            continue;
          }

          // Skip loop devices (snaps), swap partitions, and extended partition containers
          if (
            dev.type === 'loop' || 
            dev.fstype === 'swap' || 
            dev.type === 'extended' ||
            dev.size === '1K'
          ) {
            continue;
          }
          
          // Only skip optical drives (CD/DVD/Blu-ray) if they are completely empty (no filesystem)
          if (dev.type === 'rom' && !dev.fstype) {
            continue;
          }

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

          // Parse FSUSE% (e.g. "45%" -> 45)
          let usagePercent = undefined;
          if (dev['fsuse%']) {
            const parsedPct = parseFloat(dev['fsuse%'].replace('%', '').trim());
            if (!isNaN(parsedPct)) usagePercent = parsedPct;
          }

          result.push({
            label: `${label} (${dev.size})`,
            path: mountPoint || '',
            name: dev.name,
            fstype: dev.fstype,
            isMounted,
            usedBytes: dev.fsused || undefined,
            usagePercent: usagePercent,
            size: dev.size,
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
