import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseMountInfo, resolveAppStorageMounts } from '../../lib/apps/mount-inventory.ts';
import type { AppTemplate } from '../../lib/apps/types.ts';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

function storageTemplate(): AppTemplate {
  return {
    schemaVersion: 1,
    id: 'immich',
    name: 'Immich',
    provider: 'coolify',
    providerType: 'immich',
    category: 'Photos',
    description: '',
    verified: true,
    icon: '',
    storage: [{ id: 'library', label: 'Photo Library', required: true, protectable: true }],
    desktop: { enabled: true, openMode: 'external-url' },
  };
}

describe('HomiOS app mount inventory', () => {
  it('returns every real mount below the configured storage root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homios-mounts-'));
    directories.push(root);
    const first = path.join(root, 'sda1');
    const second = path.join(root, 'media', 'archive');
    fs.mkdirSync(first);
    fs.mkdirSync(second, { recursive: true });

    const inventory = parseMountInfo([
      `36 25 0:32 / ${first} rw,relatime - ext4 /dev/sda1 rw`,
      `37 25 0:33 / ${second} ro,relatime - xfs /dev/sdb1 ro`,
      '38 25 0:34 / / rw,relatime - ext4 /dev/system rw',
    ].join('\n'), root);

    expect(inventory).toHaveLength(2);
    expect(inventory.map((mount) => mount.path)).toEqual([first, second].sort());
    expect(inventory.find((mount) => mount.path === second)).toMatchObject({ readOnly: true, filesystem: 'xfs' });
  });

  it('defaults storage-aware apps to all mounts and rejects stale mount IDs', () => {
    const available = [
      { id: 'one', name: 'sda1', path: '/mnt/homios-storage/sda1', readOnly: false },
      { id: 'two', name: 'sdb1', path: '/mnt/homios-storage/sdb1', readOnly: true },
    ];
    expect(resolveAppStorageMounts(storageTemplate(), undefined, available)).toEqual(available);
    expect(() => resolveAppStorageMounts(storageTemplate(), ['gone'], available)).toThrow(/no longer mounted/);
    expect(() => resolveAppStorageMounts(storageTemplate(), [], available)).toThrow(/at least one/);
  });
});
