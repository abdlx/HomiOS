import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { CoolifyClient, CoolifyProvider, normalizeCoolifyBaseUrl } from '../../lib/apps/providers/coolify.ts';

function response(status: number, body: any) {
  return new Response(body === null ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('CoolifyClient', () => {
  it('loads through the native Node TypeScript strip-only runtime', () => {
    const moduleUrl = new URL('../../lib/apps/providers/coolify.ts', import.meta.url).href;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', `await import(${JSON.stringify(moduleUrl)})`], {
      encoding: 'utf8',
    });
    expect(result.stderr).not.toContain('ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX');
    expect(result.status, result.stderr).toBe(0);
  });

  it('normalizes only http(s) base URLs', () => {
    expect(normalizeCoolifyBaseUrl('http://coolify.test/api/v1/')).toBe('http://coolify.test');
    expect(() => normalizeCoolifyBaseUrl('file:///etc/passwd')).toThrow(/http or https/);
    expect(() => normalizeCoolifyBaseUrl('http://user:pass@coolify.test')).toThrow(/credentials/);
  });

  it('keeps the bearer token server-side and classifies API errors', async () => {
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('Authorization')).toBe('Bearer secret');
      return response(401, { message: 'Unauthenticated.' });
    });
    const client = new CoolifyClient('https://coolify.test', 'secret', fetcher as any);
    await expect(client.listProjects()).rejects.toEqual(expect.objectContaining({ status: 401 }));
  });

  it('treats destination inventory as optional on older Coolify v4 builds', async () => {
    const client = new CoolifyClient('https://coolify.test', 'secret', vi.fn(async () => response(404, { message: 'Not found' })) as any);
    await expect(client.listDestinations()).resolves.toEqual([]);
  });

  it('creates one-click services without instant deployment', async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/services')) {
        expect(JSON.parse(String(init.body))).toMatchObject({ type: 'uptime-kuma', instant_deploy: false, project_uuid: 'project-1' });
        return response(201, { uuid: 'service-1', domains: ['https://kuma.test'] });
      }
      return response(200, {});
    });
    const provider = new CoolifyProvider(new CoolifyClient('https://coolify.test', 'secret', fetcher as any), { projectUuid: 'project-1', environmentUuid: 'env-1', serverUuid: 'server-1' });
    const app = await provider.installApp({ schemaVersion:1,id:'uptime-kuma',name:'Uptime Kuma',provider:'coolify',providerType:'uptime-kuma',category:'Monitoring',description:'',verified:true,icon:'',storage:[],desktop:{enabled:true,openMode:'external-url'} }, {});
    expect(app).toMatchObject({ id: 'service-1', primaryUrl: 'https://kuma.test', status: 'installing' });
  });

  it('discovers applications and services only in the configured HomiOS environment', async () => {
    const requests: string[] = [];
    const fetcher = vi.fn(async (url: string) => {
      requests.push(url);
      if (url.endsWith('/projects/project-1/env-1')) return response(200, { id: 42, uuid: 'env-1' });
      if (url.endsWith('/applications')) return response(200, [
        { uuid: 'application-1', environment_id: 42, name: 'Standalone App', status: 'running', fqdn: 'https://app.test' },
        { uuid: 'other-application', environment_id: 99, name: 'Other App', status: 'running', fqdn: 'https://other.test' },
      ]);
      if (url.endsWith('/services')) return response(200, [
        { uuid: 'service-1', environment_id: 42, name: 'Media Service', status: 'running', service_type: 'jellyfin' },
        { uuid: 'other-service', environment_id: 99, name: 'Other Service', status: 'running' },
      ]);
      if (url.endsWith('/services/service-1')) return response(200, {
        uuid: 'service-1', environment_id: 42, name: 'Media Service', status: 'running', service_type: 'jellyfin',
        applications: [{ name: 'jellyfin', fqdn: 'https://media.test' }],
      });
      return response(404, { message: 'Not found' });
    });
    const provider = new CoolifyProvider(new CoolifyClient('https://coolify.test', 'secret', fetcher as any), { projectUuid: 'project-1', environmentUuid: 'env-1', serverUuid: 'server-1' });

    await expect(provider.listInstalledApps()).resolves.toEqual([
      expect.objectContaining({ id: 'service-1', name: 'Media Service', resourceType: 'service', catalogId: 'jellyfin', primaryUrl: 'https://media.test' }),
      expect.objectContaining({ id: 'application-1', name: 'Standalone App', resourceType: 'application', primaryUrl: 'https://app.test' }),
    ]);
    expect(requests).not.toContain('https://coolify.test/api/v1/services/other-service');
  });

  it('reads and updates named service domains', async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      if (init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ urls: [{ name: 'web', url: 'https://status.example.com' }], force_domain_override: false });
        return response(200, { uuid: 'service-1', domains: ['https://status.example.com'] });
      }
      return response(200, { uuid: 'service-1', name: 'Status', status: 'running', applications: [{ name: 'web', fqdn: 'https://status.example.com' }] });
    });
    const provider = new CoolifyProvider(new CoolifyClient('https://coolify.test', 'secret', fetcher as any), { projectUuid: 'project-1', environmentUuid: 'env-1', serverUuid: 'server-1' });
    await expect(provider.getDomains('service-1')).resolves.toEqual([{ name: 'web', url: 'https://status.example.com' }]);
    await expect(provider.updateDomains('service-1', [{ name: 'web', url: 'https://status.example.com' }])).resolves.toMatchObject({ primaryUrl: 'https://status.example.com' });
  });

  it('attaches each HomiOS host mount to the primary service application', async () => {
    const requests: Array<{ url:string; method:string; body?:any }> = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method || 'GET';
      requests.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith('/services/service-1')) {
        return response(200, { uuid: 'service-1', applications: [{ uuid: 'application-1', name: 'immich' }] });
      }
      if (url.endsWith('/services/service-1/storages') && method === 'GET') {
        return response(200, { persistent_storages: [] });
      }
      if (url.endsWith('/services/service-1/storages') && method === 'POST') return response(201, { uuid: 'storage-1' });
      return response(404, { message: 'Not found' });
    });
    const provider = new CoolifyProvider(new CoolifyClient('https://coolify.test', 'secret', fetcher as any), { projectUuid: 'project-1', environmentUuid: 'env-1', serverUuid: 'server-1' });

    await provider.configureStorage('service-1', [
      { id: 'mount-1', name: 'sda1', path: '/mnt/homios-storage/sda1', source: '/dev/sda1', filesystem: 'ext4', readOnly: false },
      { id: 'mount-2', name: 'sdb1', path: '/mnt/homios-storage/sdb1', source: '/dev/sdb1', filesystem: 'ext4', readOnly: false },
    ]);

    const creates = requests.filter((request) => request.method === 'POST');
    expect(creates).toHaveLength(2);
    expect(creates[0]?.body).toMatchObject({
      type: 'persistent',
      resource_uuid: 'application-1',
      host_path: '/mnt/homios-storage/sda1',
      mount_path: '/mnt/homios-storage/sda1',
    });
  });

  it('removes stale HomiOS-managed binds without touching app-owned storage', async () => {
    const requests: Array<{ url:string; method:string }> = [];
    const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method || 'GET';
      requests.push({ url, method });
      if (url.endsWith('/services/service-1')) {
        return response(200, { uuid: 'service-1', applications: [{ uuid: 'application-1', name: 'jellyfin' }] });
      }
      if (url.endsWith('/services/service-1/storages') && method === 'GET') {
        return response(200, { persistent_storages: [
          { uuid: 'keep', name: 'homios-mount-1', host_path: '/mnt/homios-storage/sda1', mount_path: '/mnt/homios-storage/sda1' },
          { uuid: 'remove', name: 'homios-homios-storage-r', host_path: '/mnt/homios-storage', mount_path: '/mnt/homios-storage' },
          { uuid: 'user-storage', name: 'jellyfin-config', host_path: '/srv/jellyfin', mount_path: '/config' },
        ] });
      }
      if (url.endsWith('/services/service-1/storages/remove') && method === 'DELETE') return response(200, {});
      return response(404, { message: 'Not found' });
    });
    const provider = new CoolifyProvider(new CoolifyClient('https://coolify.test', 'secret', fetcher as any), { projectUuid: 'project-1', environmentUuid: 'env-1', serverUuid: 'server-1' });

    await expect(provider.configureStorage('service-1', [
      { id: 'mount-1', name: 'sda1', path: '/mnt/homios-storage/sda1', readOnly: false },
    ])).resolves.toEqual({ added: 0, removed: 1 });

    expect(requests.filter((request) => request.method === 'DELETE')).toEqual([
      { url: 'https://coolify.test/api/v1/services/service-1/storages/remove', method: 'DELETE' },
    ]);
  });
});
