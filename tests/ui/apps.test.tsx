import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AppStore from '../../src/features/apps/AppStoreApp';
import ServerDataProvider, { getQueryClient } from '../../src/providers/ServerDataProvider';
import { ShellNavigationContext, type ShellRoute } from '../../src/hooks/useShellNavigation';

const jobs = vi.hoisted(() => ({ jobs: [] as any[], refresh: vi.fn(async () => {}) }));
vi.mock('../../src/hooks/useJobActivity', () => ({ useJobActivity: () => jobs }));
const installed = ['Atlas', 'Beacon'].map(name => ({ id: `installed-${name.toLowerCase()}`, catalogId: name.toLowerCase(), name, status: 'running', managedByHomiOS: true }));
const catalog = installed.map(app => ({ id: app.catalogId, name: app.name, category: 'Tools', description: `${app.name} for your server`, storage: [], verified: true, icon: '' }));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function Harness() {
  const [route, setRoute] = useState<ShellRoute>({ view: 'app-store', filePath: '/', storeCategory: 'Installed Apps', storeQuery: '', storeApp: null, settingsTab: 'overview' });
  return <ServerDataProvider><ShellNavigationContext.Provider value={{ route, navigate: patch => setRoute(previous => ({ ...previous, ...patch })), restored: false }}><AppStore onClose={() => {}}/></ShellNavigationContext.Provider></ServerDataProvider>;
}
beforeEach(() => { getQueryClient().clear(); jobs.jobs = []; });
describe('app management', () => {
  it('isolates a pending lifecycle action to its app', async () => {
    let finish!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/stop')) return new Promise<Response>(resolve => { finish = resolve; });
      if (url.startsWith('/api/apps/catalog')) return json({ apps: catalog });
      if (url.startsWith('/api/apps/installed')) return json({ apps: installed });
      if (url.includes('/coolify/status')) return json({ appStoreState: 'available', reachable: true });
      if (url.endsWith('storage-mounts')) return json({ mounts: [] });
      return json({});
    }));
    render(<Harness/>);
    await screen.findByRole('button', { name: /Atlas.*Running/ });
    fireEvent.click(screen.getByRole('button', { name: /Atlas.*Running/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Stop', exact: true }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop', exact: true }).hasAttribute('disabled')).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'Back to Installed Apps' }));
    fireEvent.click(screen.getByRole('button', { name: /Beacon.*Running/ }));
    expect(screen.getByRole('button', { name: 'Stop', exact: true }).hasAttribute('disabled')).toBe(false);
    await act(async () => finish(json({ ok: true })));
  });
  it('keeps cached catalog browsing available when integration status fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.startsWith('/api/apps/catalog') ? json({ apps: catalog }) : url.includes('/coolify/status') ? json({ error: 'Coolify offline' }, 503) : url.includes('installed') ? json({ apps: [] }) : json({ mounts: [] })));
    render(<Harness/>); fireEvent.click(screen.getByRole('button', { name: 'All Apps', exact: true }));
    await screen.findByRole('heading', { name: 'Atlas' }); expect(screen.getByRole('alert').textContent).toContain('Coolify offline');
  });
  it('shows logs with search and pauses only their automatic refresh', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/logs') ? json({ logs: [{ message: 'ready' }, { message: 'warning: retrying' }] }) : url.startsWith('/api/apps/catalog') ? json({ apps: catalog }) : url.includes('installed') ? json({ apps: installed }) : url.includes('/coolify/status') ? json({ appStoreState: 'available', reachable: true }) : json({ mounts: [] })));
    render(<Harness/>); fireEvent.click(await screen.findByRole('button', { name: /Atlas.*Running/ })); fireEvent.click(screen.getByRole('button', { name: 'Logs', exact: true }));
    await waitFor(() => expect(screen.getByLabelText('Application log output').textContent).toContain('ready'));
    fireEvent.change(screen.getByLabelText('Search logs'), { target: { value: 'warning' } }); expect(screen.getByLabelText('Application log output').textContent).not.toContain('ready');
    fireEvent.click(screen.getByRole('button', { name: 'Pause', exact: true })); expect(screen.getByRole('button', { name: 'Resume', exact: true })).toBeDefined();
  });
});
