import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../../lib/db.ts';
import { connectCoolify, getCoolifyIntegration } from '../../lib/apps/integration-storage.ts';

function json(status: number, body: unknown) {
  return new Response(body == null ? '' : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Coolify integration bootstrap', () => {
  beforeEach(() => {
    getDb().prepare("DELETE FROM integrations WHERE provider = 'coolify'").run();
    vi.restoreAllMocks();
  });

  it('stores the current team and destination, then reuses saved resource UUIDs', async () => {
    let projectExists = false;
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      const method = init?.method || 'GET';

      if (url.pathname === '/api/v1/projects' && method === 'GET') {
        return json(200, projectExists ? [{ uuid: 'project-1', name: 'HomiOS-Apps' }] : []);
      }
      if (url.pathname === '/api/v1/projects' && method === 'POST') {
        projectExists = true;
        return json(201, { uuid: 'project-1' });
      }
      if (url.pathname === '/api/v1/servers') return json(200, [{ uuid: 'server-1', name: 'localhost', ip: '127.0.0.1', settings: { is_reachable: true, is_usable: true } }]);
      if (url.pathname === '/api/v1/teams/current') return json(200, { id: 42, name: 'Home' });
      if (url.pathname === '/api/v1/version') return json(200, { version: '4.0.0-beta.500' });
      if (url.pathname === '/api/v1/destinations') return json(200, [{ uuid: 'destination-1', server_uuid: 'server-1', name: 'coolify', network: 'coolify' }]);
      if (url.pathname === '/api/v1/projects/project-1/production') return json(404, { message: 'Resource not found.' });
      if (url.pathname === '/api/v1/projects/project-1/environments' && method === 'POST') return json(201, { uuid: 'environment-1', name: 'production' });
      if (url.pathname === '/api/v1/projects/project-1/environment-1') return json(200, { uuid: 'environment-1', name: 'production' });
      throw new Error(`Unexpected request: ${method} ${url.pathname}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const first = await connectCoolify({
      baseUrl: 'http://coolify.test', token: 'secret', mode: 'managed', conflictResolution: 'create-new',
    });
    expect(first).toMatchObject({ connected: true });
    expect(getCoolifyIntegration()).toMatchObject({
      teamId: 42,
      serverUuid: 'server-1',
      destinationUuid: 'destination-1',
      projectUuid: 'project-1',
      environmentUuid: 'environment-1',
    });

    const second = await connectCoolify({
      baseUrl: 'http://coolify.test', token: 'secret', mode: 'managed', conflictResolution: 'create-new',
    });
    expect(second).toMatchObject({ connected: true });
    expect(fetcher.mock.calls.filter(([input, init]) => String(input).endsWith('/api/v1/projects') && init?.method === 'POST')).toHaveLength(1);
  });

  it('asks for a destination when the selected server has more than one', async () => {
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const path = new URL(typeof input === 'string' || input instanceof URL ? input : input.url).pathname;
      const method = init?.method || 'GET';
      if (path === '/api/v1/projects' && method === 'GET') return json(200, []);
      if (path === '/api/v1/projects' && method === 'POST') return json(201, { uuid: 'project-1' });
      if (path === '/api/v1/servers') return json(200, [{ uuid: 'server-1', ip: '127.0.0.1', settings: {} }]);
      if (path === '/api/v1/teams/current') return json(200, { id: 1 });
      if (path === '/api/v1/version') return json(200, '4.0.0');
      if (path === '/api/v1/destinations') return json(200, [
        { uuid: 'destination-1', server_uuid: 'server-1', name: 'one' },
        { uuid: 'destination-2', server_uuid: 'server-1', name: 'two' },
      ]);
      if (path === '/api/v1/projects/project-1/environments') return json(201, { uuid: 'environment-1' });
      if (path === '/api/v1/projects/project-1/production') return json(404, {});
      throw new Error(`Unexpected request: ${method} ${path}`);
    });
    vi.stubGlobal('fetch', fetcher);

    const result = await connectCoolify({ baseUrl: 'http://coolify.test', token: 'secret', mode: 'managed' });
    expect(result).toMatchObject({
      needsDestinationSelection: true,
      destinations: [{ uuid: 'destination-1' }, { uuid: 'destination-2' }],
    });
    expect(getCoolifyIntegration()).toBeNull();
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });
});
