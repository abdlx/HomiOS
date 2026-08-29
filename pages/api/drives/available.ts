import { readdir } from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { withAuth } from '../../../lib/api-auth.ts';
import { applyDriveNicknames } from '../../../lib/drive-labels.ts';
import { getDb } from '../../../lib/db.ts';
import { CLOUD_ROOT, cloudDriveConfigured, cloudStorageSummary } from '../../../lib/cloud-drive.ts';

/** Overlay user-set nicknames and attach tri-state introspection metadata, then respond. */
const sendDrives = async (res: any, drives: any[]) => {
  if (cloudDriveConfigured()) {
    try {
      const summary = await cloudStorageSummary();
      const total = Number(summary.totalBytes || 0);
      const used = Number(summary.usedBytes || 0);
      const free = Number(summary.availableBytes || Math.max(0, total - used));
      drives.push({
        label: CLOUD_ROOT,
        path: CLOUD_ROOT,
        name: 'cloud-drive',
        uuid: 'homios-cloud-drive',
        fstype: 'cloud',
        isMounted: true,
        isSystem: false,
        isRemovable: false,
        isReadOnly: false,
        model: 'Pooled cloud storage',
        totalBytesNumber: total,
        usedBytesNumber: used,
        freeBytesNumber: free,
        totalBytes: humanBytes(total),
        usedBytes: humanBytes(used),
        freeBytes: humanBytes(free),
        usagePercent: total > 0 ? Math.round((used / total) * 100) : 0,
        cloud: true,
        accounts: summary.accounts?.length || 0,
      });
    } catch (error) {
      console.error('[drives] Cloud storage unavailable:', error);
    }
  }
  const namedDrives = applyDriveNicknames(drives);
  const enriched = attachTriStateIntrospection(namedDrives);
  return res.json(enriched);
};

function attachTriStateIntrospection(drives: any[]) {
  try {
    const db = getDb();
    const shares = db.prepare('SELECT name, path FROM shares WHERE enabled = 1').all() as Array<{ name: string; path: string }>;
    const syncPlans = db.prepare('SELECT * FROM sync_plans WHERE enabled = 1').all() as Array<any>;
    const latestRuns = db.prepare(`
      SELECT plan_id, status, created_at FROM sync_runs
      WHERE id IN (SELECT MAX(id) FROM sync_runs GROUP BY plan_id)
    `).all() as Array<{ plan_id: string; status: string; created_at: string }>;
    const runMap = new Map(latestRuns.map(r => [r.plan_id, r]));

    return drives.map((drive) => {
      // 1. Check Samba Sharing State
      const matchingShares = shares.filter((s) => {
        if (!drive.path) return false;
        const normDrive = path.resolve(drive.path);
        const normShare = path.resolve(s.path);
        return normShare === normDrive || normShare.startsWith(normDrive + path.sep) || normDrive.startsWith(normShare + path.sep);
      });

      const isShared = matchingShares.length > 0;
      const shareNames = matchingShares.map((s) => s.name);

      // 2. Check Backup / Protection State
      let isProtected = false;
      let protectionPlanId: string | undefined;
      let protectionPlanName: string | undefined;
      let protectionMode: 'mirror' | 'backup' | 'versioned' | undefined;
      let protectionHealth: 'healthy' | 'at_risk' | 'degraded' | 'unprotected' = 'unprotected';
      let lastBackupAt: string | null = null;
      let lastBackupStatus: string | null = null;

      for (const plan of syncPlans) {
        let sources: string[] = [];
        let sourceUuids: string[] = [];
        try { sources = JSON.parse(plan.sources || '[]'); } catch {}
        try { sourceUuids = JSON.parse(plan.source_uuids || '[]'); } catch {}

        const matchesPath = drive.path && sources.some((src) => path.resolve(src) === path.resolve(drive.path));
        const matchesUuid = drive.uuid && sourceUuids.includes(drive.uuid);

        if (matchesPath || matchesUuid) {
          isProtected = true;
          protectionPlanId = plan.id;
          protectionPlanName = plan.name;
          protectionMode = (plan.mode || (plan.mirror_deletes ? 'mirror' : 'backup')) as any;
          lastBackupAt = plan.last_run_at;
          lastBackupStatus = plan.last_status;

          const lastRun = runMap.get(plan.id);
          if (lastRun) {
            lastBackupAt = lastRun.created_at;
            lastBackupStatus = lastRun.status;
          }

          if (!drive.isMounted) {
            protectionHealth = 'at_risk';
          } else if (lastBackupStatus === 'failed') {
            protectionHealth = 'degraded';
          } else if (lastBackupAt) {
            const elapsedHours = (Date.now() - new Date(`${lastBackupAt.replace(' ', 'T')}Z`).getTime()) / (1000 * 3600);
            if (elapsedHours > 48) {
              protectionHealth = 'at_risk';
            } else {
              protectionHealth = 'healthy';
            }
          } else {
            protectionHealth = 'healthy';
          }
          break;
        }
      }

      return {
        ...drive,
        isShared,
        shareNames,
        isProtected,
        protectionPlanId,
        protectionPlanName,
        protectionMode,
        protectionHealth: isProtected ? protectionHealth : 'unprotected',
        lastBackupAt,
        lastBackupStatus,
      };
    });
  } catch (err) {
    console.error('[drives] Failed to attach tri-state introspection:', err);
    return drives;
  }
}

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
): Promise<{
  usedBytes?: string;
  totalBytes?: string;
  freeBytes?: string;
  usagePercent?: number;
  usedBytesNumber?: number;
  totalBytesNumber?: number;
  freeBytesNumber?: number;
}> => {
  try {
    const { stdout } = await execAsync(`df -PB1 ${JSON.stringify(mountPoint)}`);
    const line = stdout.trim().split('\n')[1];
    if (!line) return {};
    const cols = line.trim().split(/\s+/);
    const total = parseInt(cols[1], 10);
    const used = parseInt(cols[2], 10);
    const free = parseInt(cols[3], 10);
    if (isNaN(total) || isNaN(used) || total <= 0) return {};
    return {
      usedBytes: humanBytes(used),
      totalBytes: humanBytes(total),
      freeBytes: humanBytes(free),
      usagePercent: Math.round((used / total) * 100),
      usedBytesNumber: used,
      totalBytesNumber: total,
      freeBytesNumber: free,
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
      // lsblk with UUID, PARTUUID, MOUNTPOINTS works across Linux kernels.
      const { stdout } = await execAsync(
        'lsblk -J -b -o NAME,UUID,PARTUUID,MOUNTPOINTS,TYPE,SIZE,FSTYPE,FSUSED,FSSIZE,FSUSE%,LABEL,MODEL,RM,RO,HOTPLUG'
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
              let freeBytes: string | undefined;
              let usagePercent: number | undefined;
              let usedBytesNumber: number | undefined;
              let totalBytesNumber: number | undefined = isNaN(sizeBytes) ? undefined : sizeBytes;
              let freeBytesNumber: number | undefined;

              const fsUsed = typeof dev.fsused === 'number' ? dev.fsused : parseInt(dev.fsused, 10);
              const fsSize = typeof dev.fssize === 'number' ? dev.fssize : parseInt(dev.fssize, 10);
              if (!isNaN(fsUsed)) {
                usedBytes = humanBytes(fsUsed);
                usedBytesNumber = fsUsed;
              }
              if (!isNaN(fsSize) && fsSize > 0) {
                totalBytes = humanBytes(fsSize);
                totalBytesNumber = fsSize;
              }
              if (!isNaN(fsUsed) && !isNaN(fsSize) && fsSize >= fsUsed) {
                freeBytesNumber = fsSize - fsUsed;
                freeBytes = humanBytes(freeBytesNumber);
                usagePercent = Math.round((fsUsed / fsSize) * 100);
              } else if (dev['fsuse%']) {
                const pct = parseFloat(String(dev['fsuse%']).replace('%', '').trim());
                if (!isNaN(pct)) usagePercent = pct;
              }

              result.push({
                label: size ? `${label} (${size})` : label,
                path: mountPoint || '',
                name: dev.name,
                uuid: dev.uuid || undefined,
                partUuid: dev.partuuid || undefined,
                fstype: dev.fstype || undefined,
                isMounted,
                isSystem: mountPoint === '/' || mountPoint === '/boot' || mountPoint === '/boot/efi',
                isRemovable: dev.rm === true || dev.hotplug === true,
                isReadOnly: dev.ro === true,
                model: model || undefined,
                usedBytes,
                totalBytes,
                freeBytes,
                usedBytesNumber,
                totalBytesNumber,
                freeBytesNumber,
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
              d.freeBytes = usage.freeBytes;
              d.usagePercent = usage.usagePercent;
              d.usedBytesNumber = usage.usedBytesNumber;
              d.totalBytesNumber = usage.totalBytesNumber;
              d.freeBytesNumber = usage.freeBytesNumber;
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

      return sendDrives(res, drives);
    } catch (e) {
      console.error('Failed to get Linux drives via lsblk:', e);
    }
  }

  if (platform === 'darwin') {
    try {
      const { stdout } = await execAsync('df -PkTl');
      const drives = stdout
        .trim()
        .split('\n')
        .slice(1)
        .map((line) => {
          const cols = line.trim().split(/\s+/);
          const mountPoint = cols.slice(6).join(' ');
          const totalKb = parseInt(cols[2], 10);
          const usedKb = parseInt(cols[3], 10);
          const freeKb = parseInt(cols[4], 10);
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
            uuid: `darwin-${name}`,
            fstype: cols[1],
            isMounted: true,
            isSystem: mountPoint === '/',
            isRemovable: mountPoint.startsWith('/Volumes/'),
            isReadOnly: false,
            usedBytes: humanBytes(usedKb * 1024),
            totalBytes: size,
            freeBytes: humanBytes(freeKb * 1024),
            usedBytesNumber: usedKb * 1024,
            totalBytesNumber: totalKb * 1024,
            freeBytesNumber: freeKb * 1024,
            usagePercent: Math.round((usedKb / totalKb) * 100),
            size,
          };
        })
        .filter(Boolean);
      return sendDrives(res, drives);
    } catch (e) {
      console.error('Failed to get macOS drives via df:', e);
    }
  }

  if (platform === 'win32') {
    try {
      const ps =
        'powershell -NoProfile -NonInteractive -Command "Get-CimInstance Win32_LogicalDisk | ' +
        'Select-Object DeviceID,VolumeName,FileSystem,Size,FreeSpace,DriveType,VolumeSerialNumber | ConvertTo-Json -Compress"';
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
            path: total > 0 ? `${name}\\` : '',
            name,
            uuid: d.VolumeSerialNumber || `win-${name.replace(':', '')}`,
            fstype: d.FileSystem || undefined,
            isMounted: total > 0,
            isSystem: name.toUpperCase() === (process.env.SystemDrive || 'C:').toUpperCase(),
            isRemovable: d.DriveType === 2,
            isReadOnly: d.DriveType === 5,
            usedBytes: total > 0 ? humanBytes(used) : undefined,
            totalBytes: size,
            freeBytes: total > 0 ? humanBytes(free) : undefined,
            usedBytesNumber: total > 0 ? used : undefined,
            totalBytesNumber: total > 0 ? total : undefined,
            freeBytesNumber: total > 0 ? free : undefined,
            usagePercent: total > 0 ? Math.round((used / total) * 100) : undefined,
            size,
          };
        });
      return sendDrives(res, drives);
    } catch (e) {
      console.error('Failed to get Windows drives via CIM:', e);
    }
  }

  const drivesPath = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');

  try {
    const drives = await readdir(drivesPath, { withFileTypes: true });
    const mockDrives = drives
      .filter((d) => d.isDirectory())
      .map((d) => ({
        label: d.name,
        path: isDev ? d.name : `/${d.name}`,
        name: d.name,
        uuid: `mock-${d.name}`,
        isMounted: true,
        size: '250G',
        usedBytes: '120G',
        totalBytes: '250G',
        freeBytes: '130G',
        usedBytesNumber: 120 * 1024 * 1024 * 1024,
        totalBytesNumber: 250 * 1024 * 1024 * 1024,
        freeBytesNumber: 130 * 1024 * 1024 * 1024,
        usagePercent: 48,
      }));
    return sendDrives(res, mockDrives);
  } catch (err) {
    console.error(`Failed to read drives from ${drivesPath}:`, err);
    return res.json([]);
  }
}, { adminOnly: true });
