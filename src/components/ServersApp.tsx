import React, { useState, useEffect } from 'react';
import {
  Server, Plus, RefreshCw, CheckCircle2, XCircle, AlertCircle, Trash2,
  Cpu, HardDrive, Activity, ChevronRight, Terminal, Cloud, Key, Menu
} from 'lucide-react';

interface ServersAppProps {
  onClose?: () => void;
}

export default function ServersApp({ onClose }: ServersAppProps) {
  const [servers, setServers] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [resources, setResources] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [validating, setValidating] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', ip: '', port: '22', sshUser: 'root', privateKeyId: '', localhost: false });
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const load = async () => {
    const [sv, kv] = await Promise.all([
      fetch('/api/servers').then(r => r.ok ? r.json() : []),
      fetch('/api/security/keys').then(r => r.ok ? r.json() : []),
    ]);
    setServers(Array.isArray(sv) ? sv : []);
    setKeys(Array.isArray(kv) ? kv : []);
  };

  useEffect(() => { load(); }, []);

  const selectServer = async (s: any) => {
    setSelected(s);
    setIsSidebarOpen(false);
    const r = await fetch(`/api/servers/${s.id}/resources`);
    if (r.ok) setResources(await r.json());
    else setResources(null);
  };

  const validate = async (id: string) => {
    setValidating(id);
    await fetch(`/api/servers/${id}/validate`, { method: 'POST' });
    await load();
    if (selected?.id === id) {
      const s = await fetch(`/api/servers/${id}`).then(r => r.json());
      setSelected(s);
    }
    setValidating(null);
  };

  const deleteServer = async (id: string) => {
    if (!confirm('Delete this server?')) return;
    await fetch(`/api/servers/${id}`, { method: 'DELETE' });
    if (selected?.id === id) { setSelected(null); setResources(null); }
    await load();
  };

  const addServer = async () => {
    setLoading(true);
    const body = form.localhost
      ? { name: form.name || 'Local', localhost: true }
      : { name: form.name, ip: form.ip, port: Number(form.port), sshUser: form.sshUser, privateKeyId: form.privateKeyId || undefined };
    const r = await fetch('/api/servers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setLoading(false);
    if (r.ok) { setShowAdd(false); setForm({ name: '', ip: '', port: '22', sshUser: 'root', privateKeyId: '', localhost: false }); await load(); }
  };

  const statusIcon = (s: any) => {
    if (s.is_localhost) return <CheckCircle2 size={14} className="text-blue-500" />;
    if (s.is_usable) return <CheckCircle2 size={14} className="text-emerald-500" />;
    if (s.is_reachable) return <AlertCircle size={14} className="text-yellow-500" />;
    return <XCircle size={14} className="text-red-400" />;
  };

  const statusLabel = (s: any) => {
    if (s.is_localhost) return 'Local';
    if (s.is_usable) return 'Ready';
    if (s.is_reachable) return 'Reachable';
    return 'Unreachable';
  };

  return (
    <div className="h-full w-full flex select-none overflow-hidden bg-gray-50 font-sans text-slate-800">

      {/* Mobile overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 absolute md:static z-50 h-full transition-transform duration-300 ease-in-out flex flex-col bg-white border-r border-neutral-200/50 w-[240px] md:w-[250px] shadow-2xl md:shadow-sm md:m-3 md:rounded-[32px] p-4 pt-5 flex-shrink-0`}>
        <div className="flex items-center space-x-2 mb-4">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90" onClick={() => { if (onClose) onClose(); }} />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90" />
        </div>

        <div className="flex items-center justify-between mb-3 px-1">
          <span className="text-xs font-bold text-slate-400 tracking-wider">SERVERS</span>
          <button onClick={() => setShowAdd(true)} className="text-blue-500 hover:text-blue-700 transition">
            <Plus size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-1">
          {servers.length === 0 && (
            <p className="text-xs text-slate-400 px-3 py-2">No servers yet</p>
          )}
          {servers.map(s => (
            <button
              key={s.id}
              onClick={() => selectServer(s)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all text-sm ${
                selected?.id === s.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {statusIcon(s)}
              <span className="flex-1 truncate">{s.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto pt-6 md:pt-10 px-5 md:px-10 pb-16">
          <div className="flex items-center gap-3 mb-6">
            <button className="md:hidden text-slate-500 hover:text-slate-800 transition" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">
              {selected ? selected.name : 'Servers'}
            </h1>
            {selected && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${selected.is_usable ? 'bg-emerald-100 text-emerald-700' : selected.is_reachable ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-500'}`}>
                {statusLabel(selected)}
              </span>
            )}
          </div>

          {!selected && !showAdd && (
            <div className="flex flex-col items-center justify-center h-64 gap-4 text-slate-400">
              <Cloud size={48} strokeWidth={1.2} />
              <p className="text-sm">Select a server or add a new one</p>
              <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 transition">
                <Plus size={16} /> Add Server
              </button>
            </div>
          )}

          {showAdd && (
            <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50 max-w-lg animate-in fade-in slide-in-from-bottom-4 duration-300">
              <h2 className="text-lg font-semibold mb-5">Add Server</h2>
              <div className="space-y-4">
                <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50 transition">
                  <input type="checkbox" checked={form.localhost} onChange={e => setForm(f => ({ ...f, localhost: e.target.checked }))} className="accent-blue-500" />
                  <span className="text-sm font-medium text-slate-700">This machine (localhost)</span>
                </label>
                <input placeholder="Name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                {!form.localhost && <>
                  <input placeholder="IP Address" value={form.ip} onChange={e => setForm(f => ({ ...f, ip: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <div className="grid grid-cols-2 gap-3">
                    <input placeholder="Port (22)" value={form.port} onChange={e => setForm(f => ({ ...f, port: e.target.value }))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    <input placeholder="SSH user (root)" value={form.sshUser} onChange={e => setForm(f => ({ ...f, sshUser: e.target.value }))}
                      className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <select value={form.privateKeyId} onChange={e => setForm(f => ({ ...f, privateKeyId: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                    <option value="">Select SSH key</option>
                    {keys.map((k: any) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </>}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowAdd(false)} className="flex-1 border border-slate-200 rounded-xl py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Cancel</button>
                <button onClick={addServer} disabled={loading} className="flex-1 bg-blue-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-blue-600 transition disabled:opacity-50">
                  {loading ? 'Adding…' : 'Add Server'}
                </button>
              </div>
            </div>
          )}

          {selected && (
            <div className="space-y-4 animate-in fade-in duration-300">
              {/* Actions */}
              <div className="flex gap-3 flex-wrap">
                <button onClick={() => validate(selected.id)} disabled={validating === selected.id}
                  className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 transition disabled:opacity-60">
                  <RefreshCw size={15} className={validating === selected.id ? 'animate-spin' : ''} />
                  {validating === selected.id ? 'Validating…' : 'Validate Connection'}
                </button>
                <button onClick={() => deleteServer(selected.id)}
                  className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-red-100 transition">
                  <Trash2 size={15} /> Remove
                </button>
              </div>

              {/* Info */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <h3 className="text-base font-semibold mb-4 text-slate-700">Connection</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  <span className="text-slate-500">IP</span><span className="font-medium">{selected.ip || 'localhost'}</span>
                  <span className="text-slate-500">Port</span><span className="font-medium">{selected.port || 22}</span>
                  <span className="text-slate-500">SSH User</span><span className="font-medium">{selected.ssh_user || 'root'}</span>
                  {selected.docker_version && <><span className="text-slate-500">Docker</span><span className="font-medium">{selected.docker_version}</span></>}
                  {selected.last_check_at && <><span className="text-slate-500">Last Check</span><span className="font-medium text-xs">{new Date(selected.last_check_at).toLocaleString()}</span></>}
                </div>
              </div>

              {/* Resources */}
              {resources && (
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                  <h3 className="text-base font-semibold mb-4 text-slate-700">Running Containers</h3>
                  {Array.isArray(resources.containers) && resources.containers.length > 0 ? (
                    <div className="space-y-2">
                      {resources.containers.map((c: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${c.status?.includes('Up') ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                            <span className="font-medium truncate max-w-[200px]">{c.name || c.Names}</span>
                          </div>
                          <span className="text-slate-400 text-xs">{c.status || c.Status}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No running containers</p>
                  )}

                  {resources.diskUsage && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <h4 className="text-sm font-semibold text-slate-600 mb-3 flex items-center gap-2"><HardDrive size={14} /> Disk Usage</h4>
                      <div className="space-y-1 text-xs text-slate-500">
                        {resources.diskUsage.split('\n').filter(Boolean).map((l: string, i: number) => (
                          <div key={i} className="font-mono">{l}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
