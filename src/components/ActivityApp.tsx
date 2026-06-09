import React, { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Wifi, Monitor, Zap } from 'lucide-react';

interface ActivityAppProps {
  onClose?: () => void;
}

interface HistoryPoint {
  cpu: number;
  memory: number;
  time: string;
}

export default function ActivityApp({ onClose }: ActivityAppProps) {
  const [activeTab, setActiveTab] = useState('cpu');
  const [stats, setStats] = useState<any>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system/stats');
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
        console.error('Failed to fetch stats', e);
      }
    };
    
    fetchStats();
    const timer = setInterval(fetchStats, 2000);
    return () => clearInterval(timer);
  }, []);

  const tabs = [
    { id: 'cpu', label: 'CPU', icon: Cpu },
    { id: 'memory', label: 'Memory', icon: Activity },
    { id: 'disk', label: 'Disk', icon: HardDrive },
    { id: 'network', label: 'Network', icon: Wifi },
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
      <div className="w-full h-64 bg-black/20 rounded-2xl p-4 relative border border-white/5 overflow-hidden">
        {/* Y-axis labels */}
        <div className="absolute left-4 top-4 bottom-4 flex flex-col justify-between text-[10px] text-white/30 z-10">
          <span>100%</span>
          <span>50%</span>
          <span>0%</span>
        </div>
        
        {/* Grid lines */}
        <div className="absolute inset-4 flex flex-col justify-between z-0 pointer-events-none">
          <div className="w-full h-px bg-white/5"></div>
          <div className="w-full h-px bg-white/5"></div>
          <div className="w-full h-px bg-white/5"></div>
        </div>

        <svg className="w-full h-full absolute inset-0 preserve-3d px-12 py-4" viewBox="0 0 100 100" preserveAspectRatio="none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4" />
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
    <div className="h-full w-full flex select-none overflow-hidden bg-[#1c1c1e] text-white font-sans" onContextMenu={(e) => e.preventDefault()}>
      
      {/* Sidebar */}
      <div className="flex flex-col bg-[#2c2c2e]/50 border-r border-white/5 w-[240px] md:w-[250px] flex-shrink-0 pt-4">
        <div className="flex items-center space-x-2 px-5 mb-8">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all" title="Close" onClick={() => { if (onClose) onClose(); else window.location.href = '/dashboard'; }} />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all" title="Minimize" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all" title="Zoom" />
        </div>

        <div className="px-3 mb-2 text-xs font-bold text-white/30 tracking-wider">ANALYTICS</div>
        <div className="flex flex-col px-2 space-y-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all text-sm font-medium ${
                activeTab === tab.id 
                  ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' 
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <tab.icon size={18} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative overflow-hidden bg-[#1c1c1e]">
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#2c2c2e]/20 to-transparent pointer-events-none z-10" />
        
        <div className="flex-1 overflow-y-auto p-10 z-0">
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl font-semibold tracking-tight text-white/90">
              {tabs.find(t => t.id === activeTab)?.label} Analytics
            </h1>
            <div className="flex items-center space-x-2 text-xs font-medium text-white/40 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Live Updates</span>
            </div>
          </div>
          
          {/* CPU TAB */}
          {activeTab === 'cpu' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {renderLineChart('cpu', '#3b82f6', 'cpuGradient')}
              
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                  <span className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-1">Model</span>
                  <span className="text-white text-sm font-semibold truncate block">{stats?.cpu?.model || 'Loading...'}</span>
                </div>
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                  <span className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-1">Utilization</span>
                  <span className="text-white text-xl font-bold">{stats?.cpu?.usagePercent?.toFixed(1) || '0.0'}%</span>
                </div>
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                  <span className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-1">Logical Cores</span>
                  <span className="text-white text-xl font-bold">{stats?.cpu?.cores || 0}</span>
                </div>
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5">
                  <span className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-1">Physical Cores</span>
                  <span className="text-white text-xl font-bold">{stats ? Math.max(1, Math.round(stats.cpu.cores / 2)) : 0}</span>
                </div>
                <div className="bg-white/5 rounded-2xl p-5 border border-white/5 col-span-2">
                  <span className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-1">System Load (1m, 5m, 15m)</span>
                  <span className="text-white text-xl font-bold">{stats?.cpu?.load?.toFixed(2) || '0.00'}</span>
                </div>
              </div>
            </div>
          )}

          {/* MEMORY TAB */}
          {activeTab === 'memory' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {renderLineChart('memory', '#8b5cf6', 'memGradient')}

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-2xl p-6 border border-white/5 flex flex-col justify-center">
                  <span className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-2">Memory Usage</span>
                  <div className="flex items-end space-x-2">
                    <span className="text-white text-4xl font-bold">{stats ? (stats.memory.used / 1024 / 1024 / 1024).toFixed(1) : '0'}</span>
                    <span className="text-white/50 text-sm mb-1 font-semibold">GB / {stats ? (stats.memory.total / 1024 / 1024 / 1024).toFixed(1) : '0'} GB</span>
                  </div>
                  <div className="w-full h-2 bg-black/50 rounded-full mt-4 overflow-hidden">
                    <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${stats ? (stats.memory.used/stats.memory.total)*100 : 0}%` }}></div>
                  </div>
                </div>
                
                <div className="bg-white/5 rounded-2xl p-6 border border-white/5 flex flex-col justify-center">
                  <span className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-2">Memory Free</span>
                  <div className="flex items-end space-x-2">
                    <span className="text-white text-4xl font-bold text-emerald-400">{stats ? (stats.memory.free / 1024 / 1024 / 1024).toFixed(1) : '0'}</span>
                    <span className="text-white/50 text-sm mb-1 font-semibold">GB Available</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DISK TAB */}
          {activeTab === 'disk' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white/5 rounded-3xl p-8 border border-white/5 flex flex-col items-center justify-center py-16">
                <div className="w-32 h-32 relative mb-6">
                  <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="rgba(255,255,255,0.1)" strokeWidth="12" />
                    <circle 
                      cx="50" cy="50" r="40" fill="transparent" stroke="#10b981" strokeWidth="12" 
                      strokeDasharray={`${stats ? ((stats.disk.total - stats.disk.free) / stats.disk.total) * 251.2 : 0} 251.2`} 
                      className="transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-white">
                    <span className="text-2xl font-bold">{stats ? (((stats.disk.total - stats.disk.free)/stats.disk.total)*100).toFixed(0) : '0'}%</span>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-12 w-full max-w-md text-center">
                  <div>
                    <span className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-1">Used Space</span>
                    <span className="text-white text-2xl font-bold">{stats ? ((stats.disk.total - stats.disk.free) / 1024 / 1024 / 1024).toFixed(1) : '0'} GB</span>
                  </div>
                  <div>
                    <span className="text-white/40 text-xs font-medium uppercase tracking-wider block mb-1">Free Space</span>
                    <span className="text-emerald-400 text-2xl font-bold">{stats ? (stats.disk.free / 1024 / 1024 / 1024).toFixed(1) : '0'} GB</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* NETWORK TAB */}
          {activeTab === 'network' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {!stats?.network && (
                <div className="text-center text-white/40 py-12">Loading network interfaces...</div>
              )}
              {stats?.network && Object.keys(stats.network).map((ifaceName) => {
                const addrs = stats.network[ifaceName];
                const ipv4 = addrs.find((a: any) => a.family === 'IPv4');
                if (!ipv4) return null;
                const isLoopback = ipv4.internal;
                return (
                  <div key={ifaceName} className={`p-6 rounded-2xl border border-white/5 bg-white/5 flex flex-col md:flex-row md:items-center justify-between ${isLoopback ? 'opacity-50' : ''}`}>
                    <div className="flex items-center space-x-4 mb-4 md:mb-0">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isLoopback ? 'bg-white/10 text-white/50' : 'bg-blue-500/20 text-blue-400'}`}>
                        <Wifi size={24} />
                      </div>
                      <div>
                        <h4 className="font-semibold text-white text-lg">{ifaceName}</h4>
                        <p className="text-sm text-white/50">{isLoopback ? 'Loopback Interface' : 'Active Connection'}</p>
                      </div>
                    </div>
                    <div className="flex flex-col md:items-end space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-white/40 text-xs uppercase">IPv4</span>
                        <span className="text-white font-mono bg-black/30 px-2 py-0.5 rounded border border-white/5">{ipv4.address}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-white/40 text-xs uppercase">MAC</span>
                        <span className="text-white/70 font-mono text-sm">{ipv4.mac || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
