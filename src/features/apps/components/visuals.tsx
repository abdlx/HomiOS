import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Circle, Loader2, ShieldCheck } from 'lucide-react';
import { appStoreStateLabel, appStoreStateTone, getInstallJobState } from '../state';
import type { CatalogApp } from '../types';
import type { InstalledApp } from '../../../hooks/useInstalledApps';
import { useVirtualRows } from '../../../hooks/useVirtualRows';
import { EmptyState } from '../../../components/ui/surfaces';

export function AppIcon({ id, name, large = false }: { id: string; name: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className={`${large ? 'h-20 w-20 rounded-[22px] text-3xl' : 'h-12 w-12 rounded-[14px] text-lg'} flex shrink-0 items-center justify-center overflow-hidden border border-neutral-200/50 bg-gradient-to-br from-blue-500 to-violet-500 font-semibold text-white shadow-sm dark:border-white/10`}>{failed ? name.charAt(0) : <img src={`/api/apps/${encodeURIComponent(id)}/icon`} alt="" onError={() => setFailed(true)} loading="lazy" className="h-full w-full bg-white object-contain p-1.5"/>}</div>;
}
export function StatusBadge({ state }: { state: string }) {
  const tone = appStoreStateTone(state);
  const Icon = tone === 'danger' ? AlertCircle : tone === 'progress' ? Loader2 : state === 'running' ? CheckCircle2 : Circle;
  return <span role="status" className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ${tone === 'success' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : tone === 'danger' ? 'bg-red-500/10 text-red-500' : tone === 'progress' ? 'bg-blue-500/10 text-blue-500' : 'bg-neutral-500/10 text-neutral-500'}`}><Icon size={12} className={tone === 'progress' ? 'animate-spin' : ''}/>{appStoreStateLabel(state)}</span>;
}
export const CatalogCard = React.memo(function CatalogCard({ app, installed, job, onOpen }: { app: CatalogApp; installed?: InstalledApp; job?: any; onOpen: (app: CatalogApp) => void }) {
  const state = installed?.status || getInstallJobState(job);
  return <button onClick={() => onOpen(app)} className="group flex h-[126px] w-full items-start gap-3 rounded-2xl border border-transparent p-4 text-left transition-colors hover:border-neutral-200/70 hover:bg-white dark:hover:border-white/10 dark:hover:bg-white/[.04]">
    <AppIcon id={app.id} name={app.name}/><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h3 className="truncate text-[13px] font-semibold text-neutral-800 dark:text-neutral-100">{app.name}</h3>{app.verified && <ShieldCheck size={13} className="shrink-0 text-blue-500" aria-label="HomiOS verified"/>}</div><p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-500">{app.description}</p><div className="mt-2">{state ? <StatusBadge state={state}/> : <span className="text-[10px] text-neutral-400">{app.category}</span>}</div></div><ChevronRight size={15} className="mt-4 shrink-0 text-neutral-300 group-hover:text-blue-500"/>
  </button>;
});
export function VirtualCatalog({ apps, installed, jobs, onOpen, scrollKey }: { apps: CatalogApp[]; installed: Map<string, InstalledApp>; jobs: Map<string, any>; onOpen: (app: CatalogApp) => void; scrollKey: string }) {
  const rows = useVirtualRows(apps.length, 136, 300);
  React.useLayoutEffect(() => {
    const node = rows.ref.current; if (!node) return;
    node.scrollTop = catalogScroll.get(scrollKey) || 0;
    return () => { catalogScroll.set(scrollKey, node.scrollTop); };
  }, [scrollKey]);
  if (!apps.length) return <EmptyState title="No apps found" description="Try a different search or category."/>;
  return <div ref={rows.ref} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" aria-label="App catalog"><div style={{ height: rows.totalHeight, position: 'relative' }}><div className="grid gap-x-2" style={{ position: 'absolute', top: rows.offset, left: 0, right: 0, gridTemplateColumns: `repeat(${rows.columns}, minmax(0, 1fr))`, gridAutoRows: 136 }}>{apps.slice(rows.start, rows.end).map(app => <CatalogCard key={app.id} app={app} installed={installed.get(app.id)} job={jobs.get(app.id)} onOpen={onOpen}/>)}</div></div></div>;
}
const catalogScroll = new Map<string, number>();
