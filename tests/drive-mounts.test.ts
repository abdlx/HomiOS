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
      OPENFINDER_DRIVE_MOUNT_ROOT: '/mnt/openfinder-drives',
    };

    expect(getDriveMountPoint('sda1', env)).toBe('/mnt/openfinder-drives/sda1');
    expect(getDriveMountPoint('sdb1', env)).toBe('/mnt/openfinder-drives/sdb1');
    expect(getDriveMountPoint('nvme0n1p1', env)).toBe('/mnt/openfinder-drives/nvme0n1p1');
    expect(getDriveMountPoint('sda1', env)).toBe('/mnt/openfinder-drives/sda1');
  });

  it('defaults to the existing OpenFinder Samba root', () => {
    const env = { ROOT_DIR: '/', OPENFINDER_SAMBA_ROOT: '/srv/openfinder-storage' };
    expect(getDriveMountPoint('mmcblk0p1', env)).toBe('/srv/openfinder-storage/mmcblk0p1');
  });

  it('normalizes the configured root without changing the device slot', () => {
    const env = {
      ROOT_DIR: '/srv/files',
      OPENFINDER_DRIVE_MOUNT_ROOT: '/srv/files/mounts/../mounts',
    };
    expect(getDriveMountRoot(env)).toBe('/srv/files/mounts');
    expect(getDriveMountPoint('sdc2', env)).toBe('/srv/files/mounts/sdc2');
  });

  it('rejects relative or out-of-root mount roots', () => {
    expect(() => getDriveMountRoot({
      ROOT_DIR: '/',
      OPENFINDER_DRIVE_MOUNT_ROOT: 'relative/mounts',
    })).toThrow(DriveMountPathError);

    expect(() => getDriveMountRoot({
      ROOT_DIR: '/srv/files',
      OPENFINDER_DRIVE_MOUNT_ROOT: '/mnt/openfinder-drives',
    })).toThrow(/inside ROOT_DIR/);
  });

  it('rejects device names that could escape or alter the predefined path', () => {
    const env = { ROOT_DIR: '/', OPENFINDER_DRIVE_MOUNT_ROOT: '/mnt/drives' };
    expect(() => getDriveMountPoint('../sda1', env)).toThrow(/Invalid device name/);
    expect(() => getDriveMountPoint('sda1/other', env)).toThrow(/Invalid device name/);
    expect(() => getDriveMountPoint('', env)).toThrow(/Invalid device name/);
  });
});
