import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Box, Play, Square, RotateCcw, RefreshCw, History, Terminal, Plus, Trash, Server, X, Activity, ChevronRight, Layers, LayoutGrid, Menu, Save, Pencil, Copy, Check, Store, Archive } from 'lucide-react';
import io from 'socket.io-client';
import { confirmDialog } from './SystemUI';

interface AppProps {
  onClose: () => void;
  initialAppId?: string | null;
}

type Toast = { id: number; kind: 'success' | 'error' | 'info'; text: string };

const BLANK_APP = { name: '', build_pack: 'dockerimage', docker_image: '', docker_image_tag: 'latest', compose_content: '', ports: '', env_vars: '', domains: '', git_repo: '', git_branch: 'main', volumes: '', cpu_limit: '', mem_limit: '' };

export default function DockerManagerApp({ onClose, initialAppId }: AppProps) {
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProject, setSelectedProject] = useState<any | null>(null);
  const [apps, setApps] = useState<any[]>([]);
  const [selectedApp, setSelectedApp] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | 'logs' | 'metrics'>('config');
  const [metrics, setMetrics] = useState<any[]>([]);

  const [showWizard, setShowWizard] = useState(false);
  const [showProjectModal, setShowProjectModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [newApp, setNewApp] = useState({ ...BLANK_APP });

  const [editMode, setEditMode] = useState(false);
  const [editApp, setEditApp] = useState<any | null>(null);

  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [copied, setCopied] = useState(false);

  // App Store
  const [showStore, setShowStore] = useState(false);
  const [catalog, setCatalog] = useState<any[]>([]);
  const [storeSel, setStoreSel] = useState<any | null>(null);
  const [storeForm, setStoreForm] = useState({ name: '', domains: '' });
  const [installing, setInstalling] = useState(false);

  // Backups
  const [backups, setBackups] = useState<any[]>([]);
  const [backingUp, setBackingUp] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const deploySocket = useRef<any>(null);
  const logsSocket = useRef<any>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // ── toasts ───────────────────────────────────────────────────────────────
  const toast = useCallback((kind: Toast['kind'], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  // ── data fetching ──────────────────────────────────────────────────────────
  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/docker/projects');
      const data = await res.json();
      if (Array.isArray(data)) {
        setProjects(data);
        setSelectedProject((cur: any) => cur || (!initialAppId && data.length ? data[0] : cur));
      }
    } catch { toast('error', 'Failed to load projects'); }
  }, [initialAppId, toast]);

  const fetchApps = useCallback(async (projectId: string) => {
    try {
      const res = await fetch(`/api/docker/projects/${projectId}/apps`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setApps(data);
        // keep selectedApp status fresh from reconciliation, without clobbering edits
        setSelectedApp((cur: any) => {
          if (!cur) return cur;
          const fresh = data.find((a: any) => a.id === cur.id);
          return fresh ? { ...cur, status: fresh.status, health: fresh.health } : cur;
        });
      }
    } catch { /* transient */ }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  useEffect(() => {
    if (!selectedProject) return;
    fetchApps(selectedProject.id);
    const t = setInterval(() => fetchApps(selectedProject.id), 5000); // reflect reconciled status
    return () => clearInterval(t);
  }, [selectedProject, fetchApps]);

  useEffect(() => {
    if (!initialAppId) return;
    fetch('/api/docker/apps').then((r) => r.json()).then((data) => {
      if (!Array.isArray(data)) return;
      const app = data.find((a: any) => a.id === initialAppId);
      if (app) {
        const proj = projects.find((p) => p.id === app.project_id);
        if (proj) setSelectedProject(proj);
        setSelectedApp(app);
      }
    });
  }, [initialAppId, projects.length]);

  // disconnect sockets when leaving an app or unmounting
  const closeSockets = useCallback(() => {
    if (deploySocket.current) { deploySocket.current.disconnect(); deploySocket.current = null; }
    if (logsSocket.current) { logsSocket.current.emit('unsubscribe_logs'); logsSocket.current.disconnect(); logsSocket.current = null; }
  }, []);
  useEffect(() => () => closeSockets(), [closeSockets]);
  useEffect(() => { setEditMode(false); setLiveLogs([]); closeSockets(); }, [selectedApp?.id, closeSockets]);

  // ── project / app creation ──────────────────────────────────────────────────
  const createProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    const res = await fetch('/api/docker/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    if (res.ok) { toast('success', `Project "${name}" created`); setShowProjectModal(false); setProjectName(''); fetchProjects(); }
    else { const e = await res.json().catch(() => ({})); toast('error', e.error || 'Could not create project'); }
  };

  const createAndDeploy = async () => {
    if (!selectedProject) return;
    const res = await fetch(`/api/docker/projects/${selectedProject.id}/apps`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newApp), // raw strings; server validates + parses
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast('error', e.error || 'Validation failed'); return; }
    const created = await res.json();
    setShowWizard(false);
    setNewApp({ ...BLANK_APP });
    await fetchApps(selectedProject.id);
    setSelectedApp(created);
    setActiveTab('logs');
    startDeployment(created.id);
  };

  // ── App Store ────────────────────────────────────────────────────────────────
  const openStore = async () => {
    setShowStore(true); setStoreSel(null);
    if (catalog.length === 0) {
      try { const r = await fetch('/api/docker/catalog'); const d = await r.json(); if (Array.isArray(d)) setCatalog(d); }
      catch { toast('error', 'Failed to load App Store'); }
    }
  };

  const installFromCatalog = async () => {
    if (!selectedProject || !storeSel) return;
    if (storeSel.needsDomain && !storeForm.domains.trim()) { toast('error', `${storeSel.name} requires a domain`); return; }
    setInstalling(true);
    try {
      const res = await fetch(`/api/docker/catalog/${storeSel.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: selectedProject.id, name: storeForm.name || storeSel.id, domains: storeForm.domains }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast('error', data.error || 'Install failed'); return; }
      setShowStore(false); setStoreSel(null); setStoreForm({ name: '', domains: '' });
      await fetchApps(selectedProject.id);
      setSelectedApp(data); setActiveTab('logs');
      startDeployment(data.id);
      toast('success', `Installing ${storeSel.name}…`);
    } finally { setInstalling(false); }
  };

  // ── Backups ──────────────────────────────────────────────────────────────────
  const loadBackups = useCallback(async (appId: string) => {
    try { const r = await fetch(`/api/docker/apps/${appId}/backups`); const d = await r.json(); if (Array.isArray(d)) setBackups(d); }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { if (selectedApp?.id) loadBackups(selectedApp.id); else setBackups([]); }, [selectedApp?.id, loadBackups]);

  const createBackup = async () => {
    if (!selectedApp) return;
    setBackingUp(true);
    try {
      const res = await fetch(`/api/docker/apps/${selectedApp.id}/backups`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toast('error', data.message || data.error || 'Backup failed'); return; }
      toast('success', `Backed up ${data.files?.length || 0} volume(s)`);
      loadBackups(selectedApp.id);
    } finally { setBackingUp(false); }
  };

  // ── deployment streaming ────────────────────────────────────────────────────
  const streamDeployment = (deploymentId: string) => {
    if (deploySocket.current) deploySocket.current.disconnect();
    const socket = io();
    deploySocket.current = socket;
    socket.emit('join_deployment', deploymentId);
    socket.on('log', (line: string) => {
      setLiveLogs((prev) => [...prev, line]);
      requestAnimationFrame(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    });
  };

  const startDeployment = async (appId: string) => {
    setLiveLogs(['Queueing deployment…']);
    setActiveTab('logs');
    setSelectedApp((p: any) => (p ? { ...p, status: 'deploying' } : p));
    const res = await fetch(`/api/docker/apps/${appId}/deploy`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (selectedProject) fetchApps(selectedProject.id);
    if (data.deploymentId) streamDeployment(data.deploymentId);
    else toast('error', data.error || 'Deploy failed to start');
  };

  const lifecycle = async (appId: string, action: 'start' | 'stop' | 'restart' | 'redeploy' | 'rollback') => {
    const res = await fetch(`/api/docker/apps/${appId}/lifecycle`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast('error', data.error || `${action} failed`); return; }
    if (data.deploymentId) { setActiveTab('logs'); setLiveLogs([`${action} queued…`]); streamDeployment(data.deploymentId); }
    else toast('success', `${action} ✓`);
    if (selectedProject) setTimeout(() => fetchApps(selectedProject.id), 800);
  };

  const saveAndRedeploy = async () => {
    if (!editApp) return;
    const fields = ['name', 'docker_image', 'docker_image_tag', 'compose_content', 'ports', 'env_vars', 'domains', 'git_repo', 'git_branch', 'volumes', 'cpu_limit', 'mem_limit'];
    const body: any = {};
    for (const f of fields) if (editApp[f] !== undefined) body[f] = editApp[f];
    const res = await fetch(`/api/docker/apps/${editApp.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); toast('error', e.error || 'Invalid config'); return; }
    const updated = await res.json();
    setSelectedApp(updated);
    setEditMode(false);
    toast('success', 'Saved — redeploying with new config');
    startDeployment(updated.id);
  };

  const deleteApp = async (appId: string) => {
    if (!(await confirmDialog({ title: 'Delete this resource?', message: 'Containers are removed; named volumes are preserved. This cannot be undone.', tone: 'danger', confirmLabel: 'Delete' }))) return;
    const res = await fetch(`/api/docker/apps/${appId}`, { method: 'DELETE' });
    if (res.ok) { toast('success', 'Resource deleted'); if (selectedProject) fetchApps(selectedProject.id); setSelectedApp(null); }
    else toast('error', 'Delete failed');
  };

  // ── live metrics ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activeTab !== 'metrics' || !selectedApp || selectedApp.status !== 'running') return;
    const socket = io();
    socket.emit('subscribe_stats', selectedApp.id);
    socket.on(`stats:${selectedApp.id}`, (data: any) => { if (Array.isArray(data)) setMetrics(data); });
    return () => { socket.emit('unsubscribe_stats'); socket.disconnect(); };
  }, [activeTab, selectedApp?.id, selectedApp?.status]);

  // ── live runtime logs (distinct from deploy logs) ────────────────────────────
  useEffect(() => {
    if (activeTab !== 'logs' || !selectedApp || selectedApp.status !== 'running') return;
    const socket = io();
    logsSocket.current = socket;
    socket.emit('subscribe_logs', selectedApp.id);
    socket.on(`applog:${selectedApp.id}`, (line: string) => {
      setLiveLogs((prev) => [...prev.slice(-800), line]);
      requestAnimationFrame(() => logsEndRef.current?.scrollIntoView({ behavior: 'smooth' }));
    });
    return () => { socket.emit('unsubscribe_logs'); socket.disconnect(); if (logsSocket.current === socket) logsSocket.current = null; };
  }, [activeTab, selectedApp?.id, selectedApp?.status]);

  const webhookUrl = selectedApp ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/docker/webhooks/deploy/${selectedApp.id}?secret=${selectedApp.webhook_secret || ''}` : '';

  const statusPill = (status: string) => (
    <span className={`ml-3 px-2.5 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${
      status === 'running' ? 'bg-green-100 text-green-700' :
      status === 'deploying' ? 'bg-amber-100 text-amber-700' :
      status === 'error' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{status}</span>
  );

  const ec = 'w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-2.5 text-sm text-gray-800 dark:text-gray-100 focus:border-[#007aff] focus:outline-none transition';
  const field = (label: string, key: string, opts: { mono?: boolean; area?: boolean } = {}) => (
    <div>
      <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">{label}</label>
      {opts.area ? (
        <textarea readOnly={!editMode} value={(editMode ? editApp?.[key] : selectedApp?.[key]) || ''} onChange={(e) => setEditApp((a: any) => ({ ...a, [key]: e.target.value }))} className={`${ec} ${opts.mono ? 'font-mono' : ''} h-24`} />
      ) : (
        <input type="text" readOnly={!editMode} value={(editMode ? editApp?.[key] : selectedApp?.[key]) || ''} onChange={(e) => setEditApp((a: any) => ({ ...a, [key]: e.target.value }))} className={`${ec} ${opts.mono ? 'font-mono' : ''}`} />
      )}
    </div>
  );

  return (
    <div className="h-full w-full flex bg-gray-50 dark:bg-[#161618] select-none overflow-hidden font-sans relative">
      {/* toasts */}
      <div className="fixed top-4 right-4 z-[200] space-y-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={`px-4 py-2.5 rounded-[12px] shadow-lg text-sm font-medium text-white animate-in slide-in-from-right-4 ${t.kind === 'success' ? 'bg-green-600' : t.kind === 'error' ? 'bg-red-600' : 'bg-gray-800'}`}>{t.text}</div>
        ))}
      </div>

      {isSidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsSidebarOpen(false)} />}

      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 absolute md:static z-50 h-full md:h-auto transition-transform duration-300 ease-in-out flex flex-col justify-between w-[240px] md:w-[250px] bg-white dark:bg-[#1f1f22] md:border md:border-neutral-200/50 dark:md:border-white/10 shadow-2xl md:shadow-sm md:m-3 md:rounded-[32px] p-4 pt-5`}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between mb-6 px-1">
            <div className="flex items-center space-x-2">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all" title="Close" onClick={onClose} />
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123]" title="Minimize" />
              <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29]" title="Zoom" />
            </div>
          </div>
          <div className="mb-2 px-2 flex justify-between items-center">
            <span className="text-[11px] font-bold text-gray-400 dark:text-gray-500 tracking-wider uppercase">Projects</span>
            <button onClick={() => { setProjectName(''); setShowProjectModal(true); }} className="text-gray-400 dark:text-gray-500 hover:text-blue-500 transition-colors"><Plus size={14} /></button>
          </div>
          <div className="flex-1 overflow-y-auto pr-1 space-y-1">
            {projects.map((p) => {
              const isActive = selectedProject?.id === p.id;
              return (
                <button key={p.id} onClick={() => { setSelectedProject(p); setSelectedApp(null); setIsSidebarOpen(false); }}
                  className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors font-medium ${isActive ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-300 hover:bg-neutral-200/50 dark:hover:bg-white/5 hover:text-gray-900 dark:hover:text-white'}`}>
                  <Layers size={16} className={`flex-shrink-0 ${isActive ? 'text-blue-600 dark:text-blue-300' : 'text-gray-400 dark:text-gray-500'}`} />
                  <span className="truncate flex-1">{p.name}</span>
                </button>
              );
            })}
            {projects.length === 0 && <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500 italic">No projects found.</div>}
          </div>
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden bg-gray-50 dark:bg-[#161618] md:pt-3 md:pr-3 md:pb-3 w-full">
        {selectedProject ? (
          selectedApp ? (
            <div className="flex flex-col h-full bg-white dark:bg-[#1c1c1e] md:rounded-[32px] md:border border-neutral-200/50 dark:border-white/10 shadow-sm overflow-hidden transform-gpu">
              <div className="px-4 md:px-8 py-6 border-b border-neutral-100 dark:border-white/10 flex justify-between items-start md:rounded-t-[32px] bg-white dark:bg-[#1c1c1e]">
                <div className="flex gap-3">
                  <button onClick={() => setIsSidebarOpen(true)} className="md:hidden mt-1 text-gray-500 dark:text-gray-400"><Menu size={20} /></button>
                  <div>
                    <button onClick={() => setSelectedApp(null)} className="flex items-center text-xs font-medium text-gray-400 hover:text-blue-500 mb-3 transition-colors">← Back to {selectedProject.name}</button>
                    <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white flex flex-wrap items-center gap-2">{selectedApp.name}{statusPill(selectedApp.status)}</h1>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 justify-end flex-shrink-0">
                  {selectedApp.status === 'running' ? (
                    <button onClick={() => lifecycle(selectedApp.id, 'stop')} className="px-3 py-2 bg-white dark:bg-white/5 hover:bg-neutral-50 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-[10px] border border-neutral-200 dark:border-white/10 flex items-center shadow-sm"><Square size={14} className="mr-1.5 text-red-500" /> Stop</button>
                  ) : (
                    <button onClick={() => lifecycle(selectedApp.id, 'start')} disabled={selectedApp.status === 'deploying'} className="px-3 py-2 bg-white dark:bg-white/5 hover:bg-neutral-50 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-[10px] border border-neutral-200 dark:border-white/10 flex items-center shadow-sm disabled:opacity-40"><Play size={14} className="mr-1.5 text-green-600" /> Start</button>
                  )}
                  <button onClick={() => lifecycle(selectedApp.id, 'restart')} disabled={selectedApp.status === 'deploying'} className="px-3 py-2 bg-white dark:bg-white/5 hover:bg-neutral-50 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-[10px] border border-neutral-200 dark:border-white/10 flex items-center shadow-sm disabled:opacity-40"><RotateCcw size={14} className="mr-1.5" /> Restart</button>
                  <button onClick={() => lifecycle(selectedApp.id, 'rollback')} disabled={selectedApp.status === 'deploying'} className="px-3 py-2 bg-white dark:bg-white/5 hover:bg-neutral-50 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-[10px] border border-neutral-200 dark:border-white/10 flex items-center shadow-sm disabled:opacity-40" title="Roll back to previous deployment"><History size={14} className="mr-1.5" /> Rollback</button>
                  <button onClick={() => startDeployment(selectedApp.id)} disabled={selectedApp.status === 'deploying'} className="px-4 py-2 bg-[#007aff] hover:bg-[#0062cc] text-white text-sm font-medium rounded-[10px] shadow-sm flex items-center disabled:opacity-50"><RefreshCw size={14} className={`mr-1.5 ${selectedApp.status === 'deploying' ? 'animate-spin' : ''}`} /> {selectedApp.status === 'deploying' ? 'Deploying' : 'Redeploy'}</button>
                </div>
              </div>

              <div className="px-4 md:px-8 border-b border-neutral-100 dark:border-white/10 flex space-x-6 overflow-x-auto hide-scrollbar">
                {['config', 'metrics', 'logs'].map((tab) => (
                  <button key={tab} onClick={() => setActiveTab(tab as any)} className={`py-3 text-sm font-medium transition-colors border-b-2 ${activeTab === tab ? 'border-[#007aff] text-[#007aff]' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-100'}`}>{tab.charAt(0).toUpperCase() + tab.slice(1)}</button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50 dark:bg-[#161618]">
                {activeTab === 'config' && (
                  <div className="max-w-3xl space-y-8">
                    <section className="bg-white dark:bg-[#1f1f22] p-6 rounded-[20px] border border-neutral-200/60 dark:border-white/10 shadow-sm">
                      <div className="flex justify-between items-center mb-5">
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white">Configuration</h3>
                        {editMode ? (
                          <div className="flex gap-2">
                            <button onClick={() => setEditMode(false)} className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-neutral-200 dark:border-white/10 rounded-[10px] hover:bg-neutral-50 dark:hover:bg-white/10">Cancel</button>
                            <button onClick={saveAndRedeploy} className="px-3 py-1.5 text-sm font-bold text-white bg-[#007aff] hover:bg-[#0062cc] rounded-[10px] flex items-center"><Save size={14} className="mr-1.5" /> Save & Redeploy</button>
                          </div>
                        ) : (
                          <button onClick={() => { setEditApp({ ...selectedApp }); setEditMode(true); }} className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-neutral-200 dark:border-white/10 rounded-[10px] hover:bg-neutral-50 dark:hover:bg-white/10 flex items-center"><Pencil size={14} className="mr-1.5" /> Edit</button>
                        )}
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1.5">Webhook (CI/CD Auto-Deploy · secret-signed)</label>
                          <div className="flex">
                            <input type="text" readOnly value={webhookUrl} className="flex-1 bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-l-[10px] p-2.5 text-sm text-gray-800 dark:text-gray-200 font-mono focus:outline-none truncate" />
                            <button onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }} className="px-4 bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-700 dark:text-gray-200 font-bold text-xs rounded-r-[10px] flex items-center">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
                          </div>
                        </div>
                        {field('Name', 'name')}
                        {(selectedApp.build_pack === 'dockerimage' || selectedApp.build_pack === 'database') && field('Docker Image', 'docker_image')}
                        {(selectedApp.build_pack === 'dockerimage' || selectedApp.build_pack === 'database') && field('Image Tag', 'docker_image_tag')}
                        {selectedApp.build_pack === 'github' && field('Git Repository', 'git_repo')}
                        {selectedApp.build_pack === 'github' && field('Branch', 'git_branch')}
                        {field('Domains (Proxy)', 'domains')}
                        {field('Ports (host:container)', 'ports')}
                        {field('Persistent Volumes', 'volumes')}
                        <div className="grid grid-cols-2 gap-4">
                          {field('CPU Limit (cores)', 'cpu_limit')}
                          {field('Memory Limit (e.g. 512m)', 'mem_limit')}
                        </div>
                        {field('Environment Variables', 'env_vars', { mono: true, area: true })}
                        {selectedApp.build_pack === 'dockercompose' && field('docker-compose.yml', 'compose_content', { mono: true, area: true })}
                      </div>
                    </section>
                    <section className="bg-white dark:bg-[#1f1f22] p-6 rounded-[20px] border border-neutral-200/60 dark:border-white/10 shadow-sm">
                      <div className="flex justify-between items-center mb-4">
                        <div>
                          <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center"><Archive size={18} className="mr-2 text-indigo-500" /> Volume Backups</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Snapshot named volumes to compressed archives on the host.</p>
                        </div>
                        <button onClick={createBackup} disabled={backingUp} className="px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-[10px] disabled:opacity-50 flex items-center">{backingUp ? <RefreshCw size={14} className="mr-1.5 animate-spin" /> : <Archive size={14} className="mr-1.5" />} Back Up Now</button>
                      </div>
                      {backups.length === 0 ? (
                        <p className="text-sm text-gray-400 italic">No backups yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {backups.map((b) => (
                            <div key={b.file} className="flex justify-between items-center bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] px-3 py-2 text-sm">
                              <span className="font-mono text-gray-700 dark:text-gray-300 truncate mr-3" title={b.file}>{b.file}</span>
                              <span className="text-gray-400 dark:text-gray-500 flex-shrink-0 text-xs">{(b.size / 1024 / 1024).toFixed(1)} MB · {new Date(b.created).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </section>
                    <section className="p-6 rounded-[20px] border border-red-200 dark:border-red-500/25 bg-red-50 dark:bg-red-500/10">
                      <h3 className="text-lg font-bold text-red-600 dark:text-red-400 mb-2">Danger Zone</h3>
                      <p className="text-sm text-red-500/80 dark:text-red-400/80 mb-4">Permanently delete this resource. Containers are removed; named volumes are preserved.</p>
                      <button onClick={() => deleteApp(selectedApp.id)} className="px-4 py-2 bg-white dark:bg-white/5 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-500/25 text-sm font-medium rounded-[10px] shadow-sm flex items-center"><Trash size={14} className="mr-2" /> Delete Resource</button>
                    </section>
                  </div>
                )}
                {activeTab === 'metrics' && (
                  <div className="max-w-4xl space-y-6">
                    {selectedApp.status !== 'running' ? (
                      <div className="text-center py-10 text-gray-500 dark:text-gray-400">Deploy the application to view live metrics.</div>
                    ) : metrics.length === 0 ? (
                      <div className="text-center py-10 text-gray-500 dark:text-gray-400 flex items-center justify-center"><Activity size={16} className="mr-2 animate-pulse" /> Waiting for Docker stats…</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {metrics.map((m, i) => (
                          <div key={i} className="bg-white dark:bg-[#1f1f22] p-5 rounded-[20px] border border-neutral-200/60 dark:border-white/10 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-400 to-indigo-500" />
                            <h4 className="font-bold text-gray-900 dark:text-white truncate mb-4 pr-6" title={m.name}>{m.name}</h4>
                            <div className="grid grid-cols-2 gap-4">
                              <div><p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">CPU</p><p className="text-xl font-bold text-blue-600">{m.cpu}</p></div>
                              <div><p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">Memory</p><p className="text-sm font-bold text-indigo-600 truncate">{m.mem}</p></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {activeTab === 'logs' && (
                  <div className="h-full flex flex-col bg-gray-900 rounded-[20px] shadow-inner overflow-hidden">
                    <div className="bg-gray-800 px-4 py-2 flex justify-between items-center border-b border-gray-700">
                      <span className="text-xs font-mono text-gray-400 flex items-center"><Terminal size={12} className="mr-2" /> {selectedApp.status === 'running' ? 'runtime logs (live)' : 'deployment output'}</span>
                      <button onClick={() => setLiveLogs([])} className="text-xs text-gray-500 dark:text-gray-400 hover:text-white transition">Clear</button>
                    </div>
                    <div className="flex-1 p-4 overflow-y-auto font-mono text-sm leading-relaxed text-green-400">
                      {liveLogs.length === 0 ? <div className="text-gray-500 dark:text-gray-400 italic">No active logs.</div> : liveLogs.map((log, i) => <div key={i} className="break-all whitespace-pre-wrap">{log}</div>)}
                      <div ref={logsEndRef} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Project dashboard
            <div className="flex flex-col h-full bg-white dark:bg-[#1c1c1e] md:rounded-[32px] md:border border-neutral-200/50 dark:border-white/10 shadow-sm overflow-hidden relative transform-gpu">
              <div className="px-4 md:px-8 py-6 md:py-8 border-b border-neutral-100 dark:border-white/10 flex justify-between items-end bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-md sticky top-0 z-10 md:rounded-t-[32px]">
                <div className="flex gap-3">
                  <button onClick={() => setIsSidebarOpen(true)} className="md:hidden mt-2 text-gray-500 dark:text-gray-400"><Menu size={24} /></button>
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white tracking-tight mb-1">{selectedProject.name}</h1>
                    <p className="text-gray-500 dark:text-gray-400 font-medium text-xs md:text-sm">Manage resources and containers.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={openStore} className="px-4 py-2 bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/10 text-gray-800 dark:text-gray-200 font-medium rounded-[10px] shadow-sm flex items-center text-sm"><Store size={16} className="mr-1.5 text-indigo-500" /> App Store</button>
                  <button onClick={() => { setNewApp({ ...BLANK_APP }); setShowWizard(true); }} className="px-5 py-2 bg-[#007aff] hover:bg-[#0062cc] text-white font-medium rounded-[10px] shadow-sm flex items-center text-sm"><Plus size={16} className="mr-1.5" /> Add Resource</button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-gray-50 dark:bg-[#161618]">
                {apps.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto">
                    <div className="w-16 h-16 bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-full flex items-center justify-center mb-4 shadow-sm"><LayoutGrid size={28} className="text-[#007aff]" /></div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">No resources found</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Start by adding a Docker container, a database, a Git repo, or a Compose stack.</p>
                    <button onClick={() => { setNewApp({ ...BLANK_APP }); setShowWizard(true); }} className="px-5 py-2.5 bg-white dark:bg-white/5 border border-neutral-200 dark:border-white/10 hover:bg-neutral-50 dark:hover:bg-white/10 text-gray-800 dark:text-gray-200 font-bold rounded-[12px] shadow-sm">Add your first resource</button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {apps.map((app) => (
                      <div key={app.id} onClick={() => setSelectedApp(app)} className="bg-white dark:bg-[#1f1f22] rounded-[20px] border border-neutral-200/60 dark:border-white/10 p-5 cursor-pointer hover:border-[#007aff]/30 transition-all hover:shadow-md group flex flex-col h-44">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center space-x-3">
                            <div className={`p-2.5 rounded-[12px] ${app.status === 'running' ? 'bg-green-100 dark:bg-green-500/15 text-green-600 dark:text-green-400' : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-gray-400'}`}><Box size={20} /></div>
                            <div>
                              <h3 className="font-bold text-lg text-gray-900 dark:text-white group-hover:text-[#007aff] transition-colors truncate max-w-[140px]">{app.name}</h3>
                              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{app.build_pack}</p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-1.5">
                            {app.status === 'running' && <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)] animate-pulse" title="Running" />}
                            {app.status === 'deploying' && <div className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)] animate-pulse" title="Deploying" />}
                            {app.status === 'error' && <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" title="Error" />}
                            {app.status === 'stopped' && <div className="w-2 h-2 rounded-full bg-gray-300" title="Stopped" />}
                          </div>
                        </div>
                        <div className="mt-auto flex justify-between items-center text-xs border-t border-neutral-100 dark:border-white/10 pt-3 text-gray-500 dark:text-gray-400 font-medium">
                          <span className="capitalize">{app.status}</span>
                          <ChevronRight size={14} className="text-gray-400 dark:text-gray-500 group-hover:text-[#007aff] transition-colors" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-white dark:bg-[#1c1c1e] md:rounded-[32px] md:border border-neutral-200/50 dark:border-white/10 shadow-sm transform-gpu relative">
            <button onClick={() => setIsSidebarOpen(true)} className="md:hidden absolute top-4 left-4 text-gray-500 dark:text-gray-400"><Menu size={24} /></button>
            <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4"><Server size={28} /></div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Docker Manager</h2>
            <p className="text-gray-500 dark:text-gray-400 font-medium">Select or create a project to manage deployments.</p>
          </div>
        )}
      </div>

      {/* Project create modal (replaces window.prompt) */}
      {showProjectModal && (
        <div className="fixed inset-0 z-[120] bg-black/20 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1c1c1e] rounded-[20px] shadow-2xl w-full max-w-sm border border-neutral-200/50 dark:border-white/10 p-6">
            <h3 className="font-bold text-lg text-gray-900 dark:text-white mb-4">New Project</h3>
            <input autoFocus value={projectName} onChange={(e) => setProjectName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createProject()} placeholder="e.g. production" className={ec} />
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowProjectModal(false)} className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 border border-neutral-200 dark:border-white/10 rounded-[10px] hover:bg-neutral-50 dark:hover:bg-white/10">Cancel</button>
              <button onClick={createProject} disabled={!projectName.trim()} className="px-4 py-2 text-sm font-bold text-white bg-[#007aff] hover:bg-[#0062cc] rounded-[10px] disabled:opacity-50">Create</button>
            </div>
          </div>
        </div>
      )}

      {/* App Store */}
      {showStore && (
        <div className="fixed inset-0 z-[120] bg-black/20 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1c1c1e] rounded-[24px] shadow-2xl w-full max-w-3xl border border-neutral-200/50 dark:border-white/10 flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-neutral-100 dark:border-white/10 flex justify-between items-center">
              <h3 className="font-bold text-xl text-gray-900 dark:text-white flex items-center"><Store size={20} className="mr-2 text-indigo-500" /> App Store</h3>
              <button onClick={() => setShowStore(false)} className="p-1.5 bg-gray-100 dark:bg-white/10 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/20"><X size={16} /></button>
            </div>
            <div className="p-6 overflow-y-auto bg-gray-50 dark:bg-[#161618] flex-1">
              {!storeSel ? (
                catalog.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 flex items-center justify-center"><RefreshCw size={16} className="mr-2 animate-spin" /> Loading catalog…</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {catalog.map((e) => (
                      <button key={e.id} onClick={() => { setStoreSel(e); setStoreForm({ name: e.id, domains: '' }); }} className="text-left bg-white dark:bg-[#1f1f22] rounded-[16px] border border-neutral-200/60 dark:border-white/10 p-4 hover:border-indigo-400/50 hover:shadow-md transition group">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-3xl">{e.icon}</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-white/10 rounded-full px-2 py-0.5">{e.category}</span>
                        </div>
                        <h4 className="font-bold text-gray-900 dark:text-white group-hover:text-indigo-600 transition">{e.name}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">{e.description}</p>
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="max-w-lg mx-auto">
                  <button onClick={() => setStoreSel(null)} className="text-xs font-medium text-gray-400 hover:text-indigo-500 mb-4">← Back to catalog</button>
                  <div className="bg-white dark:bg-[#1f1f22] rounded-[16px] border border-neutral-200 dark:border-white/10 p-6 shadow-sm">
                    <div className="flex items-center gap-3 mb-4"><span className="text-4xl">{storeSel.icon}</span><div><h4 className="font-bold text-lg text-gray-900 dark:text-white">{storeSel.name}</h4><p className="text-xs text-gray-500 dark:text-gray-400">{storeSel.description}</p></div></div>
                    <div className="space-y-4">
                      <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Resource Name</label><input value={storeForm.name} onChange={(e) => setStoreForm({ ...storeForm, name: e.target.value })} className={ec} /></div>
                      {storeSel.needsDomain && (
                        <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Domain</label><input value={storeForm.domains} onChange={(e) => setStoreForm({ ...storeForm, domains: e.target.value })} placeholder="app.mydomain.com" className={ec} /><p className="text-[10px] text-gray-400 mt-1.5">Required — Traefik routes this domain to the app (HTTPS auto when ACME_EMAIL is set). Secrets are generated securely on the server.</p></div>
                      )}
                    </div>
                    <button onClick={installFromCatalog} disabled={installing} className="w-full mt-5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-[12px] shadow-sm flex items-center justify-center disabled:opacity-50">{installing ? <RefreshCw size={16} className="mr-2 animate-spin" /> : <Play size={16} className="mr-2 fill-current" />} Install & Deploy</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add resource wizard */}
      {showWizard && (
        <div className="fixed inset-0 z-50 bg-black/20 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1c1c1e] rounded-[24px] shadow-2xl w-full max-w-2xl border border-neutral-200/50 dark:border-white/10 flex flex-col max-h-[90vh]">
            <div className="px-6 py-5 border-b border-neutral-100 dark:border-white/10 flex justify-between items-center rounded-t-[24px]">
              <h3 className="font-bold text-xl text-gray-900 dark:text-white">Add New Resource</h3>
              <button onClick={() => setShowWizard(false)} className="p-1.5 bg-gray-100 dark:bg-white/10 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-white/20"><X size={16} /></button>
            </div>
            <div className="p-6 overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-[#161618] rounded-b-[24px]">
              <div className="bg-white dark:bg-[#1f1f22] p-5 rounded-[16px] border border-neutral-200 dark:border-white/10 mb-5 shadow-sm">
                <div className="mb-4">
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Resource Name</label>
                  <input type="text" placeholder="my-frontend-app" value={newApp.name} onChange={(e) => setNewApp({ ...newApp, name: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Source Type</label>
                  <select value={newApp.build_pack} onChange={(e) => setNewApp({ ...newApp, build_pack: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none appearance-none cursor-pointer">
                    <option value="dockerimage">Docker Image (Public Registry)</option>
                    <option value="github">GitHub / Git Repository (Nixpacks)</option>
                    <option value="database">Database (One-Click Setup)</option>
                    <option value="template">1-Click App Templates</option>
                    <option value="dockercompose">Docker Compose (Raw Text)</option>
                  </select>
                </div>
              </div>

              <div className="bg-white dark:bg-[#1f1f22] p-5 rounded-[16px] border border-neutral-200 dark:border-white/10 mb-5 shadow-sm">
                {newApp.build_pack === 'github' && (
                  <div className="grid grid-cols-4 gap-4 mb-5">
                    <div className="col-span-3"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Git Repository URL</label><input type="text" placeholder="https://github.com/expressjs/express.git" value={newApp.git_repo} onChange={(e) => setNewApp({ ...newApp, git_repo: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Branch</label><input type="text" placeholder="main" value={newApp.git_branch} onChange={(e) => setNewApp({ ...newApp, git_branch: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none" /></div>
                  </div>
                )}
                {newApp.build_pack === 'template' && (
                  <div className="mb-5">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Select Application</label>
                    <select onChange={(e) => {
                      const tpl = e.target.value;
                      const pwd = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? Array.from(crypto.getRandomValues(new Uint8Array(12))).map((b) => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(36).slice(2);
                      let compose = '';
                      if (tpl === 'wordpress') compose = `services:\n  wordpress:\n    image: wordpress:latest\n    environment:\n      WORDPRESS_DB_HOST: db\n      WORDPRESS_DB_USER: wp\n      WORDPRESS_DB_PASSWORD: ${pwd}\n      WORDPRESS_DB_NAME: wp\n    labels:\n      - "traefik.enable=true"\n      - "traefik.http.routers.{{APP_ID}}.rule=Host(\`{{DOMAIN}}\`)"\n    networks: [openfinder-proxy, internal]\n  db:\n    image: mysql:8.0\n    environment:\n      MYSQL_DATABASE: wp\n      MYSQL_USER: wp\n      MYSQL_PASSWORD: ${pwd}\n      MYSQL_RANDOM_ROOT_PASSWORD: '1'\n    volumes: [db_data:/var/lib/mysql]\n    networks: [internal]\nvolumes:\n  db_data:\nnetworks:\n  openfinder-proxy:\n    external: true\n  internal:`;
                      else if (tpl === 'ghost') compose = `services:\n  ghost:\n    image: ghost:5-alpine\n    environment:\n      database__client: mysql\n      database__connection__host: db\n      database__connection__user: ghost\n      database__connection__password: ${pwd}\n      database__connection__database: ghost\n      url: http://{{DOMAIN}}\n    labels:\n      - "traefik.enable=true"\n      - "traefik.http.routers.{{APP_ID}}.rule=Host(\`{{DOMAIN}}\`)"\n    volumes: [ghost_data:/var/lib/ghost/content]\n    networks: [openfinder-proxy, internal]\n  db:\n    image: mysql:8.0\n    environment:\n      MYSQL_DATABASE: ghost\n      MYSQL_USER: ghost\n      MYSQL_PASSWORD: ${pwd}\n      MYSQL_RANDOM_ROOT_PASSWORD: '1'\n    volumes: [db_data:/var/lib/mysql]\n    networks: [internal]\nvolumes:\n  ghost_data:\n  db_data:\nnetworks:\n  openfinder-proxy:\n    external: true\n  internal:`;
                      else if (tpl === 'plausible') compose = `services:\n  plausible:\n    image: plausible/analytics:latest\n    environment:\n      BASE_URL: http://{{DOMAIN}}\n      SECRET_KEY_BASE: ${pwd}${pwd}\n    labels:\n      - "traefik.enable=true"\n      - "traefik.http.routers.{{APP_ID}}.rule=Host(\`{{DOMAIN}}\`)"\n    networks: [openfinder-proxy]\nnetworks:\n  openfinder-proxy:\n    external: true`;
                      setNewApp({ ...newApp, build_pack: 'dockercompose', compose_content: compose });
                    }} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] appearance-none cursor-pointer" defaultValue="">
                      <option value="" disabled>Choose an application…</option>
                      <option value="wordpress">WordPress (with MySQL)</option>
                      <option value="ghost">Ghost CMS (with MySQL)</option>
                      <option value="plausible">Plausible Analytics</option>
                    </select>
                    <p className="text-[10px] font-medium text-gray-400 mt-2">Generates a Compose stack with secure credentials and switches to Compose view.</p>
                  </div>
                )}
                {newApp.build_pack === 'database' && (
                  <div className="mb-5">
                    <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Select Database Engine</label>
                    <select onChange={(e) => {
                      const db = e.target.value;
                      const vol = `openfinder-vol-${Date.now()}`;
                      const pwd = (typeof crypto !== 'undefined' && crypto.getRandomValues) ? Array.from(crypto.getRandomValues(new Uint8Array(9))).map((b) => b.toString(16).padStart(2, '0')).join('') : Math.random().toString(36).slice(2);
                      if (db === 'postgres') setNewApp({ ...newApp, docker_image: 'postgres', docker_image_tag: '15', env_vars: `POSTGRES_USER=admin\nPOSTGRES_PASSWORD=${pwd}`, volumes: `${vol}:/var/lib/postgresql/data`, ports: '5432:5432' });
                      if (db === 'mysql') setNewApp({ ...newApp, docker_image: 'mysql', docker_image_tag: '8', env_vars: `MYSQL_ROOT_PASSWORD=${pwd}\nMYSQL_DATABASE=db`, volumes: `${vol}:/var/lib/mysql`, ports: '3306:3306' });
                      if (db === 'redis') setNewApp({ ...newApp, docker_image: 'redis', docker_image_tag: '7', env_vars: '', volumes: `${vol}:/data`, ports: '6379:6379' });
                      if (db === 'mongo') setNewApp({ ...newApp, docker_image: 'mongo', docker_image_tag: '6', env_vars: `MONGO_INITDB_ROOT_USERNAME=admin\nMONGO_INITDB_ROOT_PASSWORD=${pwd}`, volumes: `${vol}:/data/db`, ports: '27017:27017' });
                    }} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] appearance-none cursor-pointer" defaultValue="">
                      <option value="" disabled>Choose an engine…</option>
                      <option value="postgres">PostgreSQL 15</option>
                      <option value="mysql">MySQL 8</option>
                      <option value="redis">Redis 7</option>
                      <option value="mongo">MongoDB 6</option>
                    </select>
                    <p className="text-[10px] font-medium text-gray-400 mt-2">Generates strong random credentials and a persistent volume.</p>
                  </div>
                )}
                {newApp.build_pack === 'dockerimage' && (
                  <div className="grid grid-cols-4 gap-4 mb-5">
                    <div className="col-span-3"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Image Name</label><input type="text" placeholder="nginx, redis, postgres" value={newApp.docker_image} onChange={(e) => setNewApp({ ...newApp, docker_image: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none" /></div>
                    <div className="col-span-1"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Tag</label><input type="text" placeholder="latest" value={newApp.docker_image_tag} onChange={(e) => setNewApp({ ...newApp, docker_image_tag: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none" /></div>
                  </div>
                )}
                {newApp.build_pack === 'dockercompose' && (
                  <div className="mb-5"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">docker-compose.yml content</label><textarea value={newApp.compose_content} onChange={(e) => setNewApp({ ...newApp, compose_content: e.target.value })} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white font-mono h-40 focus:border-[#007aff] focus:outline-none" placeholder="services:\n  web:\n    image: nginx" /></div>
                )}

                <div className="mb-4"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Domains (Automatic Proxy)</label><input type="text" placeholder="app.mydomain.com, api.local" value={newApp.domains} onChange={(e) => setNewApp({ ...newApp, domains: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none" /><p className="text-[10px] font-medium text-gray-400 mt-1.5">Comma-separated. Traefik routes these to the container (HTTPS auto when ACME_EMAIL is set).</p></div>
                <div className="mb-4"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Port Mapping</label><input type="text" placeholder="8080:80, 5353:53/udp" value={newApp.ports} onChange={(e) => setNewApp({ ...newApp, ports: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none" /><p className="text-[10px] font-medium text-gray-400 mt-1.5">host:container[/proto], comma-separated.</p></div>
                <div className="mb-4"><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Persistent Volumes</label><input type="text" placeholder="my-volume:/var/lib/data" value={newApp.volumes} onChange={(e) => setNewApp({ ...newApp, volumes: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none" /><p className="text-[10px] font-medium text-gray-400 mt-1.5">source:/container/path[:ro], comma-separated.</p></div>
                <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Environment Variables</label><textarea placeholder="NODE_ENV=production&#10;DB_PASSWORD=secret" value={newApp.env_vars} onChange={(e) => setNewApp({ ...newApp, env_vars: e.target.value })} className="w-full bg-neutral-50 border border-neutral-200 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white font-mono h-24 focus:border-[#007aff] focus:outline-none" /><p className="text-[10px] font-medium text-gray-400 mt-1.5">One KEY=VALUE per line.</p></div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">CPU Limit (cores)</label><input type="text" placeholder="e.g. 0.5" value={newApp.cpu_limit} onChange={(e) => setNewApp({ ...newApp, cpu_limit: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none" /></div>
                  <div><label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Memory Limit</label><input type="text" placeholder="e.g. 512m, 1g" value={newApp.mem_limit} onChange={(e) => setNewApp({ ...newApp, mem_limit: e.target.value })} className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-[10px] p-3 text-sm text-gray-900 dark:text-white focus:border-[#007aff] focus:outline-none" /></div>
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6">
                <button onClick={() => setShowWizard(false)} className="px-5 py-2.5 bg-white border border-neutral-200 hover:bg-neutral-50 text-gray-700 font-bold rounded-[12px] shadow-sm">Cancel</button>
                <button onClick={createAndDeploy} disabled={!newApp.name || ((newApp.build_pack === 'dockerimage' || newApp.build_pack === 'database') && !newApp.docker_image) || (newApp.build_pack === 'dockercompose' && !newApp.compose_content) || (newApp.build_pack === 'github' && !newApp.git_repo)} className="px-6 py-2.5 bg-[#007aff] hover:bg-[#0062cc] disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-[12px] shadow-sm flex items-center"><Play size={16} className="mr-2 fill-current" /> Save & Deploy</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
