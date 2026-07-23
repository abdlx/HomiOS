import { readdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { withAuth } from '../../../lib/api-auth.ts';

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

/** Format a byte count as a short human string, e.g. 1288490188 -> "1.2G" */
const humanBytes = (bytes: number): string => {
  if (!isFinite(bytes) || bytes <= 0) return '0B';
  const units = ['B', 'K', 'M', 'G', 'T', 'P'];
  let idx = 0;
  let val = bytes;
  while (val >= 1024 && idx < units.length - 1) {
    val /= 1024;
    idx++;
  }
  return `${val >= 10 || idx === 0 ? Math.round(val) : val.toFixed(1)}${units[idx]}`;
};

/**
 * Live usage for a mount point, used when lsblk does not report FSUSED/FSUSE%
 * (older util-linux, or filesystems it cannot introspect).
 */
const dfUsage = async (
  mountPoint: string
): Promise<{ usedBytes?: string; totalBytes?: string; usagePercent?: number }> => {
  try {
    const { stdout } = await execAsync(`df -PB1 ${JSON.stringify(mountPoint)}`);
    const line = stdout.trim().split('\n')[1];
    if (!line) return {};
    const cols = line.trim().split(/\s+/);
    const total = parseInt(cols[1], 10);
    const used = parseInt(cols[2], 10);
    if (isNaN(total) || isNaN(used) || total <= 0) return {};
    return {
      usedBytes: humanBytes(used),
      totalBytes: humanBytes(total),
      usagePercent: Math.round((used / total) * 100),
    };
  } catch {
    return {};
  }
};

export default withAuth(async function handler(req: any, res: any) {
  const isDev = process.env.NODE_ENV !== 'production';
  const platform = os.platform();

  if (platform === 'linux') {
    try {
      // lsblk with MOUNTPOINTS (plural) works on both old and new kernels.
      // FSUSED / FSUSE% give live usage where the kernel can report it.
      const { stdout } = await execAsync(
        'lsblk -J -b -o NAME,MOUNTPOINTS,TYPE,SIZE,FSTYPE,FSUSED,FSSIZE,FSUSE%,LABEL,MODEL,RM,RO,HOTPLUG'
      );
      const parsed = JSON.parse(stdout);

      const collect = (devices: any[], parentModel?: string): any[] => {
        const result: any[] = [];

        for (const dev of devices) {
          const model: string | undefined = dev.model || parentModel;
          const children: any[] = dev.children || [];

          // Skip loop devices (snaps) and swap areas — not user-facing storage.
          const isSwap = dev.fstype === 'swap';
          const isLoop = dev.type === 'loop';
          // Extended-partition containers hold no data of their own.
          const isExtendedContainer = dev.type === 'extended';
          // Empty optical drives have nothing to browse or mount.
          const isEmptyOptical = dev.type === 'rom' && !dev.fstype && !children.length;

          const skipSelf = isSwap || isLoop || isExtendedContainer || isEmptyOptical;

          if (!skipSelf) {
            const mountpointsRaw: (string | null)[] =
              dev.mountpoints || (dev.mountpoint ? [dev.mountpoint] : []);
            const validMounts = mountpointsRaw.filter((m) => m && m !== '[SWAP]');
            const mountPoint = (validMounts[0] as string) || null;
            const isMounted = !!mountPoint;

            // A parent disk is only worth listing on its own when it carries a
            // filesystem directly (no partition table) — otherwise its children
            // are the real storage and listing both would duplicate capacity.
            const isContainerOnly = children.length > 0 && !dev.fstype && !isMounted;

            if (!isContainerOnly) {
              const sizeBytes = typeof dev.size === 'number' ? dev.size : parseInt(dev.size, 10);
              const size = isNaN(sizeBytes) ? undefined : humanBytes(sizeBytes);

              let label: string;
              if (dev.label) {
                label = dev.label;
              } else if (isMounted) {
                label = mountPoint!.split('/').filter(Boolean).pop() || mountPoint!;
              } else if (model) {
                label = model;
              } else {
                label = dev.name;
              }

              let usedBytes: string | undefined;
              let totalBytes: string | undefined = size;
              let usagePercent: number | undefined;

              const fsUsed = typeof dev.fsused === 'number' ? dev.fsused : parseInt(dev.fsused, 10);
              const fsSize = typeof dev.fssize === 'number' ? dev.fssize : parseInt(dev.fssize, 10);
              if (!isNaN(fsUsed)) usedBytes = humanBytes(fsUsed);
              if (!isNaN(fsSize) && fsSize > 0) totalBytes = humanBytes(fsSize);
              if (!isNaN(fsUsed) && !isNaN(fsSize) && fsSize > 0) {
                usagePercent = Math.round((fsUsed / fsSize) * 100);
              } else if (dev['fsuse%']) {
                const pct = parseFloat(String(dev['fsuse%']).replace('%', '').trim());
                if (!isNaN(pct)) usagePercent = pct;
              }

              result.push({
                label: size ? `${label} (${size})` : label,
                path: mountPoint || '',
                name: dev.name,
                fstype: dev.fstype || undefined,
                isMounted,
                isSystem: mountPoint === '/' || mountPoint === '/boot' || mountPoint === '/boot/efi',
                isRemovable: dev.rm === true || dev.hotplug === true,
                isReadOnly: dev.ro === true,
                model: model || undefined,
                usedBytes,
                totalBytes,
                usagePercent,
                size,
                _mountPoint: mountPoint,
              });
            }
          }

          if (children.length > 0) {
            result.push(...collect(children, model));
          }
        }

        return result;
      };

      const drives = collect(parsed.blockdevices || []);

      // Backfill usage for anything lsblk could not measure (e.g. NTFS, network-backed).
      await Promise.all(
        drives.map(async (d) => {
          if (d._mountPoint && d.usagePercent === undefined) {
            const usage = await dfUsage(d._mountPoint);
            if (usage.usagePercent !== undefined) {
              d.usedBytes = usage.usedBytes;
              d.totalBytes = usage.totalBytes;
              d.usagePercent = usage.usagePercent;
            }
          }
          delete d._mountPoint;
        })
      );

      // Mounted first, then system volumes last within each group.
      drives.sort((a, b) => {
        if (a.isMounted !== b.isMounted) return a.isMounted ? -1 : 1;
        if (a.isSystem !== b.isSystem) return a.isSystem ? 1 : -1;
        return a.name.localeCompare(b.name);
      });

      return res.json(drives);
    } catch (e) {
      console.error('Failed to get Linux drives via lsblk:', e);
      // If lsblk fails entirely, fall through to the readdir fallback below.
    }
  }

  if (platform === 'darwin') {
    try {
      // -l restricts to local filesystems; skip pseudo-filesystems below.
      const { stdout } = await execAsync('df -PkTl');
      const drives = stdout
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => {
          const cols = line.trim().split(/\s+/);
          // Mount points can contain spaces, so take everything after column 6.
          const mountPoint = cols.slice(6).join(' ');
          const totalKb = parseInt(cols[2], 10);
          const usedKb = parseInt(cols[3], 10);
          if (!mountPoint || isNaN(totalKb) || totalKb <= 0) return null;
          if (mountPoint.startsWith('/System/Volumes/') && mountPoint !== '/System/Volumes/Data') {
            return null;
          }
          const name = cols[0].replace('/dev/', '');
          const label =
            mountPoint === '/' ? 'Macintosh HD' : mountPoint.split('/').filter(Boolean).pop() || mountPoint;
          const size = humanBytes(totalKb * 1024);
          return {
            label: `${label} (${size})`,
            path: mountPoint,
            name,
            fstype: cols[1],
            isMounted: true,
            isSystem: mountPoint === '/',
            isRemovable: mountPoint.startsWith('/Volumes/'),
            isReadOnly: false,
            usedBytes: humanBytes(usedKb * 1024),
            totalBytes: size,
            usagePercent: Math.round((usedKb / totalKb) * 100),
            size,
          };
        })
        .filter(Boolean);
      return res.json(drives);
    } catch (e) {
      console.error('Failed to get macOS drives via df:', e);
    }
  }

  if (platform === 'win32') {
    try {
      // Volume covers lettered drives and mount points; DriveType 3 = fixed, 2 = removable, 5 = optical.
      const ps =
        'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_LogicalDisk | ' +
        'Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace,DriveType | ConvertTo-Json -Compress"';
      const { stdout } = await execAsync(ps);
      const raw = JSON.parse(stdout);
      const list = Array.isArray(raw) ? raw : [raw];
      const drives = list
        .filter((d: any) => d && d.DeviceID)
        .map((d: any) => {
          const total = Number(d.Size) || 0;
          const free = Number(d.FreeSpace) || 0;
          const used = total - free;
          const size = total > 0 ? humanBytes(total) : undefined;
          const name = String(d.DeviceID); // e.g. "C:"
          const label = d.VolumeName || (d.DriveType === 5 ? 'Optical Drive' : 'Local Disk');
          return {
            label: size ? `${label} ${name} (${size})` : `${label} ${name}`,
            // Trailing separator so the path is a drive root, not a relative ref.
            path: total > 0 ? `${name}\\` : '',
            name,
            fstype: d.FileSystem || undefined,
            isMounted: total > 0,
            isSystem: name.toUpperCase() === (process.env.SystemDrive || 'C:').toUpperCase(),
            isRemovable: d.DriveType === 2,
            isReadOnly: d.DriveType === 5,
            usedBytes: total > 0 ? humanBytes(used) : undefined,
            totalBytes: size,
            usagePercent: total > 0 ? Math.round((used / total) * 100) : undefined,
            size,
          };
        });
      return res.json(drives);
    } catch (e) {
      console.error('Failed to get Windows drives via CIM:', e);
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
}, { adminOnly: true });
