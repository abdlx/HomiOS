import os from 'os';
import { exec } from 'child_process';
import { getSession } from '../../../lib/auth';
import { mkdir } from 'fs/promises';

const execAsync = (cmd: string): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
};

/** Use blkid to detect the filesystem type of a block device */
async function detectFsType(devPath: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(`blkid -o value -s TYPE ${devPath}`);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Map filesystem types to the correct mount command flags */
function buildMountCommand(devPath: string, mountPoint: string, fsType: string | null): string {
  switch (fsType) {
    case 'ntfs':
    case 'ntfs-3g':
      // Use ntfs-3g explicitly for full read/write support on NTFS
      return `mount -t ntfs-3g -o uid=0,gid=0,umask=000 ${devPath} ${mountPoint}`;
    case 'exfat':
      return `mount -t exfat -o uid=0,gid=0,umask=000 ${devPath} ${mountPoint}`;
    case 'vfat':
    case 'fat32':
    case 'msdos':
      return `mount -t vfat -o uid=0,gid=0,umask=000 ${devPath} ${mountPoint}`;
    case 'ext4':
    case 'ext3':
    case 'ext2':
      return `mount -t ${fsType} ${devPath} ${mountPoint}`;
    case 'btrfs':
      return `mount -t btrfs ${devPath} ${mountPoint}`;
    case 'xfs':
      return `mount -t xfs ${devPath} ${mountPoint}`;
    default:
      // Let the kernel auto-detect as a last resort
      return `mount ${devPath} ${mountPoint}`;
  }
}

export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  if (req.method !== 'POST') return res.status(405).end();

  if (os.platform() !== 'linux') {
    return res.status(400).json({ error: 'Mounting is only supported on Linux' });
  }

  const { device } = req.body; // e.g. "sda1" or "nvme0n1p1"
  if (!device) return res.status(400).json({ error: 'Device name is required' });

  // Sanitize — only allow alphanumeric, dash, underscore
  const safeDevice = device.replace(/[^a-zA-Z0-9_-]/g, '');
  const mountPoint = `/mnt/${safeDevice}`;
  const devPath = `/dev/${safeDevice}`;

  try {
    // Step 1: Ensure mount point directory exists
    await mkdir(mountPoint, { recursive: true });

    // Step 2: Detect filesystem type
    const fsType = await detectFsType(devPath);

    // Step 3: Build the correct mount command for this filesystem
    const mountCmd = buildMountCommand(devPath, mountPoint, fsType);

    // Step 4: Execute the mount
    await execAsync(mountCmd);

    return res.json({
      ok: true,
      mountPoint,
      fsType: fsType || 'auto',
    });
  } catch (err: any) {
    const msg: string = err.stderr || err.message || 'Unknown mount error';

    // Provide actionable error messages
    if (msg.includes('ntfs-3g') || (msg.includes('ntfs') && msg.includes('not found'))) {
      return res.status(500).json({
        error: 'ntfs-3g is not installed. Run: sudo apt-get install -y ntfs-3g',
      });
    }
    if (msg.includes('exfat') && msg.includes('not found')) {
      return res.status(500).json({
        error: 'exfat support missing. Run: sudo apt-get install -y exfatprogs',
      });
    }
    if (msg.includes('already mounted')) {
      return res.status(409).json({ error: `${devPath} is already mounted at another location.` });
    }
    if (msg.includes('permission denied') || msg.includes('not permitted')) {
      return res.status(500).json({
        error: 'Permission denied. Ensure OpenFinder is running as root (check systemd service User=root).',
      });
    }
    if (msg.includes('Cannot allocate memory')) {
      return res.status(500).json({
        error: `Cannot allocate memory — the kernel driver for this filesystem is missing. Detected FS: "${await detectFsType(devPath) || 'unknown'}". Try: sudo apt-get install -y ntfs-3g exfatprogs`,
      });
    }

    console.error(`Mount failed for ${device}:`, err);
    return res.status(500).json({ error: `Mount failed: ${msg}` });
  }
}
