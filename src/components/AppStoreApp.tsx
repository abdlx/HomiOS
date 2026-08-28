import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppWindow, BookOpen, CheckCircle2, ChevronRight, ExternalLink, Globe2, Grid3X3,
  Loader2, Menu, Package, Pencil, Play, Plus, RefreshCw, RotateCw, Search, Server,
  ShieldCheck, Sparkles, Square, Trash2, X,
} from 'lucide-react';
import { useInstalledApps, type InstalledApp } from '../hooks/useInstalledApps';
import { useJobActivity } from '../hooks/useJobActivity';

type CatalogApp = {
  id:string; name:string; category:string; description:string; verified:boolean; source?:'homios'|'coolify';
  icon:string; tags?:string[]; documentation?:string; port?:string;
  requirements?:{recommendedRamMb?:number}; storage:Array<{id:string;label:string;required:boolean;protectable:boolean}>;
};
type Integration = { appStoreState:string; connected:boolean; authenticated:boolean; reachable:boolean; mode:string; baseUrl:string|null; storageAware:boolean };
type DomainRoute = { name:string; url:string };

const accents = ['from-blue-500 to-cyan-400','from-violet-500 to-fuchsia-500','from-emerald-500 to-teal-400','from-amber-500 to-orange-500','from-rose-500 to-pink-500'];
const accentFor = (id:string) => accents[[...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % accents.length];

export default function AppStoreApp({ onClose }: { onClose: () => void }) {
  const [catalog, setCatalog] = useState<CatalogApp[]>([]);
  const [catalogAvailable, setCatalogAvailable] = useState(true);
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All Apps');
  const [selected, setSelected] = useState<CatalogApp | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('');
  const [token, setToken] = useState('');
  const [pendingConnect, setPendingConnect] = useState<any>(null);
  const [connectOptions, setConnectOptions] = useState<Record<string, any>>({});
  const [domainEditor, setDomainEditor] = useState<{app:InstalledApp;routes:DomainRoute[];loading:boolean;conflicts?:any[]} | null>(null);
  const { apps: installed, refresh: refreshInstalled } = useInstalledApps();
  const { jobs, refresh: refreshJobs } = useJobActivity();

  const refresh = useCallback(async () => {
    const [catalogResponse, statusResponse] = await Promise.all([fetch('/api/apps/catalog'), fetch('/api/integrations/coolify/status')]);
    if (catalogResponse.ok) {
      const value = await catalogResponse.json();
      setCatalog(value.apps || []); setCatalogAvailable(value.catalogAvailable !== false);
    }
    if (statusResponse.ok) {
      const status = await statusResponse.json(); setIntegration(status);
      if (status.appStoreState === 'available') await fetch('/api/apps/reconcile', { method:'POST' }).catch(() => {});
    }
    await refreshInstalled();
  }, [refreshInstalled]);
  useEffect(() => { void refresh(); }, [refresh]);

  const categories = useMemo(() => {
    const counts = new Map<string,number>();
    catalog.forEach((app) => counts.set(app.category || 'Other', (counts.get(app.category || 'Other') || 0) + 1));
    return [...counts.entries()].sort(([a],[b]) => a.localeCompare(b));
  }, [catalog]);
  const visible = useMemo(() => catalog.filter((app) => {
    const categoryMatch = category === 'All Apps' || category === 'HomiOS Verified' ? (category === 'All Apps' || app.verified) : app.category === category;
    return categoryMatch && `${app.name} ${app.category} ${app.description} ${(app.tags || []).join(' ')}`.toLowerCase().includes(query.toLowerCase());
  }), [catalog, category, query]);
  const activeInstall = (id:string) => jobs.find((job:any) => job.type === 'app.install' && job.payload?.appId === id && ['queued','running'].includes(job.status));
  const installedFor = (id:string) => installed.find((app) => app.catalogId === id);

  async function connect(extra:Record<string,any> = {}) {
    setBusy(true); setError('');
    try {
      const options = { ...connectOptions, ...extra };
      const response = await fetch('/api/integrations/coolify/connect', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ baseUrl, token, ...options }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Connection failed');
      if (!data.connected) { setConnectOptions(options); setPendingConnect(data); return; }
      setToken(''); setConnectOptions({}); setPendingConnect(null); await refresh();
    } catch (next:any) { setError(next.message); } finally { setBusy(false); }
  }
  async function install(app:CatalogApp) {
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/apps/install', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ appId:app.id, storage:{} }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Installation could not be queued');
      await refreshJobs();
    } catch (next:any) { setError(next.message); } finally { setBusy(false); }
  }
  async function action(id:string, name:string, method='POST') {
    if (name === 'remove' && !window.confirm('Remove this app? Application data and backups will be kept.')) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(id)}/${name}`, { method });
      const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || `${name} failed`);
      await refreshInstalled(); window.dispatchEvent(new Event('homios:apps-changed'));
    } catch (next:any) { setError(next.message); } finally { setBusy(false); }
  }
  async function openDomains(app:InstalledApp) {
    setDomainEditor({ app, routes:[], loading:true });
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(app.id)}/domains`); const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not load addresses');
      setDomainEditor({ app, routes:data.routes || [], loading:false });
    } catch (next:any) { setDomainEditor(null); setError(next.message); }
  }
  async function saveDomains(force=false) {
    if (!domainEditor) return;
    setDomainEditor({ ...domainEditor, loading:true, conflicts:undefined });
    try {
      const response = await fetch(`/api/apps/${encodeURIComponent(domainEditor.app.id)}/domains`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ routes:domainEditor.routes, force }) });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && data.conflicts?.length) { setDomainEditor({ ...domainEditor, loading:false, conflicts:data.conflicts }); return; }
        throw new Error(data.error || 'Could not save addresses');
      }
      setDomainEditor(null); await refreshInstalled(); window.dispatchEvent(new Event('homios:apps-changed'));
    } catch (next:any) { setDomainEditor({ ...domainEditor, loading:false }); setError(next.message); }
  }

  const unavailable = integration && integration.appStoreState !== 'available';
  return <div className="relative flex h-full w-full select-none overflow-hidden bg-gray-50 font-sans text-slate-800 transition-colors dark:bg-[#161618] dark:text-slate-200">
    {sidebarOpen && <button className="absolute inset-0 z-30 bg-black/45 md:hidden" onClick={()=>setSidebarOpen(false)} aria-label="Close categories"/>}
    <aside className={`${sidebarOpen?'translate-x-0':'-translate-x-full'} absolute z-40 m-0 flex h-full w-[260px] flex-shrink-0 flex-col border-r border-neutral-200/60 bg-white p-4 shadow-2xl transition-transform dark:border-white/10 dark:bg-[#1f1f22] md:static md:m-3 md:h-auto md:translate-x-0 md:rounded-[32px] md:border md:shadow-[0_8px_30px_rgb(0,0,0,0.04)]`}>
      <div className="mb-7 flex items-center gap-2 px-1 pt-1"><button onClick={onClose} className="h-3 w-3 rounded-full border border-[#e0443e] bg-[#ff5f56]" title="Close"/><span className="h-3 w-3 rounded-full border border-[#dfa123] bg-[#ffbd2e]"/><span className="h-3 w-3 rounded-full border border-[#1aab29] bg-[#27c93f]"/></div>
      <div className="mb-6 flex items-center gap-3 px-2"><div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-600 text-white shadow-lg"><AppWindow size={20}/></div><div><h2 className="font-semibold text-slate-900 dark:text-white">App Store</h2><p className="text-[11px] text-slate-400">Powered by Coolify</p></div></div>
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pb-5">
        <p className="mb-2 px-3 text-[10px] font-bold tracking-[.16em] text-slate-400">DISCOVER</p>
        <CategoryButton active={category==='All Apps'} icon={Grid3X3} label="All Apps" count={catalog.length} onClick={()=>{setCategory('All Apps');setSidebarOpen(false)}}/>
        <CategoryButton active={category==='HomiOS Verified'} icon={Sparkles} label="HomiOS Verified" count={catalog.filter((app)=>app.verified).length} onClick={()=>{setCategory('HomiOS Verified');setSidebarOpen(false)}}/>
        <p className="mb-2 mt-6 px-3 text-[10px] font-bold tracking-[.16em] text-slate-400">CATEGORIES</p>
        {categories.map(([name,count])=><CategoryButton key={name} active={category===name} icon={Package} label={name} count={count} onClick={()=>{setCategory(name);setSidebarOpen(false)}}/>)}
      </nav>
      <div className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400"><div className="mb-1 flex items-center gap-2 font-medium text-slate-700 dark:text-slate-200"><Server size={14}/>{integration?.reachable?'Coolify connected':'Coolify unavailable'}</div>{catalog.length} one-click apps available</div>
    </aside>

    <main className="min-w-0 flex-1 overflow-y-auto px-5 pb-24 pt-6 md:px-10 md:pt-10">
      <div className="mx-auto max-w-[1320px]">
        <div className="mb-7 flex items-center gap-3"><button className="rounded-xl p-2 text-slate-500 hover:bg-black/5 md:hidden" onClick={()=>setSidebarOpen(true)}><Menu size={22}/></button><div><h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white md:text-3xl">{category}</h1><p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Browse and manage Coolify one-click services from HomiOS.</p></div><button onClick={refresh} className="ml-auto rounded-xl border border-neutral-200 bg-white p-2.5 text-slate-500 shadow-sm hover:text-blue-500 dark:border-white/10 dark:bg-[#1f1f22]"><RefreshCw size={17}/></button></div>
        <div className="relative mb-7 max-w-2xl"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search apps, categories, and tags" className="w-full rounded-2xl border border-neutral-200 bg-white py-3.5 pl-12 pr-4 text-sm shadow-sm outline-none transition focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-[#1f1f22]"/></div>
        {!catalogAvailable&&<div className="mb-5 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">Showing the cached HomiOS catalog. The latest Coolify catalog could not be refreshed.</div>}
        {error&&<div className="mb-5 flex items-center justify-between rounded-2xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">{error}<button onClick={()=>setError('')}><X size={15}/></button></div>}

        {unavailable ? <ConnectionPanel integration={integration} baseUrl={baseUrl} token={token} busy={busy} pending={pendingConnect} setBaseUrl={setBaseUrl} setToken={setToken} connect={connect}/> : <>
          <div className="mb-4 flex items-end justify-between"><div><h3 className="text-lg font-semibold text-slate-900 dark:text-white">{visible.length} apps</h3><p className="text-xs text-slate-400">HomiOS verified and Coolify community templates</p></div></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{visible.map((app)=>{
            const installedApp=installedFor(app.id); const job:any=activeInstall(app.id);
            return <button key={app.id} onClick={()=>setSelected(app)} className={`group rounded-2xl border bg-white p-5 text-left shadow-[0_8px_30px_rgb(0,0,0,0.035)] transition hover:-translate-y-0.5 hover:border-blue-400/50 hover:shadow-xl dark:bg-[#1f1f22] ${selected?.id===app.id?'border-blue-500 ring-4 ring-blue-500/10':'border-neutral-200/70 dark:border-white/10'}`}>
              <div className="flex items-start gap-3"><AppGlyph app={app}/><div className="min-w-0 flex-1"><h4 className="truncate font-semibold text-slate-900 dark:text-white">{app.name}</h4><p className="text-xs text-blue-500">{app.category}</p></div>{installedApp?<CheckCircle2 className="text-emerald-500" size={18}/>:<ChevronRight className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-500" size={18}/>}</div>
              <p className="mt-4 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500 dark:text-slate-400">{app.description}</p>
              <div className="mt-4 flex items-center gap-2 text-[10px] font-medium uppercase tracking-wider text-slate-400">{app.verified?<><ShieldCheck size={12} className="text-emerald-500"/> HomiOS verified</>:<>Coolify catalog</>}</div>
              {job&&<div className="mt-3"><div className="mb-1 flex justify-between text-[10px] text-slate-400"><span>{job.progressData?.stage?.replace('_',' ')||job.status}</span><span>{job.progress}%</span></div><div className="h-1 overflow-hidden rounded-full bg-black/10"><div className="h-full bg-blue-500" style={{width:`${job.progress}%`}}/></div></div>}
            </button>})}</div>
          {visible.length===0&&<div className="rounded-3xl border border-dashed border-neutral-300 py-20 text-center text-slate-400 dark:border-white/10"><Package className="mx-auto mb-3"/><p>No apps match this search.</p></div>}

          {installed.length>0&&<section className="mt-12"><h3 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">Installed Apps</h3><div className="grid gap-3 lg:grid-cols-2">{installed.map((app)=><div key={app.id} className="flex items-center gap-3 rounded-2xl border border-neutral-200/70 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#1f1f22]"><span className={`h-2.5 w-2.5 rounded-full ${app.status==='running'?'bg-emerald-500':app.status==='error'||app.status==='missing'?'bg-red-500':'bg-amber-500'}`}/><div className="min-w-0 flex-1"><p className="truncate font-medium text-slate-900 dark:text-white">{app.name}</p><p className="text-xs capitalize text-slate-400">{app.status}</p></div>{app.primaryUrl&&<IconButton title="Open app" onClick={()=>window.open(app.primaryUrl!,'_blank','noopener,noreferrer')}><ExternalLink size={16}/></IconButton>}<IconButton title="Edit domains and addresses" onClick={()=>openDomains(app)}><Pencil size={16}/></IconButton><IconButton title="Start" onClick={()=>action(app.id,'start')}><Play size={16}/></IconButton><IconButton title="Stop" onClick={()=>action(app.id,'stop')}><Square size={15}/></IconButton><IconButton title="Restart" onClick={()=>action(app.id,'restart')}><RotateCw size={16}/></IconButton><IconButton danger title="Remove" onClick={()=>action(app.id,'remove','DELETE')}><Trash2 size={16}/></IconButton></div>)}</div></section>}
        </>}
      </div>
    </main>

    {selected&&!unavailable&&<aside className="hidden w-[330px] flex-shrink-0 overflow-y-auto border-l border-neutral-200/70 bg-white p-7 dark:border-white/10 dark:bg-[#1f1f22] xl:block"><button onClick={()=>setSelected(null)} className="float-right rounded-full p-1.5 text-slate-400 hover:bg-black/5 dark:hover:bg-white/10"><X size={17}/></button><div className="mt-8"><AppGlyph app={selected} large/></div><h3 className="mt-5 text-2xl font-semibold text-slate-900 dark:text-white">{selected.name}</h3><p className="mt-1 text-sm text-blue-500">{selected.category}</p><p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">{selected.description}</p><div className="mt-5 flex items-center gap-2 text-sm text-emerald-600">{selected.verified?<><ShieldCheck size={16}/>Verified for HomiOS</>:<><Package size={16}/>Maintained by Coolify</>}</div>{selected.requirements?.recommendedRamMb&&<Info label="Recommended memory" value={`${selected.requirements.recommendedRamMb/1024} GB`}/>} {selected.port&&<Info label="Default port" value={selected.port}/>} {selected.documentation&&<a href={selected.documentation} target="_blank" rel="noreferrer" className="mt-5 flex items-center gap-2 text-sm text-blue-500 hover:underline"><BookOpen size={15}/>Documentation</a>}{selected.storage.length>0&&<div className="mt-5 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">This app needs HomiOS drive mapping. Storage-aware installation is coming next.</div>}<button disabled={busy||!!installedFor(selected.id)||!!activeInstall(selected.id)||selected.storage.length>0} onClick={()=>install(selected)} className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white shadow-lg shadow-blue-500/20 disabled:opacity-40">{activeInstall(selected.id)?<><Loader2 className="animate-spin" size={16}/>Installing</>:installedFor(selected.id)?<><CheckCircle2 size={16}/>Installed</>:<><Plus size={16}/>Install</>}</button></aside>}

    {domainEditor&&<DomainEditor value={domainEditor} onChange={(routes)=>setDomainEditor({...domainEditor,routes})} onClose={()=>setDomainEditor(null)} onSave={()=>saveDomains(false)} onForce={()=>saveDomains(true)}/>} 
  </div>;
}

function CategoryButton({active,icon:Icon,label,count,onClick}:any){return <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${active?'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300':'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/5'}`}><Icon size={17} className={active?'text-blue-500':'text-slate-400'}/><span className="min-w-0 flex-1 truncate text-left">{label}</span><span className="text-[10px] text-slate-400">{count}</span></button>}
function AppGlyph({app,large=false}:{app:CatalogApp;large?:boolean}){return <div className={`${large?'h-16 w-16 rounded-2xl text-2xl':'h-11 w-11 rounded-xl text-base'} flex flex-shrink-0 items-center justify-center bg-gradient-to-br ${accentFor(app.id)} font-bold text-white shadow-md`}>{app.name.slice(0,1).toUpperCase()}</div>}
function IconButton({children,title,onClick,danger=false}:any){return <button title={title} onClick={onClick} className={`rounded-lg p-2 transition ${danger?'text-red-500 hover:bg-red-500/10':'text-slate-500 hover:bg-slate-100 hover:text-blue-500 dark:text-slate-300 dark:hover:bg-white/10'}`}>{children}</button>}
function Info({label,value}:{label:string;value:string}){return <div className="mt-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{value}</p></div>}

function ConnectionPanel({integration,baseUrl,token,busy,pending,setBaseUrl,setToken,connect}:any){return <div className="mx-auto mt-16 max-w-xl rounded-[28px] border border-neutral-200 bg-white p-7 shadow-xl dark:border-white/10 dark:bg-[#1f1f22]"><Server className="mb-4 text-violet-500" size={34}/><h3 className="text-xl font-semibold">{integration?.appStoreState==='needs_coolify'?'Apps require Coolify':'Connect Coolify'}</h3><p className="mt-2 text-sm text-slate-500">HomiOS manages apps only inside its dedicated project.</p><div className="mt-5 space-y-3"><input value={baseUrl} onChange={(e)=>setBaseUrl(e.target.value)} placeholder="http://192.168.0.101:8000" className="w-full rounded-xl border border-neutral-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-black/20"/><input type="password" value={token} onChange={(e)=>setToken(e.target.value)} placeholder="API token" className="w-full rounded-xl border border-neutral-200 bg-slate-50 px-4 py-3 text-sm outline-none dark:border-white/10 dark:bg-black/20"/><p className="flex items-center gap-2 text-xs text-slate-500"><ShieldCheck size={14}/>Read, Write, Deploy. Never Root.</p>{pending?.needsServerSelection&&<select onChange={(e)=>connect({serverUuid:e.target.value})} defaultValue="" className="w-full rounded-xl border bg-transparent p-3"><option value="" disabled>Select server</option>{pending.servers.map((item:any)=><option key={item.uuid} value={item.uuid}>{item.name} — {item.ip}</option>)}</select>}{pending?.needsDestinationSelection&&<select onChange={(e)=>connect({destinationUuid:e.target.value})} defaultValue="" className="w-full rounded-xl border bg-transparent p-3"><option value="" disabled>Select Docker destination</option>{pending.destinations.map((item:any)=><option key={item.uuid} value={item.uuid}>{item.name||item.network}</option>)}</select>}{pending?.needsProjectSelection&&<div className="flex gap-2 rounded-xl bg-amber-500/10 p-3 text-sm"><button onClick={()=>connect({conflictResolution:'create-new'})} className="rounded-lg bg-slate-800 px-3 py-2 text-white">Create new</button><button onClick={()=>connect({conflictResolution:'use-existing'})} className="rounded-lg border px-3 py-2">Use existing</button></div>}<button disabled={busy||!baseUrl||!token} onClick={()=>connect()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 font-semibold text-white disabled:opacity-40">{busy&&<Loader2 className="animate-spin" size={16}/>}Connect</button></div></div>}

function DomainEditor({value,onChange,onClose,onSave,onForce}:any){return <div className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"><div className="w-full max-w-xl rounded-[28px] border border-neutral-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#242427]"><div className="flex items-start gap-3"><div className="rounded-2xl bg-blue-500/10 p-3 text-blue-500"><Globe2 size={22}/></div><div><h3 className="text-lg font-semibold text-slate-900 dark:text-white">App addresses</h3><p className="text-sm text-slate-500">{value.app.name} · Changes update Coolify proxy routes.</p></div><button onClick={onClose} className="ml-auto rounded-full p-2 hover:bg-black/5 dark:hover:bg-white/10"><X size={17}/></button></div>{value.loading?<div className="flex justify-center py-12"><Loader2 className="animate-spin text-blue-500"/></div>:<div className="mt-6 space-y-3">{value.routes.map((route:DomainRoute,index:number)=><div key={`${route.name}-${index}`}><label className="mb-1 block text-xs font-medium text-slate-500">{route.name}</label><input value={route.url} onChange={(event)=>onChange(value.routes.map((item:DomainRoute,i:number)=>i===index?{...item,url:event.target.value}:item))} placeholder="https://app.example.com" className="w-full rounded-xl border border-neutral-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 dark:border-white/10 dark:bg-black/20"/></div>)}{value.routes.length===0&&<p className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300">Coolify did not report a routable web container for this service.</p>}{value.conflicts?.length>0&&<div className="rounded-xl bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300"><p className="font-medium">This domain is already in use.</p>{value.conflicts.map((item:any)=><p key={item.domain} className="mt-1 text-xs">{item.domain} · {item.resource_name}</p>)}</div>}<div className="flex justify-end gap-2 pt-3"><button onClick={onClose} className="rounded-xl px-4 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/10">Cancel</button>{value.conflicts?.length>0?<button onClick={onForce} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">Use domain anyway</button>:<button disabled={!value.routes.length} onClick={onSave} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Save addresses</button>}</div></div>}</div></div>}
