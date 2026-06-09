import React, { useState, useEffect } from 'react';
import { 
  Cloud, Search, Umbrella, Activity, Cpu, HardDrive, Thermometer, Database, MemoryStick, ChevronLeft, ChevronRight,
  Monitor, FolderOpen, Folder, Terminal, Globe, Calendar, Clock, Calculator, Mail, MessageSquare, Music, Video, Image as ImageIcon, Box,
  Download, Zap, Hash, Radio, Server, Triangle, Settings
} from 'lucide-react';

interface DesktopEnvironmentProps {
  onOpenFinder: () => void;
  username?: string;
}

export default function DesktopEnvironment({ onOpenFinder, username }: DesktopEnvironmentProps) {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        console.error('Failed to fetch stats', e);
      }
    };
    fetchStats();
    const timer = setInterval(fetchStats, 5000);
    return () => clearInterval(timer);
  }, []);
  
  const appsRow1 = [
    { id: 'files', label: 'Files', icon: Folder, color: 'bg-gradient-to-br from-blue-400 to-cyan-500', onClick: onOpenFinder },
  ];

  const appsRow2 = [] as any[];

  const dockApps = [
    { id: 'home', icon: Box, color: 'bg-gradient-to-br from-purple-500 to-indigo-600' },
    { id: 'mail', icon: Mail, color: 'bg-gradient-to-br from-blue-500 to-blue-700' },
    { id: 'calendar', icon: Calendar, color: 'bg-gradient-to-br from-orange-400 to-red-500' },
    { id: 'settings', icon: Settings, color: 'bg-gradient-to-br from-slate-500 to-slate-700' },
    { id: 'activity', icon: Activity, color: 'bg-gradient-to-br from-emerald-500 to-teal-700' },
    { id: 'finder', icon: FolderOpen, color: 'bg-gradient-to-br from-blue-400 to-cyan-500', onClick: onOpenFinder },
  ];

  return (
    <div 
      className="h-screen w-full flex flex-col bg-cover bg-center overflow-hidden font-sans relative text-white" 
      style={{ backgroundImage: 'url("https://images.unsplash.com/photo-1506744031586-b523e727fdd4?q=80&w=2070&auto=format&fit=crop")' }}
    >
      {/* Dark overlay for better text readability */}
      <div className="absolute inset-0 bg-black/20" />

      <div className="relative z-10 flex-1 flex flex-col items-center pt-12 px-8 overflow-y-auto">
        
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <h1 className="text-4xl font-bold tracking-tight text-white drop-shadow-sm">Good evening, {username || 'Chad'}.</h1>
        </div>

        {/* 3 Monitoring Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8 w-full max-w-[1000px]">
          
          {/* Card 1: CPU Usage */}
          <div className="flex flex-col items-center">
            <div className="w-full bg-[#1c1c1e]/80 backdrop-blur-xl rounded-[24px] p-6 shadow-2xl border border-white/5 h-[140px] flex flex-col justify-center">
              <span className="text-white/60 text-xs font-medium mb-2">CPU Utilization</span>
              <span className="text-[32px] font-bold mb-4 text-white leading-none">
                {stats?.cpu?.usagePercent?.toFixed(1) || '0.0'}%
              </span>
              <div className="w-full bg-white/10 rounded-full h-1.5 mt-2">
                <div 
                  className="bg-white/70 h-1.5 rounded-full transition-all duration-500" 
                  style={{ width: `${stats?.cpu?.usagePercent || 0}%` }}
                ></div>
              </div>
            </div>
            <span className="text-white/60 text-xs mt-3">{stats?.cpu?.model || 'Processor'}</span>
          </div>

          {/* Card 2: System Stats */}
          <div className="flex flex-col items-center">
            <div className="w-full bg-[#1c1c1e]/80 backdrop-blur-xl rounded-[24px] p-6 shadow-2xl border border-white/5 h-[140px] flex justify-between items-center px-8">
              <div className="flex flex-col items-center justify-center">
                <Thermometer size={18} className="text-white/50 mb-2" />
                <span className="text-white/60 text-[10px] uppercase font-bold mb-1">Load</span>
                <span className="text-white text-[13px] font-bold">{stats?.cpu?.load?.toFixed(2) || '0.00'}</span>
              </div>
              <div className="flex flex-col items-center justify-center">
                <HardDrive size={18} className="text-white/50 mb-2" />
                <span className="text-white/60 text-[10px] uppercase font-bold mb-1">Free</span>
                <span className="text-white text-[13px] font-bold">
                  {stats ? (stats.disk.free / 1024 / 1024 / 1024).toFixed(1) : '0'} GB
                </span>
              </div>
              <div className="flex flex-col items-center justify-center">
                <Cpu size={18} className="text-white/50 mb-2" />
                <span className="text-white/60 text-[10px] uppercase font-bold mb-1">Memory</span>
                <span className="text-white text-[13px] font-bold">
                  {stats ? (stats.memory.used / 1024 / 1024 / 1024).toFixed(1) : '0'} GB
                </span>
              </div>
            </div>
            <span className="text-white/60 text-xs mt-3">System Resources</span>
          </div>

          {/* Card 3: OS Info */}
          <div className="flex flex-col items-center">
            <div className="w-full bg-[#1c1c1e]/80 backdrop-blur-xl rounded-[24px] p-5 shadow-2xl border border-white/5 h-[140px] relative overflow-hidden">
              <div className="flex items-center space-x-2 mb-3">
                <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[6px] border-l-transparent border-r-transparent border-t-blue-500" />
                <span className="text-white/90 text-xs font-semibold">Environment</span>
              </div>
              <div className="space-y-1.5 relative z-10 ml-2">
                <div className="flex items-center space-x-2 opacity-80">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="text-[10px] uppercase">{stats?.os?.platform || 'Unknown'} Platform</span>
                </div>
                <div className="flex items-center space-x-2 opacity-80">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                  <span className="text-[10px] uppercase">{stats?.os?.arch || 'Unknown'} Architecture</span>
                </div>
                <div className="flex items-center space-x-2 opacity-80">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[10px] uppercase">{stats?.cpu?.cores || 0} CPU Cores</span>
                </div>
              </div>
              <div className="absolute -right-2 -bottom-2 text-7xl font-bold text-white/[0.04] z-0 pointer-events-none tracking-tighter">
                OS
              </div>
            </div>
            <span className="text-white/60 text-xs mt-3">Host Information</span>
          </div>

        </div>

        {/* App Grid */}
        <div className="flex items-center justify-center w-full max-w-[900px] mb-8 relative">

          <div className="flex flex-col space-y-8 px-12 z-10">
            <div className="grid grid-cols-6 gap-x-[52px] gap-y-8">
              {appsRow1.map((app: any) => (
                <div key={app.id} className="flex flex-col items-center group cursor-pointer" onClick={app.onClick}>
                  <div className={`w-[70px] h-[70px] rounded-[20px] ${app.color} flex items-center justify-center text-white shadow-xl group-hover:scale-105 transition-all duration-300 ease-out mb-2.5 border border-white/10`}>
                    <app.icon size={34} strokeWidth={1.5} className={app.color.includes('text-black') ? 'text-black' : 'text-white'} />
                  </div>
                  <span className="text-white/80 text-[11px] font-medium tracking-wide">
                    {app.label}
                  </span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-6 gap-x-[52px] gap-y-8">
              {appsRow2.map((app: any) => (
                <div key={app.id} className="flex flex-col items-center group cursor-pointer" onClick={app.onClick}>
                  <div className={`w-[70px] h-[70px] rounded-[20px] ${app.color} flex items-center justify-center text-white shadow-xl group-hover:scale-105 transition-all duration-300 ease-out mb-2.5 border border-white/10`}>
                    <app.icon size={34} strokeWidth={1.5} className={app.color.includes('text-black') ? 'text-black' : 'text-white'} />
                  </div>
                  <span className="text-white/80 text-[11px] font-medium tracking-wide">
                    {app.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* Dock Area with Search Bar Pinned Above */}
      <div className="relative pb-6 flex flex-col items-center w-full z-50 mt-auto">
        {/* Search Bar */}
        <div className="flex items-center space-x-2 text-white/50 bg-black/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg mb-4 pointer-events-auto cursor-pointer hover:bg-black/30 transition-colors">
          <span className="text-xs font-medium">Search</span>
          <div className="flex items-center space-x-1 bg-white/10 rounded px-1.5 py-0.5">
            <span className="text-[10px] font-semibold">⌘K</span>
          </div>
        </div>

        <div className="bg-[#1c1c1e]/50 backdrop-blur-3xl rounded-[32px] p-3 shadow-2xl border border-white/10 flex items-center space-x-4">
          {dockApps.map((app: any) => (
            <div 
              key={`dock-${app.id}`}
              className="relative group cursor-pointer"
              onClick={app.onClick}
            >
              <div className={`w-[56px] h-[56px] rounded-[16px] ${app.color} flex items-center justify-center text-white shadow-xl hover:-translate-y-2 hover:scale-110 transition-all duration-300 ease-out border border-white/20`}>
                <app.icon size={28} strokeWidth={1.5} />
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
