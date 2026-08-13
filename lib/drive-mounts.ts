import path from 'path';

const linuxPath = path.posix;

type DriveMountEnv = {
  OPENFINDER_DRIVE_MOUNT_ROOT?: string;
  OPENFINDER_SAMBA_ROOT?: string;
  ROOT_DIR?: string;
};

export class DriveMountPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DriveMountPathError';
  }
}

/** Root used exclusively for drives mounted manually from OpenFinder. */
export function getDriveMountRoot(
  env: DriveMountEnv = process.env as unknown as DriveMountEnv
): string {
  const configured = String(
    env.OPENFINDER_DRIVE_MOUNT_ROOT || env.OPENFINDER_SAMBA_ROOT || '/mnt/openfinder-storage'
  ).trim();
  if (!configured || !linuxPath.isAbsolute(configured)) {
    throw new DriveMountPathError('OPENFINDER_DRIVE_MOUNT_ROOT must be an absolute Linux path');
  }

  const mountRoot = linuxPath.resolve(configured);
  const filesRoot = linuxPath.resolve(String(env.ROOT_DIR || '/'));
  const relativeToFilesRoot = linuxPath.relative(filesRoot, mountRoot);
  if (relativeToFilesRoot.startsWith('..') || linuxPath.isAbsolute(relativeToFilesRoot)) {
    throw new DriveMountPathError('OPENFINDER_DRIVE_MOUNT_ROOT must be inside ROOT_DIR');
  }

  return mountRoot;
}

/** Return the one canonical manual-mount path for a Linux block device. */
export function getDriveMountPoint(
  device: unknown,
  env: DriveMountEnv = process.env as unknown as DriveMountEnv
): string {
  const safeDevice = String(device || '').trim();
  if (!/^[a-zA-Z0-9_-]+$/.test(safeDevice)) {
    throw new DriveMountPathError('Invalid device name');
  }
  return linuxPath.join(getDriveMountRoot(env), safeDevice);
}
