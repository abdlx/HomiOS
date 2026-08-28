import { describe, expect, it, vi } from 'vitest';
import { CoolifyClient, CoolifyProvider, normalizeCoolifyBaseUrl } from '../../lib/apps/providers/coolify.ts';

function response(status: number, body: any) {
  return new Response(body === null ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('CoolifyClient', () => {
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
});
