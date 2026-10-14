import { useEffect, useMemo, useState } from 'react';
import { Copy, Pause, Play, RefreshCw, Search } from 'lucide-react';
import type { InstalledApp } from '../../../hooks/useInstalledApps';
import { useRemoteResource } from '../../../hooks/useRemoteResource';
import { useVirtualRows } from '../../../hooks/useVirtualRows';
import { Button, EmptyState, ErrorPanel, IconButton, Sheet, Skeleton } from '../../../components/ui/surfaces';
import { toast } from '../../../components/SystemUI';

export default function AppLogs({ app, onClose, isActive = true }: { app: InstalledApp; onClose: () => void; isActive?: boolean }) {
  const [paused, setPaused] = useState(false);
  const [query, setQuery] = useState('');
  const resource = useRemoteResource<{ logs: Array<{ timestamp?: string; message: string }> }>(`/api/apps/${encodeURIComponent(app.id)}/logs`, isActive);
  const { refresh } = resource;
  useEffect(() => {
    if (!isActive || paused) return;
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [isActive, paused, refresh]);
  const lines = useMemo(() => (resource.data?.logs || []).flatMap(line => `${line.timestamp ? line.timestamp + ' ' : ''}${line.message}`.split('\n')).filter(line => line.toLocaleLowerCase().includes(query.toLocaleLowerCase())), [resource.data, query]);
  const rows = useVirtualRows(lines.length, 24);
  return <Sheet title={`${app.name} · Logs`} onClose={onClose} wide>
    <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200/60 p-3 dark:border-white/10"><div className="relative min-w-36 flex-1"><Search size={15} className="absolute left-3 top-3.5 text-neutral-400"/><input type="search" aria-label="Search logs" placeholder="Search logs" value={query} onChange={event => setQuery(event.target.value)} className="min-h-11 w-full rounded-xl border border-neutral-200 bg-transparent pl-9 pr-3 text-xs dark:border-white/10"/></div><Button onClick={() => setPaused(value => !value)}>{paused ? <Play size={15}/> : <Pause size={15}/>}{paused ? 'Resume' : 'Pause'}</Button><IconButton label="Refresh logs" disabled={resource.pending} onClick={() => void refresh()}><RefreshCw size={16} className={resource.pending ? 'animate-spin' : ''}/></IconButton><IconButton label="Copy visible logs" disabled={!lines.length} onClick={() => void navigator.clipboard.writeText(lines.join('\n')).then(() => toast({ message: 'Logs copied', tone: 'success' })).catch(() => toast({ message: 'Clipboard access is unavailable.', tone: 'warning' }))}><Copy size={16}/></IconButton></div>
    {resource.error && <div className="p-3"><ErrorPanel message={resource.error} onRetry={() => void refresh()}/></div>}
    <div ref={rows.ref} className="min-h-72 flex-1 overflow-auto bg-[#141418] p-4 font-mono text-[11px] leading-6 text-neutral-300" aria-label="Application log output" style={{ maxHeight: '60dvh' }}>{resource.loading ? <div className="space-y-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-4 w-3/4"/>)}</div> : lines.length ? <div style={{ position: 'relative', height: rows.totalHeight }}><pre style={{ position: 'absolute', top: rows.offset, margin: 0 }}>{lines.slice(rows.start, rows.end).join('\n')}</pre></div> : !resource.error && <EmptyState title={query ? 'No matching log lines' : 'No logs yet'} description={query ? 'Try another search.' : 'Output will appear here when the app writes logs.'}/>}</div><p className="px-5 py-3 text-[11px] text-neutral-400" role="status">{lines.length} lines · {paused ? 'Automatic refresh paused' : 'Refreshes every 5 seconds while visible'}</p>
  </Sheet>;
}
