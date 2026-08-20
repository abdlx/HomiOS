import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Wifi, Monitor, Zap, Menu, ListChecks, Pause, Play, RotateCcw, XCircle } from 'lucide-react';
import { usePerformanceSettings } from '../hooks/usePerformanceSettings';
import { Job } from '../types';

interface ActivityAppProps {
  onClose?: () => void;
  isActive?: boolean;
}

interface HistoryPoint {
  cpu: number;
  memory: number;
  time: string;
}

export default function ActivityApp({ onClose, isActive = true }: ActivityAppProps) {
  const [activeTab, setActiveTab] = useState('cpu');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dependencies, setDependencies] = useState<any>(null);
  const [terminalSessions, setTerminalSessions] = useState<any[]>([]);
  const { settings: performanceSettings } = usePerformanceSettings();

  useEffect(() => {
    if (!isActive) return;

    const intervalByMode = {
      live: 2000,
      balanced: 4000,
      quiet: 10000,
    } as const;
    let controller: AbortController | null = null;

    const fetchStats = async () => {
      if (document.visibilityState === 'hidden') return;
      controller?.abort();
      controller = new AbortController();

      try {
        const res = await fetch('/api/system/stats', { signal: controller.signal });
        if (res.ok) {
          const data = await res.json();
          setStats(data);

          setHistory(prev => {
            const newHistory = [...prev, {
              cpu: data.cpu?.usagePercent || 0,
              memory: data.memory ? (data.memory.used / data.memory.total) * 100 : 0,
              time: new Date().toLocaleTimeString()
            }];
            return newHistory.slice(-40); // Keep last 40 points
          });
        }
      } catch (e) {
        if ((e as any)?.name !== 'AbortError') console.error('Failed to fetch stats', e);
      }
    };

    fetchStats();
    const timer = setInterval(fetchStats, intervalByMode[performanceSettings.backgroundPolling]);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchStats();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      controller?.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isActive, performanceSettings.backgroundPolling]);

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    const fetchJobs = async () => {
      try {
        const [jobsRes, depsRes] = await Promise.all([
          fetch('/api/jobs?limit=30'),
          fetch('/api/system/dependencies'),
        ]);
        if (!cancelled && jobsRes.ok) setJobs(await jobsRes.json());
        if (!cancelled && depsRes.ok) setDependencies(await depsRes.json());
        const terminalsRes = await fetch('/api/system/terminal-sessions');
        if (!cancelled && terminalsRes.ok) setTerminalSessions(await terminalsRes.json());
      } catch (e) {
        if (!cancelled) console.error('Failed to fetch jobs', e);
      }
    };
    fetchJobs();
    const timer = setInterval(fetchJobs, activeTab === 'jobs' ? 2500 : 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isActive, activeTab]);

  const updateJob = async (id: string, action: 'pause' | 'resume' | 'cancel' | 'retry') => {
    await fetch(`/api/jobs/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const res = await fetch('/api/jobs?limit=30');
    if (res.ok) setJobs(await res.json());
  };

  const tabs = [
    { id: 'cpu', label: 'CPU', icon: Cpu },
    { id: 'memory', label: 'Memory', icon: Activity },
    { id: 'disk', label: 'Disk', icon: HardDrive },
    { id: 'network', label: 'Network', icon: Wifi },
    { id: 'jobs', label: 'Tasks', icon: ListChecks },
  ];

  const renderLineChart = (dataKey: 'cpu' | 'memory', color: string, gradientId: string) => {
    const points = history.map((point, i) => {
      const x = (i / 39) * 100;
      const y = 100 - point[dataKey];
      return `${x},${y}`;
    }).join(' ');

    const pathD = points.length > 0 ? `M ${points.replace(/ /g, ' L ')}` : '';
    const fillPathD = pathD ? `${pathD} L 100,100 L 0,100 Z` : '';

    return (
      <div className="w-full h-64 bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-4 relative border border-neutral-200/50 dark:border-white/10 overflow-hidden">
        {/* Y-axis labels */}
        <div className="absolute left-4 top-4 bottom-4 flex flex-col justify-between text-[10px] text-slate-400 dark:text-slate-500 z-10">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>

        {/* Grid lines */}
        <div className="absolute inset-4 flex flex-col justify-between z-0 pointer-events-none">
          <div className="w-full h-px bg-slate-100 dark:bg-white/10"></div>
          <div className="w-full h-px bg-slate-100 dark:bg-white/10"></div>
          <div className="w-full h-px bg-slate-100 dark:bg-white/10"></div>
        </div>

        <svg className="w-full h-full absolute inset-0 preserve-3d px-12 py-4" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          {fillPathD && (
            <path d={fillPathD} fill={`url(#${gradientId})`} className="transition-all duration-300" />
          )}
          {pathD && (
            <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="transition-all duration-300" />
          )}
        </svg>
      </div>
    );
  };

  return (
    <div className="h-full w-full flex select-none overflow-hidden bg-gray-50 dark:bg-[#161618] font-sans text-slate-800 dark:text-slate-200 relative transition-colors duration-300" onContextMenu={(e) => e.preventDefault()}>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 absolute md:static z-50 h-full md:h-auto transition-transform duration-300 ease-in-out flex flex-col bg-white dark:bg-[#1f1f22] border-r border-neutral-200/50 dark:border-white/10 w-[240px] md:w-[250px] shadow-2xl md:shadow-[0_8px_30px_rgb(0,0,0,0.04)] md:m-3 md:rounded-[32px] p-4 pt-5 flex-shrink-0`}>
        <div className="flex items-center space-x-2 mb-8 px-1">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all" title="Close" onClick={() => { if (onClose) onClose(); else window.location.href = '/dashboard'; }} />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all" title="Minimize" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all" title="Zoom" />
        </div>

        <div className="flex flex-col space-y-1 overflow-y-auto pb-4">
          <span className="px-3 text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 mt-2 tracking-wider">ANALYTICS</span>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
              className={`flex items-center space-x-3 px-3 py-2 rounded-xl transition-all text-sm font-medium ${activeTab === tab.id
                  ? 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:bg-white/10 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                }`}
            >
              <tab.icon size={18} strokeWidth={2} className={activeTab === tab.id ? 'text-blue-500 dark:text-blue-300' : 'text-slate-400 dark:text-slate-500'} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-[#161618] overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-gray-50 dark:from-[#161618] to-transparent pointer-events-none z-10" />

        <div className="flex-1 overflow-y-auto pt-6 md:pt-10 px-6 md:px-12 pb-24 z-0">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <button className="md:hidden text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white transition" onClick={() => setIsSidebarOpen(true)}>
                <Menu size={24} />
              </button>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-800 dark:text-white m-0">
                {tabs.find(t => t.id === activeTab)?.label} Analytics
              </h1>
            </div>
            <div className="flex items-center space-x-2 text-[10px] md:text-xs font-medium text-slate-500 dark:text-slate-400 bg-white dark:bg-[#1f1f22] px-2 py-1 md:px-3 md:py-1.5 rounded-lg border border-neutral-200/50 dark:border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Live Updates</span>
            </div>
          </div>

          {/* CPU TAB */}
          {activeTab === 'cpu' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {renderLineChart('cpu', '#3b82f6', 'cpuGradient')}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-5 border border-neutral-200/50 dark:border-white/10">
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-medium uppercase tracking-wider block mb-1">Model</span>
                  <span className="text-slate-800 dark:text-white text-sm font-semibold truncate block">{stats?.cpu?.model || 'Loading...'}</span>
                </div>
                <div className="bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-5 border border-neutral-200/50 dark:border-white/10">
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-medium uppercase tracking-wider block mb-1">Utilization</span>
                  <span className="text-slate-800 dark:text-white text-xl font-bold">{stats?.cpu?.usagePercent?.toFixed(1) || '0.0'}%</span>
                </div>
                <div className="bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-5 border border-neutral-200/50 dark:border-white/10">
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-medium uppercase tracking-wider block mb-1">Logical Cores</span>
                  <span className="text-slate-800 dark:text-white text-xl font-bold">{stats?.cpu?.cores || 0}</span>
                </div>
                <div className="bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-5 border border-neutral-200/50 dark:border-white/10">
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-medium uppercase tracking-wider block mb-1">Physical Cores</span>
                  <span className="text-slate-800 dark:text-white text-xl font-bold">{stats ? Math.max(1, Math.round(stats.cpu.cores / 2)) : 0}</span>
                </div>
                <div className="bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-5 border border-neutral-200/50 dark:border-white/10 md:col-span-2">
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-medium uppercase tracking-wider block mb-1">System Load (1m, 5m, 15m)</span>
                  <span className="text-slate-800 dark:text-white text-xl font-bold">{stats?.cpu?.load?.toFixed(2) || '0.00'}</span>
                </div>
              </div>
            </div>
          )}

          {/* MEMORY TAB */}
          {activeTab === 'memory' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {renderLineChart('memory', '#8b5cf6', 'memGradient')}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 border border-neutral-200/50 dark:border-white/10 flex flex-col justify-center">
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-medium uppercase tracking-wider block mb-2">Memory Usage</span>
                  <div className="flex items-end space-x-2">
                    <span className="text-slate-800 dark:text-white text-4xl font-bold">{stats ? (stats.memory.used / 1024 / 1024 / 1024).toFixed(1) : '0'}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-sm mb-1 font-semibold">GB / {stats ? (stats.memory.total / 1024 / 1024 / 1024).toFixed(1) : '0'} GB</span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-white/10 rounded-full mt-4 overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${stats ? (stats.memory.used / stats.memory.total) * 100 : 0}%` }}></div>
                  </div>
                </div>

                <div className="bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-2xl p-6 border border-neutral-200/50 dark:border-white/10 flex flex-col justify-center">
                  <span className="text-slate-400 dark:text-slate-500 text-xs font-medium uppercase tracking-wider block mb-2">Memory Free</span>
                  <div className="flex items-end space-x-2">
                    <span className="text-emerald-500 text-4xl font-bold">{stats ? (stats.memory.free / 1024 / 1024 / 1024).toFixed(1) : '0'}</span>
                    <span className="text-slate-500 dark:text-slate-400 text-sm mb-1 font-semibold">GB Available</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DISK TAB */}
          {activeTab === 'disk' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.04)] rounded-3xl p-8 border border-neutral-200/50 dark:border-white/10 flex flex-col items-center justify-center py-16">
                <div className="w-32 h-32 relative mb-6">
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#f1f5f9" strokeWidth="12" />
                    <circle
                      cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="12"
                      strokeDasharray={`${stats ? ((stats.disk.total - stats.disk.free) / stats.disk.total) * 251.2 : 0} 251.2`}
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-800">
                    <span className="text-2xl font-bold">{stats ? (((stats.disk.total - stats.disk.free) / stats.disk.total) * 100).toFixed(0) : '0'}%</span>
                  </div>
                </div>

                <div className="flex flex-col md:flex-row justify-center items-center gap-6 md:gap-12 w-full max-w-md text-center">
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-medium uppercase tracking-wider block mb-1">Used Space</span>
                    <span className="text-slate-800 dark:text-white text-2xl font-bold">{stats ? ((stats.disk.total - stats.disk.free) / 1024 / 1024 / 1024).toFixed(1) : '0'} GB</span>
                  </div>
                  <div>
                    <span className="text-slate-400 dark:text-slate-500 text-xs font-medium uppercase tracking-wider block mb-1">Free Space</span>
                    <span className="text-emerald-500 text-2xl font-bold">{stats ? (stats.disk.free / 1024 / 1024 / 1024).toFixed(1) : '0'} GB</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* NETWORK TAB */}
          {activeTab === 'network' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {!stats?.network && (
                <div className="text-center text-slate-400 dark:text-slate-500 py-12">Loading network interfaces...</div>
              )}
              {stats?.network && Object.keys(stats.network).map((ifaceName) => {
                const addrs = stats.network[ifaceName];
                const ipv4 = addrs.find((a: any) => a.family === 'IPv4');
                if (!ipv4) return null;
                const isLoopback = ipv4.internal;
                return (
                  <div key={ifaceName} className={`p-6 rounded-2xl border border-neutral-200/50 dark:border-white/10 bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col md:flex-row md:items-center justify-between ${isLoopback ? 'opacity-50' : ''}`}>
                    <div className="flex items-center space-x-4 mb-4 md:mb-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isLoopback ? 'bg-slate-100 dark:bg-white/10 text-slate-400 dark:text-slate-500' : 'bg-blue-50 dark:bg-blue-500/15 text-blue-500'}`}>
                        <Wifi size={24} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-slate-800 dark:text-white text-lg">{ifaceName}</h4>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{isLoopback ? 'Loopback Interface' : 'Active Connection'}</p>
                      </div>
                    </div>
                    <div className="flex flex-col md:items-end space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400 dark:text-slate-500 text-xs uppercase">IPv4</span>
                        <span className="text-slate-700 dark:text-slate-200 font-mono bg-slate-50 dark:bg-white/5 px-2 py-0.5 rounded border border-neutral-200/50 dark:border-white/10">{ipv4.address}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-slate-400 dark:text-slate-500 text-xs uppercase">MAC</span>
                        <span className="text-slate-500 dark:text-slate-400 font-mono text-sm">{ipv4.mac || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'jobs' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
                {[
                  ['Sharp', dependencies?.sharp],
                  ['FFmpeg', dependencies?.ffmpeg],
                  ['Tesseract', dependencies?.tesseract],
                  ['PDF Text', dependencies?.poppler],
                ].map(([label, ok]) => (
                  <div key={label as string} className="bg-white dark:bg-[#1f1f22] border border-neutral-200/50 dark:border-white/10 rounded-2xl p-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label as string}</p>
                    <p className={`mt-1 text-sm font-semibold ${ok ? 'text-emerald-500' : 'text-amber-500'}`}>{ok ? 'Available' : 'Missing'}</p>
                  </div>
                ))}
              </div>

              <div className="bg-white dark:bg-[#1f1f22] border border-neutral-200/50 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-neutral-200/50 dark:border-white/10 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-800 dark:text-white">Background Tasks</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Indexing, thumbnails, backups, restores, and OCR jobs</p>
                  </div>
                  <button
                    onClick={async () => {
                      await fetch('/api/index/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'files' }) });
                      const res = await fetch('/api/jobs?limit=30');
                      if (res.ok) setJobs(await res.json());
                    }}
                    className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600 transition"
                  >
                    Refresh Index
                  </button>
                </div>

                <div className="divide-y divide-neutral-100 dark:divide-white/10">
                  {jobs.map((job) => (
                    <div key={job.id} className="p-4 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 truncate">{job.name}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                            job.status === 'completed' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' :
                            job.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300' :
                            job.status === 'running' ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300' :
                            'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                          }`}>{job.status}</span>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{job.type} • {job.resourceClass}{job.error ? ` • ${job.error}` : ''}</p>
                        <div className="h-1.5 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden mt-2">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${job.progress || 0}%` }} />
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {job.status === 'queued' && <button onClick={() => updateJob(job.id, 'pause')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10" title="Pause"><Pause size={14} /></button>}
                        {job.status === 'paused' && <button onClick={() => updateJob(job.id, 'resume')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10" title="Resume"><Play size={14} /></button>}
                        {(job.status === 'queued' || job.status === 'paused') && <button onClick={() => updateJob(job.id, 'cancel')} className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500" title="Cancel"><XCircle size={14} /></button>}
                        {(job.status === 'failed' || job.status === 'cancelled') && <button onClick={() => updateJob(job.id, 'retry')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-white/10" title="Retry"><RotateCcw size={14} /></button>}
                      </div>
                    </div>
                  ))}
                  {jobs.length === 0 && (
                    <div className="p-8 text-center text-sm text-slate-400 dark:text-slate-500">No background tasks yet.</div>
                  )}
                </div>
              </div>

              <div className="bg-white dark:bg-[#1f1f22] border border-neutral-200/50 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-neutral-200/50 dark:border-white/10">
                  <h3 className="font-semibold text-slate-800 dark:text-white">Terminal Sessions</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">HomiOS-controlled terminal shells</p>
                </div>
                <div className="divide-y divide-neutral-100 dark:divide-white/10">
                  {terminalSessions.map((session) => (
                    <div key={session.id} className="p-4 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{session.shell}</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{session.id} • {new Date(session.startedAt).toLocaleString()}</p>
                      </div>
                      <button
                        onClick={async () => {
                          await fetch('/api/system/terminal-sessions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: session.id }) });
                          setTerminalSessions((sessions) => sessions.filter((item) => item.id !== session.id));
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-500/20"
                      >
                        Close
                      </button>
                    </div>
                  ))}
                  {terminalSessions.length === 0 && <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">No terminal sessions running.</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
