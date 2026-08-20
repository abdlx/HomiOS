import { describe, expect, it } from 'vitest';
import {
  DriveMountPathError,
  getDriveMountPoint,
  getDriveMountRoot,
} from '../lib/drive-mounts.ts';

describe('deterministic drive mount paths', () => {
  it('maps each device to one predictable path under the predefined root', () => {
    const env = {
      ROOT_DIR: '/',
      HOMIOS_DRIVE_MOUNT_ROOT: '/mnt/homios-drives',
    };

    expect(getDriveMountPoint('sda1', env)).toBe('/mnt/homios-drives/sda1');
    expect(getDriveMountPoint('sdb1', env)).toBe('/mnt/homios-drives/sdb1');
    expect(getDriveMountPoint('nvme0n1p1', env)).toBe('/mnt/homios-drives/nvme0n1p1');
    expect(getDriveMountPoint('sda1', env)).toBe('/mnt/homios-drives/sda1');
  });

  it('defaults to the existing HomiOS Samba root', () => {
    const env = { ROOT_DIR: '/', HOMIOS_SAMBA_ROOT: '/srv/homios-storage' };
    expect(getDriveMountPoint('mmcblk0p1', env)).toBe('/srv/homios-storage/mmcblk0p1');
  });

  it('normalizes the configured root without changing the device slot', () => {
    const env = {
      ROOT_DIR: '/srv/files',
      HOMIOS_DRIVE_MOUNT_ROOT: '/srv/files/mounts/../mounts',
    };
    expect(getDriveMountRoot(env)).toBe('/srv/files/mounts');
    expect(getDriveMountPoint('sdc2', env)).toBe('/srv/files/mounts/sdc2');
  });

  it('rejects relative or out-of-root mount roots', () => {
    expect(() => getDriveMountRoot({
      ROOT_DIR: '/',
      HOMIOS_DRIVE_MOUNT_ROOT: 'relative/mounts',
    })).toThrow(DriveMountPathError);

    expect(() => getDriveMountRoot({
      ROOT_DIR: '/srv/files',
      HOMIOS_DRIVE_MOUNT_ROOT: '/mnt/homios-drives',
    })).toThrow(/inside ROOT_DIR/);
  });

  it('rejects device names that could escape or alter the predefined path', () => {
    const env = { ROOT_DIR: '/', HOMIOS_DRIVE_MOUNT_ROOT: '/mnt/drives' };
    expect(() => getDriveMountPoint('../sda1', env)).toThrow(/Invalid device name/);
    expect(() => getDriveMountPoint('sda1/other', env)).toThrow(/Invalid device name/);
    expect(() => getDriveMountPoint('', env)).toThrow(/Invalid device name/);
  });
});
