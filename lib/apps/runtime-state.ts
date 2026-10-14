import type { ManagedApp, RuntimeApp } from './types.ts';

export function reconciledAppStatus(app: ManagedApp, runtime: RuntimeApp) {
  const expected = ({ starting: 'running', restarting: 'running', stopping: 'stopped', redeploying: 'running' } as Record<string, string>)[app.status];
  const updatedAt = Date.parse(app.updatedAt?.includes('T') ? app.updatedAt : `${app.updatedAt?.replace(' ', 'T')}Z`);
  if (expected && runtime.status !== expected && !['error', 'unhealthy', 'missing'].includes(runtime.status) && Date.now() - updatedAt < 120_000) return app.status;
  return runtime.status;
}
