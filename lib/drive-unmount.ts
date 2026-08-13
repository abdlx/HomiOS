import path from 'path';

const linuxPath = path.posix;

export type ExecFileResult = { stdout: string; stderr: string };
export type ExecFileFn = (file: string, args: string[]) => Promise<ExecFileResult>;

export class DriveUnmountError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'DriveUnmountError';
    this.status = status;
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = linuxPath.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !linuxPath.isAbsolute(rel));
}

function parseMountTargets(stdout: string): string[] {
  try {
    const parsed = JSON.parse(stdout);
    const filesystems = Array.isArray(parsed?.filesystems) ? parsed.filesystems : [];
    return filesystems
      .map((filesystem: any) => filesystem?.target)
      .filter((target: any): target is string => typeof target === 'string' && linuxPath.isAbsolute(target))
      .map((target: string) => linuxPath.resolve(target));
  } catch {
    throw new DriveUnmountError(500, 'Could not read the drive mount state');
  }
}

const PROTECTED_MOUNTS = new Set(['/', '/boot', '/boot/efi']);

export async function unmountDrive(
  input: { device: unknown; mountPoint: unknown; activeSharePaths?: string[] },
  exec: ExecFileFn,
): Promise<{ ok: true; device: string; mountPoint: string }> {
  const device = String(input.device || '');
  if (!/^[a-zA-Z0-9_-]+$/.test(device)) {
    throw new DriveUnmountError(400, 'Invalid device name');
  }

  const requestedMount = String(input.mountPoint || '').trim();
  if (!requestedMount || !linuxPath.isAbsolute(requestedMount)) {
    throw new DriveUnmountError(400, 'A valid mount point is required');
  }

  const devPath = `/dev/${device}`;
  let findResult: ExecFileResult;
  try {
    findResult = await exec('findmnt', ['--json', '--source', devPath, '--output', 'TARGET']);
  } catch (error: any) {
    if (error?.code === 1) {
      throw new DriveUnmountError(409, 'This drive is already unmounted');
    }
    throw new DriveUnmountError(500, 'Could not verify the drive mount state');
  }

  const targets = parseMountTargets(findResult.stdout);
  const mountPoint = linuxPath.resolve(requestedMount);
  if (!targets.includes(mountPoint)) {
    throw new DriveUnmountError(409, 'The drive mount point changed; refresh Storage and try again');
  }
  if (PROTECTED_MOUNTS.has(mountPoint)) {
    throw new DriveUnmountError(400, 'System volumes cannot be unmounted from OpenFinder');
  }

  const activeShare = (input.activeSharePaths || [])
    .map((sharePath) => linuxPath.resolve(sharePath))
    .find((sharePath) => isInside(mountPoint, sharePath));
  if (activeShare) {
    throw new DriveUnmountError(409, 'Disable or delete active Samba shares on this drive before unmounting it');
  }

  try {
    await exec('umount', [mountPoint]);
  } catch (error: any) {
    const output = String(error?.stderr || error?.stdout || error?.message || '');
    if (/busy/i.test(output)) {
      throw new DriveUnmountError(409, 'The drive is busy. Close open files and terminal sessions, then try again');
    }
    if (/permission denied|not permitted|must be superuser/i.test(output)) {
      throw new DriveUnmountError(500, 'OpenFinder does not have permission to unmount this drive');
    }
    throw new DriveUnmountError(500, 'Unmount failed');
  }

  return { ok: true, device, mountPoint };
}
