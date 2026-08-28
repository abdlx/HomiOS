import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppWindow, CheckCircle2, ExternalLink, Loader2, Plus, RefreshCw, Search, Server, ShieldCheck, Square, Play, RotateCw, Trash2, X } from 'lucide-react';
import { useInstalledApps } from '../hooks/useInstalledApps';
import { useJobActivity } from '../hooks/useJobActivity';

type CatalogApp = { id:string; name:string; category:string; description:string; verified:boolean; requirements?:{recommendedRamMb?:number}; storage:Array<{id:string;label:string;required:boolean;protectable:boolean}> };
type Integration = { appStoreState:string; connected:boolean; authenticated:boolean; reachable:boolean; mode:string; baseUrl:string|null; storageAware:boolean };

export default function AppStoreApp({ onClose }: { onClose: () => void }) {
  const [catalog, setCatalog] = useState<CatalogApp[]>([]);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CatalogApp | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [pendingConnect, setPendingConnect] = useState<any>(null);
  const [connectOptions, setConnectOptions] = useState<Record<string, any>>({});
  const { apps: installed, refresh: refreshInstalled } = useInstalledApps();
  const { jobs, refresh: refreshJobs } = useJobActivity();

  const refresh = useCallback(async () => {
    const [catalogResponse, statusResponse] = await Promise.all([fetch('/api/apps/catalog'), fetch('/api/integrations/coolify/status')]);
    if (catalogResponse.ok) setCatalog((await catalogResponse.json()).apps || []);
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      setIntegration(status);
      if (status.appStoreState === 'available') await fetch('/api/apps/reconcile', { method: 'POST' }).catch(() => {});
    }
    await refreshInstalled();
  }, [refreshInstalled]);
  useEffect(() => { void refresh(); }, [refresh]);
  const visible = useMemo(() => catalog.filter((app) => `${app.name} ${app.category} ${app.description}`.toLowerCase().includes(query.toLowerCase())), [catalog, query]);
  const activeInstall = (id: string) => jobs.find((job: any) => job.type === 'app.install' && job.payload?.appId === id && ['queued','running'].includes(job.status));
  const isInstalled = (id: string) => installed.some((app) => app.catalogId === id);

  async function connect(extra: Record<string, any> = {}) {
    setBusy(true); setError('');
    try {
      const options = { ...connectOptions, ...extra };
      const response = await fetch('/api/integrations/coolify/connect', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ baseUrl, token, ...options }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Connection failed');
      if (!data.connected) { setConnectOptions(options); setPendingConnect(data); return; }
      setToken(''); setConnectOptions({}); setPendingConnect(null); await refresh();
    } catch (next:any) { setError(next.message); } finally { setBusy(false); }
  }
  async function install(app: CatalogApp) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/apps/install', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ appId:app.id, storage:{} }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Installation could not be queued');
      await refreshJobs();
    } catch (next:any) { setError(next.message); } finally { setBusy(false); }
  }
  async function action(id: string, name: string, method = 'POST') {
    if (name === 'remove' && !window.confirm('Remove this app? Application data and backups will be kept.')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(id)}/${name}`, { method });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `${name} failed`);
      await refreshInstalled(); window.dispatchEvent(new Event('homios:apps-changed'));
    } catch (next:any) { setError(next.message); } finally { setBusy(false); }
  }

  const unavailable = integration && integration.appStoreState !== 'available';
  return <div className="flex h-full flex-col bg-[#f5f5f7] text-slate-900 dark:bg-[#151517] dark:text-white">
    <header className="flex h-16 items-center gap-3 border-b border-black/10 px-6 dark:border-white/10"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 text-white"><AppWindow size={20}/></div><div><h2 className="font-semibold">App Store</h2><p className="text-xs text-slate-500 dark:text-white/50">Powered by your HomiOS-owned Coolify project</p></div><button onClick={onClose} className="ml-auto rounded-full p-2 hover:bg-black/10 dark:hover:bg-white/10" aria-label="Close App Store"><X size={18}/></button></header>
    {unavailable ? <main className="m-auto w-full max-w-lg p-8"><div className="rounded-3xl border border-black/10 bg-white p-7 shadow-xl dark:border-white/10 dark:bg-white/5"><Server className="mb-4 text-violet-500" size={34}/><h3 className="text-xl font-semibold">{integration.appStoreState === 'needs_coolify' ? 'Apps require Coolify' : integration.appStoreState === 'needs_connection' ? 'Connect Coolify' : integration.appStoreState === 'unsupported' ? 'Coolify version not verified' : 'Coolify connection expired'}</h3><p className="mt-2 text-sm text-slate-500 dark:text-white/55">{integration.appStoreState === 'coolify_offline' ? 'Your installed apps continue running normally. Reconnect to manage them.' : 'HomiOS only manages resources inside its dedicated HomiOS-Apps project.'}</p><div className="mt-5 space-y-3"><input value={baseUrl} onChange={(event)=>setBaseUrl(event.target.value)} placeholder="http://192.168.0.101:8000" className="w-full rounded-xl border border-black/10 bg-black/5 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-black/20"/><input type="password" value={token} onChange={(event)=>setToken(event.target.value)} placeholder="API token" className="w-full rounded-xl border border-black/10 bg-black/5 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-black/20"/><p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14}/> Required permissions: Read, Write, Deploy. Never Root.</p>{pendingConnect?.needsProjectSelection && <div className="rounded-xl bg-amber-500/10 p-3 text-sm"><p>A project named HomiOS-Apps already exists.</p><div className="mt-2 flex gap-2"><button onClick={()=>connect({conflictResolution:'create-new'})} className="rounded-lg bg-slate-800 px-3 py-2 text-white">Create HomiOS-Apps-2</button><button onClick={()=>connect({conflictResolution:'use-existing'})} className="rounded-lg border px-3 py-2">Use this project</button></div></div>}{pendingConnect?.needsServerSelection && <select onChange={(event)=>connect({serverUuid:event.target.value})} defaultValue="" className="w-full rounded-xl border bg-transparent p-3"><option value="" disabled>Where should HomiOS apps run?</option>{pendingConnect.servers.map((server:any)=><option key={server.uuid} value={server.uuid}>{server.name} — {server.ip}</option>)}</select>}{pendingConnect?.needsDestinationSelection && <select onChange={(event)=>connect({destinationUuid:event.target.value})} defaultValue="" className="w-full rounded-xl border bg-transparent p-3"><option value="" disabled>Which Docker destination should apps use?</option>{pendingConnect.destinations.map((destination:any)=><option key={destination.uuid} value={destination.uuid}>{destination.name || destination.network || destination.uuid}</option>)}</select>}{error && <p className="text-sm text-red-500">{error}</p>}<button disabled={busy || !baseUrl || !token} onClick={()=>connect()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-40">{busy&&<Loader2 className="animate-spin" size={16}/>} Connect</button></div></div></main> :
    <main className="flex min-h-0 flex-1"><section className="min-w-0 flex-1 overflow-y-auto p-6 md:p-8"><div className="relative mb-7 max-w-xl"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search apps" className="w-full rounded-2xl border border-black/10 bg-white py-3 pl-11 pr-4 shadow-sm outline-none focus:ring-2 focus:ring-blue-500 dark:border-white/10 dark:bg-white/5"/></div><div className="mb-4 flex items-center justify-between"><div><h3 className="text-xl font-semibold">Verified for HomiOS</h3><p className="text-sm text-slate-500 dark:text-white/50">Curated metadata, deployed by Coolify.</p></div><button onClick={refresh} className="rounded-xl p-2 hover:bg-black/5 dark:hover:bg-white/10" title="Refresh"><RefreshCw size={17}/></button></div>{error && <p className="mb-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-500">{error}</p>}<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((app)=>{const job:any=activeInstall(app.id); return <button key={app.id} onClick={()=>setSelected(app)} className="rounded-2xl border border-black/10 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10 dark:bg-white/5"><div className="flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-lg font-bold text-white">{app.name.slice(0,1)}</div><div className="min-w-0"><h4 className="font-semibold">{app.name}</h4><p className="text-xs text-blue-500">{app.category}</p></div>{isInstalled(app.id)&&<CheckCircle2 className="ml-auto text-emerald-500" size={18}/>}</div><p className="mt-4 line-clamp-2 text-sm text-slate-500 dark:text-white/55">{app.description}</p>{job&&<div className="mt-4"><div className="mb-1 flex justify-between text-xs"><span>{job.progressData?.stage?.replace('_',' ')||job.status}</span><span>{job.progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-blue-500" style={{width:`${job.progress}%`}}/></div></div>}</button>})}</div>{installed.length>0&&<div className="mt-10"><h3 className="mb-4 text-xl font-semibold">Installed Apps</h3><div className="space-y-3">{installed.map((app)=><div key={app.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-white/5"><div className={`h-2.5 w-2.5 rounded-full ${app.status==='running'?'bg-emerald-500':app.status==='error'||app.status==='missing'?'bg-red-500':'bg-amber-500'}`}/><div className="mr-auto"><p className="font-medium">{app.name}</p><p className="text-xs capitalize text-slate-500">{app.status}</p></div>{app.primaryUrl&&<button onClick={()=>window.open(app.primaryUrl!,'_blank','noopener,noreferrer')} className="rounded-lg p-2 hover:bg-black/5" title="Open"><ExternalLink size={16}/></button>}<button onClick={()=>action(app.id,'start')} className="rounded-lg p-2 hover:bg-black/5" title="Start"><Play size={16}/></button><button onClick={()=>action(app.id,'stop')} className="rounded-lg p-2 hover:bg-black/5" title="Stop"><Square size={16}/></button><button onClick={()=>action(app.id,'restart')} className="rounded-lg p-2 hover:bg-black/5" title="Restart"><RotateCw size={16}/></button><button onClick={()=>action(app.id,'remove','DELETE')} className="rounded-lg p-2 text-red-500 hover:bg-red-500/10" title="Remove (keep data)"><Trash2 size={16}/></button></div>)}</div></div>}</section>
    {selected&&<aside className="hidden w-80 shrink-0 overflow-y-auto border-l border-black/10 bg-white p-6 dark:border-white/10 dark:bg-black/20 md:block"><button onClick={()=>setSelected(null)} className="float-right rounded-full p-1 hover:bg-black/5"><X size={17}/></button><div className="mt-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-2xl font-bold text-white">{selected.name.slice(0,1)}</div><h3 className="mt-4 text-2xl font-semibold">{selected.name}</h3><p className="mt-2 text-sm text-slate-500 dark:text-white/55">{selected.description}</p><p className="mt-4 flex items-center gap-2 text-sm text-emerald-600"><ShieldCheck size={16}/> Verified for HomiOS</p>{selected.requirements?.recommendedRamMb&&<p className="mt-5 text-sm"><strong>Memory</strong><br/><span className="text-slate-500">{selected.requirements.recommendedRamMb/1024} GB recommended</span></p>}{selected.storage.length>0&&<div className="mt-5 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">This app needs HomiOS drive mapping. Storage-aware installation stays disabled until Coolify bind mounts can be configured safely.</div>}<button disabled={busy||isInstalled(selected.id)||!!activeInstall(selected.id)||selected.storage.length>0} onClick={()=>install(selected)} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-40">{activeInstall(selected.id)?<><Loader2 className="animate-spin" size={16}/> Installing</>:isInstalled(selected.id)?<><CheckCircle2 size={16}/> Installed</>:<><Plus size={16}/> Install</>}</button></aside>}</main>}
  </div>;
}
