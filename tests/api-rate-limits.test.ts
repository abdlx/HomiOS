import { describe, expect, it } from 'vitest';
import { apiRateLimitPreset } from '../lib/api-rate-limits.ts';

describe('API rate-limit routing', () => {
  it('keeps app artwork outside the lifecycle bucket', () => {
    expect(apiRateLimitPreset('/api/apps/uptime-kuma/icon')).toMatchObject({ bucket: 'app-icons', max: 600 });
  });

  it('gives catalog and reconciliation independent budgets', () => {
    expect(apiRateLimitPreset('/api/apps/catalog')?.bucket).toBe('app-catalog');
    expect(apiRateLimitPreset('/api/apps/reconcile')?.bucket).toBe('app-reconcile');
    expect(apiRateLimitPreset('/api/apps/service-1/restart')?.bucket).toBe('app-lifecycle');
  });
});
