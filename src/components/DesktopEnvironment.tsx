import React, { useState, useEffect } from 'react';
import {
  Activity, BatteryFull, Boxes, Cloud, Command, Cpu, Folder, FolderOpen, HardDrive,
  Hash, Monitor, Search, Settings, Terminal, Wifi, Zap, FileText, Image as ImageIcon, Code
} from 'lucide-react';
import { motion } from 'motion/react';
import { useWallpaper } from '../hooks/useWallpaper';
import { useUsername } from '../hooks/useUsername';
import { FloatingDock } from './ui/floating-dock';
import GlassSurface from '../../components/GlassSurface';

interface DesktopEnvironmentProps {
  onOpenFinder: () => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
  onOpenActivity: () => void;
  onOpenCoolify: () => void;
  onOpenNotes: () => void;
  onOpenPhotos: () => void;
  onOpenVSCode: () => void;
  username?: string;
}

export default function DesktopEnvironment({ onOpenFinder, onOpenSettings, onOpenTerminal, onOpenActivity, onOpenCoolify, onOpenNotes, onOpenPhotos, onOpenVSCode }: DesktopEnvironmentProps) {
  const [stats, setStats] = useState<any>(null);
  const { wallpaper } = useWallpaper();
  const { username } = useUsername();
  const [now, setNow] = useState<Date | null>(null);
  const [gridAppIds, setGridAppIds] = useState<string[]>(['files']);
  const [dockAppIds, setDockAppIds] = useState<string[]>(['activity', 'terminal', 'coolify', 'settings', 'finder']);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, appId: string, source: 'grid' | 'dock' } | null>(null);

  const ALL_APPS: Record<string, any> = {
    files: { id: 'files', label: 'Files', icon: Folder, color: 'from-[#0A84FF] to-[#0055B3]' },
    settings: { id: 'settings', label: 'Settings', icon: Settings, color: 'from-[#8E8E93] to-[#48484A]' },
    activity: { id: 'activity', label: 'Activity', icon: Activity, color: 'from-[#32ADE6] to-[#12648A]' },
    terminal: { id: 'terminal', label: 'Terminal', icon: Terminal, color: 'from-[#2C2C2E] to-[#1C1C1E]' },
    coolify: { id: 'coolify', label: 'Coolify', icon: Boxes, color: 'from-[#22D3EE] to-[#2563EB]' },
    finder: { id: 'finder', label: 'Finder', icon: FolderOpen, color: 'from-[#0A84FF] to-[#0055B3]' },
    notes: { id: 'notes', label: 'Notes', icon: FileText, color: 'from-[#F59E0B] to-[#D97706]' },
    photos: { id: 'photos', label: 'Photos', icon: ImageIcon, color: 'from-[#EC4899] to-[#BE185D]' },
    vscode: { id: 'vscode', label: 'VS Code', icon: Code, color: 'from-[#0066b8] to-[#007acc]' },
  };
  const FACTORY_DOCK_APPS = ['settings', 'finder', 'terminal', 'activity', 'coolify', 'notes', 'photos', 'vscode'];

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system/stats');
        if (res.ok) setStats(await res.json());
      } catch (e) {
        console.error('Failed to fetch stats', e);
      }
    };
    fetchStats();
    const timer = setInterval(fetchStats, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const activeAppIds = Object.keys(ALL_APPS);
    const savedGrid = localStorage.getItem('openfinder_grid_apps');
    const savedDock = localStorage.getItem('openfinder_dock_apps');
    let currentGrid = savedGrid ? JSON.parse(savedGrid).filter((id: string) => activeAppIds.includes(id)) : ['files'];
    let currentDock = savedDock ? JSON.parse(savedDock).filter((id: string) => activeAppIds.includes(id)) : ['activity', 'terminal', 'vscode', 'coolify', 'settings', 'finder', 'photos'];
    const missingApps = activeAppIds.filter(id => !currentGrid.includes(id) && !currentDock.includes(id));
    currentGrid = [...currentGrid, ...missingApps];
    setGridAppIds(currentGrid);
    setDockAppIds(currentDock);
    localStorage.setItem('openfinder_grid_apps', JSON.stringify(currentGrid));
    localStorage.setItem('openfinder_dock_apps', JSON.stringify(currentDock));

    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const updateGrid = (newGrid: string[]) => {
    setGridAppIds(newGrid);
    localStorage.setItem('openfinder_grid_apps', JSON.stringify(newGrid));
  };

  const updateDock = (newDock: string[]) => {
    setDockAppIds(newDock);
    localStorage.setItem('openfinder_dock_apps', JSON.stringify(newDock));
  };

  const getOnClick = (id: string) => {
    if (id === 'finder' || id === 'files') return onOpenFinder;
    if (id === 'settings') return onOpenSettings;
    if (id === 'terminal') return onOpenTerminal;
    if (id === 'activity') return onOpenActivity;
    if (id === 'coolify') return onOpenCoolify;
    if (id === 'notes') return onOpenNotes;
    if (id === 'photos') return onOpenPhotos;
    if (id === 'vscode') return onOpenVSCode;
    return undefined;
  };

  const handleContextMenu = (e: React.MouseEvent, appId: string, source: 'grid' | 'dock') => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 192;
    const menuHeight = 90;
    let x = e.clientX;
    let y = e.clientY;
    if (x + menuWidth > window.innerWidth) x = window.innerWidth - menuWidth - 8;
    if (y + menuHeight > window.innerHeight) y = window.innerHeight - menuHeight - 8;
    setContextMenu({ x, y, appId, source });
  };

  const AppIcon = ({ app, source }: { app: any; source: 'grid' | 'dock' }) => {
    const size = source === 'dock' ? 'w-[56px] h-[56px] rounded-[18px]' : 'w-[70px] h-[70px] rounded-[22px]';
    const iconSize = source === 'dock' ? 28 : 34;
    return (
      <motion.div 
        className="relative group cursor-pointer flex flex-col items-center text-center" 
        onClick={getOnClick(app.id)} 
        onContextMenu={(e) => handleContextMenu(e, app.id, source)}
        whileHover={source === 'grid' ? { scale: 1.05, y: -8 } : undefined}
        whileTap={{ scale: 0.9, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
      >
        {source === 'dock' && (
          <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 shadow-lg border border-white/10">
            {app.label}
          </span>
        )}
        <div className={`${size} bg-gradient-to-b ${app.color} flex items-center justify-center text-white shadow-[0_8px_16px_rgba(0,0,0,0.4),inset_0_2px_4px_rgba(255,255,255,0.35),inset_0_-2px_4px_rgba(0,0,0,0.2)] mb-2 border border-white/10 relative overflow-hidden`}>
          <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/30 pointer-events-none" />
          <app.icon size={iconSize} strokeWidth={1.5} className="drop-shadow-md z-10" />
        </div>
        {source === 'grid' && <span className="text-white/90 text-[12px] font-medium tracking-wide drop-shadow-md">{app.label}</span>}
      </motion.div>
    );
  };

  return (
    <div className="h-screen w-full flex flex-col bg-cover bg-center overflow-hidden font-sans relative text-white transition-all duration-1000" style={{ backgroundImage: `url('${wallpaper}')` }} onContextMenu={(e) => e.preventDefault()}>
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/25" />

      <div className="relative z-30 hidden md:flex items-center justify-between h-7 px-4 bg-black/25 backdrop-blur-2xl text-white/90 text-[13px] border-b border-white/5 select-none flex-shrink-0">
        <div className="flex items-center space-x-5">
          <Command size={14} strokeWidth={2.5} className="drop-shadow-sm" />
          <span className="font-semibold tracking-tight">Finder</span>
          <span className="font-medium text-white/70">File</span>
          <span className="font-medium text-white/70">Edit</span>
          <span className="font-medium text-white/70">View</span>
          <span className="font-medium text-white/70">Go</span>
          <span className="font-medium text-white/70">Window</span>
        </div>
        <div className="flex items-center space-x-4">
          <Wifi size={15} strokeWidth={2} className="text-white/80" />
          <BatteryFull size={17} strokeWidth={2} className="text-white/80" />
          <Search size={14} strokeWidth={2.5} className="text-white/80" />
          {now && <span className="font-medium tabular-nums tracking-tight">{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center pt-6 md:pt-12 px-4 md:px-8 overflow-y-auto w-full hide-scrollbar">
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white drop-shadow-sm text-center mb-8 md:mb-10">
          {now ? (() => { const h = now.getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; })() : 'Welcome'}, {username || 'User'}.
        </h1>

        <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar md:grid md:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-10 w-full max-w-[1050px] pb-4 md:pb-0">
          <div className="relative min-w-[85vw] md:min-w-0 snap-center rounded-[32px] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.2)] min-h-[160px]">
            <div className="absolute inset-0 -z-10">
              <GlassSurface width="100%" height="100%" borderRadius={32} distortionScale={300} opacity={1} borderWidth={0.07} displace={5} backgroundOpacity={0.4} blur={30} />
            </div>
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-start space-x-3 max-w-[70%]"><div className="p-2.5 bg-blue-500/20 rounded-2xl border border-blue-500/30 text-blue-400"><Activity size={22} /></div><div><h3 className="text-white/90 text-sm font-semibold">CPU Usage</h3><p className="text-white/50 text-[11px] mt-1 line-clamp-2">{stats?.cpu?.model || 'Processor'}</p></div></div>
              <span className="text-2xl font-bold text-white">{stats?.cpu?.usagePercent?.toFixed(1) || '0.0'}%</span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-blue-400 rounded-full transition-all" style={{ width: `${stats?.cpu?.usagePercent || 0}%` }} /></div>
          </div>
          <div className="relative min-w-[85vw] md:min-w-0 snap-center rounded-[32px] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.2)] min-h-[160px]">
            <div className="absolute inset-0 -z-10">
              <GlassSurface width="100%" height="100%" borderRadius={32} distortionScale={300} opacity={1} borderWidth={0.07} displace={5} backgroundOpacity={0.4} blur={30} />
            </div>
            <div className="flex items-center justify-between mb-6"><div className="flex items-center space-x-3"><div className="p-2 bg-purple-500/20 rounded-xl border border-purple-500/30 text-purple-400"><Cpu size={18} /></div><span className="text-white/80 text-[13px] font-semibold">Memory</span></div><span className="text-white font-semibold text-[13px]">{stats ? `${(stats.memory.used / 1024 / 1024 / 1024).toFixed(1)} / ${(stats.memory.total / 1024 / 1024 / 1024).toFixed(1)} GB` : '0 GB'}</span></div>
            <div className="flex items-center justify-between"><div className="flex items-center space-x-3"><div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30 text-emerald-400"><HardDrive size={18} /></div><span className="text-white/80 text-[13px] font-semibold">Storage</span></div><span className="text-white font-semibold text-[13px]">{stats ? `${((stats.disk.total - stats.disk.free) / 1024 / 1024 / 1024).toFixed(1)} / ${(stats.disk.total / 1024 / 1024 / 1024).toFixed(1)} GB` : '0 GB'}</span></div>
          </div>
          <div className="relative min-w-[85vw] md:min-w-0 snap-center rounded-[32px] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.2)] min-h-[160px]">
            <div className="absolute inset-0 -z-10">
              <GlassSurface width="100%" height="100%" borderRadius={32} distortionScale={300} opacity={1} borderWidth={0.07} displace={5} backgroundOpacity={0.4} blur={30} />
            </div>
            <div className="flex justify-between items-start mb-4"><div className="flex items-center space-x-3"><div className="p-2.5 bg-rose-500/20 rounded-2xl border border-rose-500/30 text-rose-400"><Zap size={22} /></div><div><h3 className="text-white/90 text-sm font-semibold">System Load</h3><p className="text-white/50 text-[11px]">Avg over 1 min</p></div></div><span className="text-2xl font-bold text-white">{stats?.cpu?.load?.toFixed(2) || '0.00'}</span></div>
            <div className="grid grid-cols-2 gap-3"><div className="bg-white/5 rounded-xl p-3 border border-white/5"><span className="block text-white/40 text-[10px] uppercase font-bold mb-1">Cores</span><span className="text-white font-medium text-sm flex items-center"><Hash size={12} className="mr-1 text-rose-400" />{stats?.cpu?.cores || 0}</span></div><div className="bg-white/5 rounded-xl p-3 border border-white/5"><span className="block text-white/40 text-[10px] uppercase font-bold mb-1">Platform</span><span className="text-white font-medium text-sm flex items-center capitalize"><Monitor size={12} className="mr-1 text-rose-400" />{stats?.os?.platform || 'N/A'}</span></div></div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-6 md:gap-x-[52px] gap-y-6 md:gap-y-8 w-full max-w-[900px] mb-8 px-4 md:px-12">
          {gridAppIds.map((id) => {
            const app = ALL_APPS[id];
            return app ? <div key={app.id} className="flex flex-col items-center"><AppIcon app={app} source="grid" /></div> : null;
          })}
        </div>
      </div>

      <div className="relative pb-6 flex flex-col items-center w-full z-50 mt-auto">
        <FloatingDock
          desktopClassName="transition-colors duration-500"
          items={dockAppIds.map((id) => {
            const app = ALL_APPS[id];
            if (!app) return null;
            return {
              title: app.label,
              onClick: getOnClick(app.id),
              icon: (
                <div 
                  className={`w-full h-full rounded-2xl bg-gradient-to-b ${app.color} flex items-center justify-center text-white shadow-[0_8px_16px_rgba(0,0,0,0.4),inset_0_2px_4px_rgba(255,255,255,0.35),inset_0_-2px_4px_rgba(0,0,0,0.2)] border border-white/10 relative overflow-hidden`}
                  onContextMenu={(e) => handleContextMenu(e, app.id, 'dock')}
                >
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/30 pointer-events-none" />
                  <app.icon size={28} strokeWidth={1.5} className="drop-shadow-md z-10" />
                </div>
              ),
              href: "#",
            };
          }).filter(Boolean) as any[]}
        />
      </div>

      {contextMenu && (
        <div className="fixed z-[100] bg-[#1c1c1e]/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-1 w-48 overflow-hidden" style={{ top: contextMenu.y, left: contextMenu.x }}>
          {contextMenu.source === 'grid' ? (
            <>
              <button className="w-full text-left px-4 py-2 text-sm text-white hover:bg-blue-500" onClick={() => { if (!dockAppIds.includes(contextMenu.appId)) updateDock([...dockAppIds, contextMenu.appId]); setContextMenu(null); }}>Add to Dock</button>
              <button className="w-full text-left px-4 py-2 text-sm text-white hover:bg-red-500" onClick={() => { updateGrid(gridAppIds.filter(id => id !== contextMenu.appId)); setContextMenu(null); }}>Remove from Desktop</button>
            </>
          ) : (
            <>
              <button className={`w-full text-left px-4 py-2 text-sm text-white ${gridAppIds.includes(contextMenu.appId) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500'}`} disabled={gridAppIds.includes(contextMenu.appId)} onClick={() => { if (!gridAppIds.includes(contextMenu.appId)) updateGrid([...gridAppIds, contextMenu.appId]); setContextMenu(null); }}>Add to Desktop</button>
              <button className={`w-full text-left px-4 py-2 text-sm text-white ${FACTORY_DOCK_APPS.includes(contextMenu.appId) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-500'}`} disabled={FACTORY_DOCK_APPS.includes(contextMenu.appId)} onClick={() => { if (!FACTORY_DOCK_APPS.includes(contextMenu.appId)) updateDock(dockAppIds.filter(id => id !== contextMenu.appId)); setContextMenu(null); }}>Remove from Dock</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
