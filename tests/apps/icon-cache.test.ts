import { describe, expect, it, vi } from 'vitest';
import {
  CODE_SERVER_ICON_URL,
  ensureIconCached,
  readBundledIcon,
} from '../../lib/apps/icon-cache.ts';

describe('App Store icon cache', () => {
  it('serves the official Code Server artwork from the bundled server cache', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    const icon = await ensureIconCached(CODE_SERVER_ICON_URL);
    expect(icon?.contentType).toBe('image/svg+xml');
    expect(icon?.bytes.toString('utf8')).toContain('<svg');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('rejects icon URLs outside the trusted Coolify artwork tree', () => {
    expect(readBundledIcon('https://example.com/icon.svg')).toBeNull();
    expect(readBundledIcon('https://raw.githubusercontent.com/coollabsio/coolify/refs/heads/main/public/../secret')).toBeNull();
  });
});
