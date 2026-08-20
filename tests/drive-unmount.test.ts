import { describe, expect, it, vi } from 'vitest';
import { DriveUnmountError, unmountDrive } from '../lib/drive-unmount.ts';

const mountedAt = (target: string) => JSON.stringify({ filesystems: [{ target }] });

describe('drive unmount', () => {
  it('verifies the device mount point before unmounting it', async () => {
    const exec = vi.fn()
      .mockResolvedValueOnce({ stdout: mountedAt('/mnt/data'), stderr: '' })
      .mockResolvedValueOnce({ stdout: '', stderr: '' });

    await expect(unmountDrive({ device: 'sdb1', mountPoint: '/mnt/data' }, exec)).resolves.toEqual({
      ok: true,
      device: 'sdb1',
      mountPoint: '/mnt/data',
    });
    expect(exec).toHaveBeenNthCalledWith(1, 'findmnt', ['--json', '--source', '/dev/sdb1', '--output', 'TARGET']);
    expect(exec).toHaveBeenNthCalledWith(2, 'umount', ['/mnt/data']);
  });

  it('refuses system volumes', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: mountedAt('/'), stderr: '' });
    await expect(unmountDrive({ device: 'sda1', mountPoint: '/' }, exec)).rejects.toMatchObject({
      status: 400,
      message: 'System volumes cannot be unmounted from HomiOS',
    });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('refuses a drive containing an active Samba share', async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: mountedAt('/mnt/data'), stderr: '' });
    await expect(unmountDrive({
      device: 'sdb1',
      mountPoint: '/mnt/data',
      activeSharePaths: ['/mnt/data/photos'],
    }, exec)).rejects.toMatchObject({ status: 409 });
    expect(exec).toHaveBeenCalledTimes(1);
  });

  it('reports a busy drive without forcing the unmount', async () => {
    const busy: any = new Error('umount failed');
    busy.stderr = 'umount: /mnt/data: target is busy';
    const exec = vi.fn()
      .mockResolvedValueOnce({ stdout: mountedAt('/mnt/data'), stderr: '' })
      .mockRejectedValueOnce(busy);

    await expect(unmountDrive({ device: 'sdb1', mountPoint: '/mnt/data' }, exec)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining('busy'),
    });
  });

  it('rejects invalid device names before invoking system commands', async () => {
    const exec = vi.fn();
    await expect(unmountDrive({ device: '../sda1', mountPoint: '/mnt/data' }, exec))
      .rejects.toBeInstanceOf(DriveUnmountError);
    expect(exec).not.toHaveBeenCalled();
  });
});
