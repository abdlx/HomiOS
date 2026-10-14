import { useState } from 'react';
import { Server } from 'lucide-react';
import type { Integration } from '../types';
import { Button, ErrorPanel, Sheet } from '../../../components/ui/surfaces';
export default function ConnectionSetup({ integration, onClose, onConnected }: { integration?: Integration; onClose: () => void; onConnected: () => void }) {
  const [baseUrl, setBaseUrl] = useState(integration?.baseUrl || ''); const [token, setToken] = useState('');
  const [pending, setPending] = useState<any>(null); const [options, setOptions] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function connect(extra: Record<string, any> = {}) {
    if (busy) return; setBusy(true); setError(''); const next = { ...options, ...extra }; setOptions(next);
    try {
      const response = await fetch('/api/integrations/coolify/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseUrl, token, ...next }) });
      const value = await response.json(); if (!response.ok) throw new Error(value.error || 'Connection failed');
      if (!value.connected) { setPending(value); return; }
      setToken(''); onConnected(); onClose();
    } catch (nextError) { setError(nextError instanceof Error ? nextError.message : 'Connection failed'); }
    finally { setBusy(false); }
  }
  return <Sheet title="Connect Coolify" onClose={onClose}><form className="space-y-4 overflow-auto p-5" onSubmit={event => { event.preventDefault(); void connect(); }}><div className="flex gap-3 text-sm"><Server size={22} className="shrink-0 text-blue-500"/><p className="text-xs leading-6 text-neutral-500">Connect your Coolify server to install and manage apps from HomiOS.</p></div>{error && <ErrorPanel message={error}/>}<label className="block text-xs font-medium">Server URL<input type="url" required value={baseUrl} onChange={event => { setBaseUrl(event.target.value); setPending(null); setOptions({}); }} placeholder="http://server:8000" className="mt-2 min-h-11 w-full rounded-xl border border-neutral-200 bg-transparent px-3 text-sm dark:border-white/10"/></label><label className="block text-xs font-medium">API token<input type="password" required value={token} onChange={event => setToken(event.target.value)} autoComplete="off" className="mt-2 min-h-11 w-full rounded-xl border border-neutral-200 bg-transparent px-3 text-sm dark:border-white/10"/></label>
    {pending?.needsServerSelection && <label className="block text-xs">Server<select aria-label="Coolify server" disabled={busy} defaultValue="" onChange={event => void connect({ serverUuid: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border bg-transparent px-3"><option value="" disabled>Select server</option>{pending.servers.map((server: any) => <option key={server.uuid} value={server.uuid}>{server.name} · {server.ip}</option>)}</select></label>}
    {pending?.needsDestinationSelection && <label className="block text-xs">Docker destination<select aria-label="Docker destination" disabled={busy} defaultValue="" onChange={event => void connect({ destinationUuid: event.target.value })} className="mt-2 min-h-11 w-full rounded-xl border bg-transparent px-3"><option value="" disabled>Select destination</option>{pending.destinations.map((item: any) => <option key={item.uuid} value={item.uuid}>{item.name || item.network}</option>)}</select></label>}
    {pending?.needsProjectSelection && <div className="space-y-2 rounded-xl bg-amber-500/10 p-3"><p className="text-xs">A HomiOS project already exists. Choose which project to manage.</p><div className="flex gap-2"><Button disabled={busy} onClick={() => void connect({ conflictResolution: 'create-new' })}>Create new</Button><Button disabled={busy} onClick={() => void connect({ conflictResolution: 'use-existing' })}>Use existing</Button></div></div>}
    <div className="flex justify-end gap-2"><Button type="button" onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!baseUrl || !token}>Connect</Button></div></form></Sheet>;
}
