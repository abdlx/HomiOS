import { describe, expect, it } from 'vitest';
import { configureHomiOSStorageInCompose } from '../../lib/apps/coolify-compose.ts';

const mount = (path: string) => ({ id: path, name: path.split('/').at(-1) || 'storage', path, readOnly: false });

describe('configureHomiOSStorageInCompose', () => {
  it('is idempotent after adding a managed bind', () => {
    const first = configureHomiOSStorageInCompose('services:\n  jellyfin:\n    image: jellyfin/jellyfin\n', 'jellyfin', [mount('/mnt/homios-storage/sdc1')]);
    const second = configureHomiOSStorageInCompose(first.compose, 'jellyfin', [mount('/mnt/homios-storage/sdc1')]);

    expect(first).toMatchObject({ added: 1, removed: 0, changed: true });
    expect(second).toMatchObject({ added: 0, removed: 0, changed: false });
    expect(second.compose).toBe(first.compose);
  });

  it('does not claim or later remove an identical user-owned bind', () => {
    const raw = 'services:\n  jellyfin:\n    volumes:\n      - /mnt/homios-storage/sdc1:/mnt/homios-storage/sdc1\n';
    const enabled = configureHomiOSStorageInCompose(raw, 'jellyfin', [mount('/mnt/homios-storage/sdc1')]);
    const disabled = configureHomiOSStorageInCompose(enabled.compose, 'jellyfin', []);

    expect(enabled).toMatchObject({ added: 0, removed: 0, changed: false });
    expect(disabled).toMatchObject({ added: 0, removed: 0, changed: false });
    expect(disabled.compose).toContain('/mnt/homios-storage/sdc1:/mnt/homios-storage/sdc1');
  });

  it('leaves duplicate binds intact when ownership becomes ambiguous', () => {
    const enabled = configureHomiOSStorageInCompose('services:\n  jellyfin: {}\n', 'jellyfin', [mount('/mnt/homios-storage/sdc1')]);
    const withDuplicate = enabled.compose.replace(
      'x-homios-managed-storage:',
      '      - /mnt/homios-storage/sdc1:/mnt/homios-storage/sdc1\nx-homios-managed-storage:',
    );
    const disabled = configureHomiOSStorageInCompose(withDuplicate, 'jellyfin', []);

    expect(disabled).toMatchObject({ added: 0, removed: 0, changed: true });
    expect(disabled.compose.match(/source: \/mnt\/homios-storage\/sdc1/g)).toHaveLength(1);
    expect(disabled.compose).toContain('/mnt/homios-storage/sdc1:/mnt/homios-storage/sdc1');
    expect(disabled.compose).not.toContain('x-homios-managed-storage');
  });

  it('rejects mounts outside the HomiOS storage tree', () => {
    expect(() => configureHomiOSStorageInCompose('services:\n  jellyfin: {}\n', 'jellyfin', [mount('/etc')]))
      .toThrow(/inside \/mnt\/homios-storage/);
  });
});
