import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { withAuth } from '../../../lib/api-auth.ts';
import { mkdir } from 'fs/promises';
import { getSambaRoot } from '../../../lib/safe-paths.ts';

const execFileAsync = (file: string, args: string[]): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error: any, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        error.stdout = stdout;
      }
      if (error) reject(error);
      else resolve({ stdout, stderr });
    });
  });
};

/** Use blkid to detect the filesystem type of a block device */
async function detectFsType(devPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('blkid', ['-o', 'value', '-s', 'TYPE', devPath]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Map filesystem types to the correct mount command flags */
function buildMountCommand(fsType: string | null): string {
  switch (fsType) {
    case 'ntfs':
    case 'ntfs-3g':
      return `ntfs-3g|uid=0,gid=0,umask=000`;
    case 'exfat':
      return `exfat|uid=0,gid=0,umask=000`;
    case 'vfat':
    case 'fat32':
    case 'msdos':
      return `vfat|uid=0,gid=0,umask=000`;
    case 'ext4':
    case 'ext3':
    case 'ext2':
      return `${fsType}|`;
    case 'btrfs':
      return `btrfs|`;
    case 'xfs':
      return `xfs|`;
    default:
      return '|';
  }
}

export default withAuth(async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).end();

  if (os.platform() !== 'linux') {
    return res.status(400).json({ error: 'Mounting is only supported on Linux' });
  }

  const { device } = req.body; // e.g. "sda1" or "nvme0n1p1"
  if (!device) return res.status(400).json({ error: 'Device name is required' });

  // Sanitize — only allow alphanumeric, dash, underscore
  const safeDevice = String(device);
  if (!/^[a-zA-Z0-9_-]+$/.test(safeDevice)) {
    return res.status(400).json({ error: 'Invalid device name' });
  }
  // Managed disks live inside the isolated Samba tree, so folders selected in
  // Finder can be shared without widening Samba access to the host filesystem.
  const mountPoint = path.join(getSambaRoot(), safeDevice);
  const devPath = `/dev/${safeDevice}`;

  try {
    // Step 1: Ensure mount point directory exists
    await mkdir(mountPoint, { recursive: true });

    // Step 2: Detect filesystem type
    const fsType = await detectFsType(devPath);

    // Step 3: Build the correct mount command for this filesystem
    const [mountType, mountOptions] = buildMountCommand(fsType).split('|');

    // Step 4: Execute the mount
    const args = [];
    if (mountType) args.push('-t', mountType);
    if (mountOptions) args.push('-o', mountOptions);
    args.push(devPath, mountPoint);
    await execFileAsync('mount', args);

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
    return res.status(500).json({ error: 'Mount failed' });
  }
}, { adminOnly: true, ability: 'write' });
