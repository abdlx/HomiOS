import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Boxes, CheckCircle2, ChevronRight, Menu, Package, RefreshCw, Search, Server, ShieldCheck, Sparkles, X } from 'lucide-react';
import { useInstalledApps, type InstalledApp } from '../../hooks/useInstalledApps';
import { useJobActivity } from '../../hooks/useJobActivity';
import { useRemoteResource } from '../../hooks/useRemoteResource';
import { useShellRoute } from '../../hooks/useShellNavigation';
import { isActiveInstallJob } from './state';
import { searchCatalog, type AppActionState, type CatalogApp, type Integration, type StorageMount } from './types';
import { Button, EmptyState, ErrorPanel, IconButton, Sheet, Skeleton } from '../../components/ui/surfaces';
import { AppIcon, CatalogCard, StatusBadge, VirtualCatalog } from './components/visuals';
import AppDetail from './components/AppDetail';
import AppLogs from './components/AppLogs';
import AppDomains from './components/AppDomains';
import ConnectionSetup from './components/ConnectionSetup';
import { confirmDialog, toast } from '../../components/SystemUI';

export default function AppStoreApp({ onClose, isActive = true }: { onClose: () => void; isActive?: boolean }) {
  const { route, navigate } = useShellRoute();
  const category = route.storeCategory, query = route.storeQuery;
  const catalogResource = useRemoteResource<{ apps: CatalogApp[]; catalogAvailable: boolean }>('/api/apps/catalog', isActive);
  const integrationResource = useRemoteResource<Integration>('/api/integrations/coolify/status', isActive);
  const mountsResource = useRemoteResource<{ mounts: StorageMount[] }>('/api/apps/storage-mounts', isActive);
  const { apps: installed, loading: installedLoading, error: installedError, refresh: refreshInstalled } = useInstalledApps({ isActive });
  const { jobs, refresh: refreshJobs } = useJobActivity();
  const [sidebarOpen, setSidebarOpen] = useState(false); const [connecting, setConnecting] = useState(false);
  const [logsApp, setLogsApp] = useState<InstalledApp | null>(null); const [domainsApp, setDomainsApp] = useState<InstalledApp | null>(null);
  const [actionStates, setActionStates] = useState<Record<string, AppActionState>>({});
  const [installPending, setInstallPending] = useState<Record<string, boolean>>({}); const [installErrors, setInstallErrors] = useState<Record<string, string>>({});
  const locks = useRef(new Set<string>()); const handledJobs = useRef(new Set<string>());
  const catalog = catalogResource.data?.apps || [];
  const integration = integrationResource.data;
  const available = integration?.appStoreState === 'available';
  const categories = useMemo(() => [...new Set(catalog.map(app => app.category || 'Other'))].sort(), [catalog]);
  const installedByCatalog = useMemo(() => new Map(installed.map(app => [app.catalogId, app])), [installed]);
  const installJobs = useMemo(() => {
    const ordered = jobs.filter(job => job.type === 'app.install').sort((a, b) => Number(isActiveInstallJob(b)) - Number(isActiveInstallJob(a)) || Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
    const map = new Map<string, any>(); ordered.forEach(job => { const id = (job.payload as any)?.appId; if (id && !map.has(id)) map.set(id, job); }); return map;
  }, [jobs]);
  useEffect(() => {
    const completed = jobs.filter(job => job.type === 'app.install' && job.status === 'completed' && !handledJobs.current.has(job.id));
    completed.forEach(job => handledJobs.current.add(job.id)); if (completed.length) { void refreshInstalled(); window.dispatchEvent(new Event('homios:apps-changed')); }
  }, [jobs, refreshInstalled]);
  useEffect(() => {
    setActionStates(current => {
      let changed = false; const next = { ...current };
      for (const app of installed) {
        const state = current[app.id]; if (!state || state.pending || state.error) continue;
        const expected = ({ starting: 'running', restarting: 'running', stopping: 'stopped', redeploying: 'running' } as Record<string, string>)[state.state];
        if (expected === app.status || ['error', 'unhealthy', 'missing'].includes(app.status)) { delete next[app.id]; changed = true; }
      }
      return changed ? next : current;
    });
  }, [installed]);
  const selectedInstalled = installed.find(app => app.id === route.storeApp || app.catalogId === route.storeApp);
  const selected = catalog.find(app => app.id === route.storeApp || app.id === selectedInstalled?.catalogId) || (selectedInstalled ? { id: selectedInstalled.catalogId, name: selectedInstalled.name, category: 'Installed app', description: 'This app is installed on your server.', verified: false, icon: '', storage: [] } as CatalogApp : undefined);
  const visible = useMemo(() => searchCatalog(catalog, category, query), [catalog, category, query]);
  const visibleInstalled = installed.filter(app => `${app.name} ${app.status}`.toLowerCase().includes(query.toLowerCase()));
  function chooseCategory(value: string) { navigate({ storeCategory: value, storeQuery: '', storeApp: null }); setSidebarOpen(false); }
  function openApp(app: CatalogApp) { navigate({ storeApp: app.id }); }
  function changed() { void refreshInstalled(); window.dispatchEvent(new Event('homios:apps-changed')); }
  async function refreshAll() { await Promise.allSettled([catalogResource.refresh('/api/apps/catalog?refresh=1'), integrationResource.refresh('/api/integrations/coolify/status?refresh=1'), mountsResource.refresh(), refreshInstalled(), refreshJobs()]); }
  async function install(app: CatalogApp, mountIds: string[], accessAllMounts: boolean) {
    const key = `install:${app.id}`; if (locks.current.has(key) || isActiveInstallJob(installJobs.get(app.id))) return;
    locks.current.add(key); setInstallPending(current => ({ ...current, [app.id]: true })); setInstallErrors(current => ({ ...current, [app.id]: '' }));
    try {
      const response = await fetch('/api/apps/install', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appId: app.id, storage: {}, mountIds: app.storage.length && integration?.storageAware ? mountIds : [], accessAllMounts: app.storage.length && integration?.storageAware ? accessAllMounts : false }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Installation could not be queued');
      await refreshJobs(); toast({ message: `${app.name} installation queued`, tone: 'success' });
    } catch (error) { setInstallErrors(current => ({ ...current, [app.id]: error instanceof Error ? error.message : 'Installation failed' })); }
    finally { locks.current.delete(key); setInstallPending(current => ({ ...current, [app.id]: false })); }
  }
  async function action(app: InstalledApp, name: string) {
    if (locks.current.has(app.id)) return;
    if (name === 'remove' && !await confirmDialog({ title: `Remove ${app.name}?`, message: 'The app will be removed from Coolify. Application data and backups will be kept.', tone: 'danger', confirmLabel: 'Remove app' })) return;
    if (name === 'deploy' && !await confirmDialog({ title: `Redeploy ${app.name}?`, message: 'Coolify will deploy this app again using its current configuration.', confirmLabel: 'Redeploy' })) return;
    locks.current.add(app.id);
    const state = ({ start: 'starting', stop: 'stopping', restart: 'restarting', deploy: 'redeploying', remove: 'removing' } as Record<string, string>)[name] || name;
    setActionStates(current => ({ ...current, [app.id]: { state, pending: true, action: name } }));
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(app.id)}/${name}`, { method: name === 'remove' ? 'DELETE' : 'POST' });
      const value = await response.json().catch(() => ({})); if (!response.ok) throw new Error(value.error || `${name} failed`);
      setActionStates(current => ({ ...current, [app.id]: { state, pending: false, action: name } }));
      changed(); if (name === 'remove') navigate({ storeApp: null, storeCategory: 'Installed Apps' });
    } catch (error) { setActionStates(current => ({ ...current, [app.id]: { state: 'error', pending: false, error: error instanceof Error ? error.message : 'Action failed', action: name } })); }
    finally { locks.current.delete(app.id); }
  }
  async function storage(app: InstalledApp, enabled: boolean) {
    if (locks.current.has(app.id) || !await confirmDialog({ title: enabled ? `Allow ${app.name} to access all storage?` : 'Revoke all-storage access?', message: enabled ? 'This includes files on every current and future HomiOS storage mount. Only grant access to an app you trust.' : 'The originally selected app-data mounts remain attached.', tone: enabled ? 'warning' : 'default', confirmLabel: enabled ? 'Grant access' : 'Revoke access' })) return;
    locks.current.add(app.id); setActionStates(current => ({ ...current, [app.id]: { state: 'configuring', pending: true } }));
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(app.id)}/storage-access`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessAllMounts: enabled }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Storage access could not be changed');
      setActionStates(current => { const next = { ...current }; delete next[app.id]; return next; }); changed();
    } catch (error) { setActionStates(current => ({ ...current, [app.id]: { state: 'error', pending: false, error: error instanceof Error ? error.message : 'Storage access could not be changed' } })); }
    finally { locks.current.delete(app.id); }
  }
  const navigation = <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto text-xs" aria-label="App Store categories">{['Discover', 'All Apps', 'HomiOS Verified', 'Installed Apps'].map(value => <button key={value} onClick={() => chooseCategory(value)} aria-current={category === value ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-left ${category === value ? 'bg-blue-500/10 font-semibold text-blue-500' : 'text-neutral-500 hover:bg-neutral-500/5'}`}>{value === 'Discover' ? <Sparkles size={16}/> : value === 'Installed Apps' ? <CheckCircle2 size={16}/> : value === 'HomiOS Verified' ? <ShieldCheck size={16}/> : <Boxes size={16}/>}{value}</button>)}<p className="px-3 pb-2 pt-6 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">Categories</p>{categories.map(value => <button key={value} onClick={() => chooseCategory(value)} aria-current={category === value ? 'page' : undefined} className={`min-h-10 rounded-xl px-3 text-left ${category === value ? 'bg-blue-500/10 text-blue-500' : 'text-neutral-500 hover:bg-neutral-500/5'}`}>{value}</button>)}</nav>;
  return <div className="homios-surface relative flex h-full w-full overflow-hidden bg-[#f8f9fb] text-neutral-800 dark:bg-[#171719] dark:text-neutral-100">
    <aside className="m-3 hidden w-56 shrink-0 flex-col gap-5 rounded-[28px] border border-neutral-200/60 bg-white/60 p-4 dark:border-white/[.06] dark:bg-white/[.025] md:flex"><div className="flex items-center gap-2 pb-2"><button onClick={onClose} title="Close" aria-label="Close App Store" className="h-3 w-3 rounded-full bg-red-400"/><span className="h-3 w-3 rounded-full bg-amber-400"/><span className="h-3 w-3 rounded-full bg-green-500"/></div><div className="flex items-center gap-3 px-2"><div className="rounded-xl bg-blue-500/10 p-2 text-blue-500"><Boxes size={22}/></div><div><h2 className="text-sm font-semibold">App Store</h2><p className="mt-1 text-[10px] text-neutral-400">Your server, more capable.</p></div></div>{navigation}<Button onClick={() => setConnecting(true)}><Server size={15}/>{available ? 'Coolify connected' : 'Connect Coolify'}</Button></aside>
    <main className="flex min-h-0 min-w-0 flex-1 flex-col pb-2">
      <header className="flex shrink-0 items-center gap-2 border-b border-neutral-200/60 px-3 py-3 dark:border-white/[.06] md:px-6"><IconButton label="App Store categories" className="md:!hidden" onClick={() => setSidebarOpen(true)}><Menu size={19}/></IconButton>{route.storeApp ? <Button variant="ghost" onClick={() => navigate({ storeApp: null })}><ArrowLeft size={17}/>Back to {category}</Button> : <h1 className="min-w-0 flex-1 truncate px-2 text-lg font-semibold tracking-tight md:text-xl">{category === 'Discover' ? 'Discover your next favorite app' : category}</h1>}<div className="ml-auto flex items-center gap-1"><IconButton label="Refresh App Store" disabled={catalogResource.refreshing || integrationResource.refreshing} onClick={() => void refreshAll()}><RefreshCw size={16} className={catalogResource.refreshing ? 'animate-spin' : ''}/></IconButton><IconButton label="Close App Store" className="md:!hidden" onClick={onClose}><X size={18}/></IconButton></div></header>
      <div className="shrink-0 space-y-2 px-4 pt-3 md:px-8">{integrationResource.error && <ErrorPanel message={`Coolify connection: ${integrationResource.error}`} onRetry={() => void integrationResource.refresh()}/>} {integration && !available && <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/5 px-4 py-3 text-xs"><Server size={17} className="text-amber-500"/><span className="min-w-0 flex-1 text-neutral-500">{integration.appStoreState === 'coolify_offline' ? 'Coolify is offline. You can keep browsing the catalog.' : 'Connect Coolify to install and manage apps.'}</span><Button onClick={() => setConnecting(true)}>Connection settings</Button></div>}</div>
      {route.storeApp ? selected ? <AppDetail key={selected.id} app={selected} installed={selectedInstalled || installedByCatalog.get(selected.id)} job={installJobs.get(selected.id)} state={actionStates[(selectedInstalled || installedByCatalog.get(selected.id))?.id || '']} storageAware={!!integration?.storageAware} mounts={mountsResource.data?.mounts || []} mountsLoading={mountsResource.loading} mountsError={mountsResource.error} installBusy={!!installPending[selected.id]} installError={installErrors[selected.id]} available={available} onInstall={(ids, all) => void install(selected, ids, all)} onAction={name => { const app = selectedInstalled || installedByCatalog.get(selected.id); if (app) void action(app, name); }} onLogs={() => setLogsApp(selectedInstalled || installedByCatalog.get(selected.id) || null)} onDomains={() => setDomainsApp(selectedInstalled || installedByCatalog.get(selected.id) || null)} onStorage={enabled => { const app = selectedInstalled || installedByCatalog.get(selected.id); if (app) void storage(app, enabled); }} onRetryMounts={() => void mountsResource.refresh()}/> : catalogResource.loading || installedLoading ? <StoreSkeleton/> : <EmptyState error title="App details are unavailable" description={catalogResource.error || 'This app is no longer in the catalog.'} action={<Button onClick={() => navigate({ storeApp: null })}>Back to apps</Button>}/> : <>
        <div className="shrink-0 px-4 pb-3 pt-4 md:px-8"><div className="relative"><Search size={17} className="absolute left-4 top-3.5 text-neutral-400"/><input aria-label="Search apps" type="search" value={query} onChange={event => navigate({ storeQuery: event.target.value }, true)} placeholder={category === 'Installed Apps' ? 'Search your installed apps' : 'Search apps, categories, and tags'} className="min-h-11 w-full rounded-2xl border border-neutral-200/70 bg-white/70 pl-11 pr-4 text-sm dark:border-white/10 dark:bg-white/[.03]"/></div></div>
        {category === 'Installed Apps' ? <div className="min-h-0 flex-1 overflow-auto px-4 md:px-8">{installedError && <ErrorPanel message={installedError} onRetry={() => void refreshInstalled()}/>} {installedLoading ? <StoreSkeleton/> : !visibleInstalled.length ? <EmptyState title={query ? 'No matching installed apps' : 'Make your server your own'} description={query ? 'Try another search.' : 'Install an app from the catalog to get started.'} action={!query && <Button variant="primary" onClick={() => chooseCategory('Discover')}>Browse apps</Button>}/> : <div className="grid gap-3 py-3 lg:grid-cols-2 xl:grid-cols-3">{visibleInstalled.map(app => <button key={app.id} onClick={() => navigate({ storeApp: app.id })} className="flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-white/60 p-4 text-left transition-colors hover:bg-white dark:border-white/10 dark:bg-white/[.025] dark:hover:bg-white/5"><AppIcon id={app.catalogId} name={app.name}/><div className="min-w-0 flex-1"><h2 className="mb-2 truncate text-sm font-semibold">{app.name}</h2><StatusBadge state={actionStates[app.id]?.state || app.status}/></div><ChevronRight size={16} className="text-neutral-400"/></button>)}</div>}</div> : <>
          <div className="shrink-0 px-4 md:px-8">{catalogResource.error && <ErrorPanel message={catalogResource.error} onRetry={() => void catalogResource.refresh()}/>} {catalogResource.data?.catalogAvailable === false && <p className="py-2 text-xs text-amber-600">Showing the cached catalog. The latest Coolify catalog could not be refreshed.</p>}
            {category === 'Discover' && !query && catalog.some(app => app.verified) && <section className="mb-4"><div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 text-xs font-semibold"><ShieldCheck size={15} className="text-blue-500"/>Selected for HomiOS</h2><Button variant="ghost" onClick={() => chooseCategory('HomiOS Verified')}>See all<ChevronRight size={13}/></Button></div><div className="flex gap-2 overflow-x-auto pb-1">{catalog.filter(app => app.verified).slice(0, 6).map(app => <div key={app.id} className="w-72 shrink-0 rounded-2xl bg-blue-500/[.035]"><CatalogCard app={app} installed={installedByCatalog.get(app.id)} job={installJobs.get(app.id)} onOpen={openApp}/></div>)}</div></section>}
            <div className="mb-2 flex items-center justify-between text-xs"><h2 className="font-semibold">{query ? 'Search results' : category === 'Discover' ? 'Explore all apps' : category}</h2><span className="text-neutral-400">{visible.length} apps</span></div>
          </div>
          {catalogResource.loading ? <StoreSkeleton/> : <div className="flex min-h-0 flex-1 flex-col px-2 md:px-4"><VirtualCatalog apps={visible} installed={installedByCatalog} jobs={installJobs} onOpen={openApp} scrollKey={`${category}:${query}`}/></div>}
        </>}
      </>}
    </main>
    {isActive && sidebarOpen && <Sheet title="Browse apps" onClose={() => setSidebarOpen(false)}><div className="flex min-h-0 flex-col overflow-auto p-4">{navigation}</div></Sheet>}
    {isActive && connecting && <ConnectionSetup integration={integration} onClose={() => setConnecting(false)} onConnected={() => void refreshAll()}/>}
    {isActive && logsApp && <AppLogs app={logsApp} isActive={isActive} onClose={() => setLogsApp(null)}/>}
    {isActive && domainsApp && <AppDomains app={domainsApp} onClose={() => setDomainsApp(null)} onSaved={changed}/>}
  </div>;
}
function StoreSkeleton() { return <div role="status" aria-label="Loading apps" className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden p-6 lg:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 12 }, (_, i) => <div key={i} className="flex h-28 gap-4 p-3"><Skeleton className="h-12 w-12 shrink-0"/><div className="flex-1 space-y-3"><Skeleton className="h-3 w-2/3"/><Skeleton className="h-3"/><Skeleton className="h-3 w-4/5"/></div></div>)}</div>; }
