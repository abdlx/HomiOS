import React, { useState, useEffect } from 'react';
import { 
  Cloud, Search, Umbrella, Activity, Cpu, HardDrive, Thermometer, Database, MemoryStick, ChevronLeft, ChevronRight,
  Monitor, FolderOpen, Folder, Terminal, Globe, Calendar, Clock, Calculator, Mail, MessageSquare, Music, Video, Image as ImageIcon, Box,
  Download, Zap, Hash, Radio, Server, Triangle, Settings, Wifi, BatteryFull, Command
} from 'lucide-react';
import { useWallpaper } from '../hooks/useWallpaper';
import { useUsername } from '../hooks/useUsername';

interface DesktopEnvironmentProps {
  onOpenFinder: () => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
  onOpenActivity: () => void;
  onOpenDockerManager: (appId?: string) => void;
  onOpenServers?: () => void;
  username?: string;
}

export default function DesktopEnvironment({ onOpenFinder, onOpenSettings, onOpenTerminal, onOpenActivity, onOpenDockerManager, onOpenServers, username: propUsername }: DesktopEnvironmentProps) {
  const [stats, setStats] = useState<any>(null);
  const { wallpaper } = useWallpaper();
  const { username } = useUsername();

  const [dockerApps, setDockerApps] = useState<any[]>([]);
  const [now, setNow] = useState<Date>(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

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
    
    const fetchDockerApps = async () => {
      try {
        const res = await fetch('/api/docker/apps');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setDockerApps(data);
          } else {
            console.error('Docker apps response is not an array:', data);
          }
        }
      } catch (e) {
        console.error('Failed to fetch docker apps', e);
      }
    };

    fetchStats();
    fetchDockerApps();
    const timer = setInterval(() => {
      fetchStats();
      fetchDockerApps();
    }, 5000);
    return () => clearInterval(timer);
  }, []);
  
  const ALL_APPS: Record<string, any> = {
    'files': { id: 'files', label: 'Files', icon: Folder, color: 'from-[#0A84FF] to-[#0055B3]' },
    'settings': { id: 'settings', label: 'Settings', icon: Settings, color: 'from-[#8E8E93] to-[#48484A]' },
    'activity': { id: 'activity', label: 'Activity', icon: Activity, color: 'from-[#32ADE6] to-[#12648A]' },
    'terminal': { id: 'terminal', label: 'Terminal', icon: Terminal, color: 'from-[#2C2C2E] to-[#1C1C1E]' },
    'finder': { id: 'finder', label: 'Finder', icon: FolderOpen, color: 'from-[#0A84FF] to-[#0055B3]' },
    'docker_manager': { id: 'docker_manager', label: 'Docker Manager', icon: Server, color: 'from-[#0db7ed] to-[#0684a8]' },
    'servers': { id: 'servers', label: 'Servers', icon: Cloud, color: 'from-[#5856D6] to-[#3634A3]' },
  };

  const FACTORY_DOCK_APPS = ['settings', 'finder', 'terminal', 'activity', 'docker_manager', 'servers'];

  const [gridAppIds, setGridAppIds] = useState<string[]>(['files']);
  const [dockAppIds, setDockAppIds] = useState<string[]>(['activity', 'terminal', 'docker_manager', 'servers', 'settings', 'finder']);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, appId: string, source: 'grid' | 'dock' } | null>(null);

  useEffect(() => {
    const savedGrid = localStorage.getItem('openfinder_grid_apps');
    const savedDock = localStorage.getItem('openfinder_dock_apps');
    
    let currentGrid = ['files'];
    let currentDock = ['activity', 'terminal', 'docker_manager', 'servers', 'settings', 'finder'];

    if (savedGrid) currentGrid = JSON.parse(savedGrid);
    if (savedDock) currentDock = JSON.parse(savedDock);

    const activeAppIds = Object.keys(ALL_APPS);
    const missingApps = activeAppIds.filter(id => !currentGrid.includes(id) && !currentDock.includes(id));
    
    if (missingApps.length > 0) {
      currentGrid = [...currentGrid, ...missingApps];
      localStorage.setItem('openfinder_grid_apps', JSON.stringify(currentGrid));
    }

    setGridAppIds(currentGrid);
    setDockAppIds(currentDock);

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

  const getOnClick = (id: string) => {
    if (id === 'finder' || id === 'files') return onOpenFinder;
    if (id === 'settings') return onOpenSettings;
    if (id === 'terminal') return onOpenTerminal;
    if (id === 'activity') return onOpenActivity;
    if (id === 'docker_manager') return () => onOpenDockerManager();
    if (id === 'servers') return onOpenServers;
    return undefined;
  };

  return (
    <div 
      className="h-screen w-full flex flex-col bg-cover bg-center overflow-hidden font-sans relative text-white transition-all duration-1000" 
      style={{ backgroundImage: `url('${wallpaper}')` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-black/10 to-black/25" />

      {/* macOS-style menu bar */}
      <div className="relative z-30 hidden md:flex items-center justify-between h-7 px-4 bg-black/25 backdrop-blur-2xl text-white/90 text-[13px] border-b border-white/5 select-none flex-shrink-0">
        <div className="flex items-center space-x-5">
          <Command size={14} strokeWidth={2.5} className="drop-shadow-sm" />
          <span className="font-semibold tracking-tight">Finder</span>
          <span className="font-medium text-white/70 hover:text-white transition-colors cursor-default">File</span>
          <span className="font-medium text-white/70 hover:text-white transition-colors cursor-default">Edit</span>
          <span className="font-medium text-white/70 hover:text-white transition-colors cursor-default">View</span>
          <span className="font-medium text-white/70 hover:text-white transition-colors cursor-default">Go</span>
          <span className="font-medium text-white/70 hover:text-white transition-colors cursor-default">Window</span>
        </div>
        <div className="flex items-center space-x-4">
          <Wifi size={15} strokeWidth={2} className="text-white/80" />
          <BatteryFull size={17} strokeWidth={2} className="text-white/80" />
          <Search size={14} strokeWidth={2.5} className="text-white/80" />
          <span className="font-medium tabular-nums tracking-tight">
            {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
            {'  '}
            {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center pt-6 md:pt-12 px-4 md:px-8 overflow-y-auto w-full hide-scrollbar">
        
        <div className="flex flex-col items-center mb-8 md:mb-10">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white drop-shadow-sm text-center">{(() => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; })()}, {username || 'User'}.</h1>
        </div>

        <div className="flex overflow-x-auto snap-x snap-mandatory hide-scrollbar md:grid md:grid-cols-3 gap-4 md:gap-6 mb-8 md:mb-10 w-full max-w-[1050px] pb-4 md:pb-0">
          
          <div className="min-w-[85vw] md:min-w-0 snap-center w-full bg-black/40 backdrop-blur-3xl rounded-[32px] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.2)] border border-white/10 relative overflow-hidden group hover:bg-black/50 transition-colors duration-500 flex flex-col justify-between min-h-[160px]">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 rounded-full blur-[40px] -mr-10 -mt-10 transition-transform duration-700 group-hover:scale-150"></div>
            
            <div className="flex justify-between items-start mb-4 relative z-10">
              <div className="flex items-start space-x-3 max-w-[70%]">
                <div className="p-2.5 bg-blue-500/20 rounded-2xl border border-blue-500/30 text-blue-400 flex-shrink-0 mt-0.5">
                  <Activity size={22} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-white/90 text-sm font-semibold tracking-wide leading-tight mt-1">CPU Usage</h3>
                  <p className="text-white/50 text-[11px] font-medium mt-1 line-clamp-2 leading-snug pr-2" title={stats?.cpu?.model || 'Processor'}>
                    {stats?.cpu?.model || 'Processor'}
                  </p>
                </div>
              </div>
              <span className="text-2xl font-bold text-white tracking-tight flex-shrink-0 mt-1">{stats?.cpu?.usagePercent?.toFixed(1) || '0.0'}%</span>
            </div>

            <div className="relative w-full flex items-center z-10 mt-auto pt-2">
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-400 rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(96,165,250,0.6)]" 
                  style={{ width: `${stats?.cpu?.usagePercent || 0}%` }}
                ></div>
              </div>
            </div>
          </div>

          <div className="min-w-[85vw] md:min-w-0 snap-center w-full bg-black/40 backdrop-blur-3xl rounded-[32px] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.2)] border border-white/10 relative overflow-hidden group hover:bg-black/50 transition-colors duration-500 flex flex-col justify-between min-h-[160px]">
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-purple-500/20 rounded-full blur-[40px] -ml-10 -mb-10 transition-transform duration-700 group-hover:scale-150"></div>
            
            <div className="relative z-10 flex items-center justify-between mb-4">
               <div className="flex items-center space-x-3">
                 <div className="p-2 bg-purple-500/20 rounded-xl border border-purple-500/30 text-purple-400">
                   <Cpu size={18} strokeWidth={2} />
                 </div>
                 <div>
                   <h3 className="text-white/80 text-[13px] font-semibold tracking-wide">Memory</h3>
                   <div className="w-24 h-1.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                     <div className="h-full bg-purple-400 rounded-full transition-all duration-500" style={{ width: `${stats ? (stats.memory.used/stats.memory.total)*100 : 0}%` }}></div>
                   </div>
                 </div>
               </div>
               <span className="text-white font-semibold text-[13px] tracking-tight">{stats ? `${(stats.memory.used / 1024 / 1024 / 1024).toFixed(1)} / ${(stats.memory.total / 1024 / 1024 / 1024).toFixed(1)}` : '0'} <span className="text-white/50 text-[10px]">GB</span></span>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent my-1"></div>

            <div className="relative z-10 flex items-center justify-between mt-4">
               <div className="flex items-center space-x-3">
                 <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-500/30 text-emerald-400">
                   <HardDrive size={18} strokeWidth={2} />
                 </div>
                 <div>
                   <h3 className="text-white/80 text-[13px] font-semibold tracking-wide">Storage</h3>
                   <div className="w-24 h-1.5 bg-white/10 rounded-full mt-1.5 overflow-hidden">
                     <div className="h-full bg-emerald-400 rounded-full transition-all duration-500" style={{ width: `${stats ? ((stats.disk.total - stats.disk.free)/stats.disk.total)*100 : 0}%` }}></div>
                   </div>
                 </div>
               </div>
               <span className="text-white font-semibold text-[13px] tracking-tight">{stats ? `${((stats.disk.total - stats.disk.free) / 1024 / 1024 / 1024).toFixed(1)} / ${(stats.disk.total / 1024 / 1024 / 1024).toFixed(1)}` : '0'} <span className="text-white/50 text-[10px]">GB</span></span>
            </div>
          </div>

          <div className="min-w-[85vw] md:min-w-0 snap-center w-full bg-black/40 backdrop-blur-3xl rounded-[32px] p-6 shadow-[0_16px_40px_rgba(0,0,0,0.2)] border border-white/10 relative overflow-hidden group hover:bg-black/50 transition-colors duration-500 flex flex-col justify-between min-h-[160px]">
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-rose-500/10 rounded-full blur-[50px] transition-transform duration-700 group-hover:scale-150"></div>
            
            <div className="flex justify-between items-start relative z-10">
              <div className="flex items-center space-x-3">
                <div className="p-2.5 bg-rose-500/20 rounded-2xl border border-rose-500/30 text-rose-400">
                  <Zap size={22} strokeWidth={2} />
                </div>
                <div>
                  <h3 className="text-white/90 text-sm font-semibold tracking-wide">System Load</h3>
                  <p className="text-white/50 text-[11px] font-medium mt-0.5">Avg over 1 min</p>
                </div>
              </div>
              <div className="flex items-baseline space-x-1">
                <span className="text-2xl font-bold text-white tracking-tight">{stats?.cpu?.load?.toFixed(2) || '0.00'}</span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 relative z-10">
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <span className="block text-white/40 text-[10px] uppercase font-bold tracking-wider mb-1">Cores</span>
                <span className="text-white font-medium text-sm flex items-center"><Hash size={12} className="mr-1 text-rose-400"/> {stats?.cpu?.cores || 0}</span>
              </div>
              <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                <span className="block text-white/40 text-[10px] uppercase font-bold tracking-wider mb-1">Platform</span>
                <span className="text-white font-medium text-sm flex items-center capitalize"><Monitor size={12} className="mr-1 text-rose-400"/> {stats?.os?.platform || 'N/A'}</span>
              </div>
            </div>
          </div>

        </div>

        <div className="flex items-center justify-center w-full max-w-[900px] mb-8 relative">

          <div className="flex flex-col space-y-8 px-4 md:px-12 z-10 w-full">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-x-6 md:gap-x-[52px] gap-y-6 md:gap-y-8">
              {gridAppIds.map((id) => {
                const app = ALL_APPS[id];
                if (!app) return null;
                return (
                  <div 
                    key={app.id} 
                    className="flex flex-col items-center group cursor-pointer relative" 
                    onClick={getOnClick(app.id)}
                    onContextMenu={(e) => handleContextMenu(e, app.id, 'grid')}
                  >
                    <div className={`w-[70px] h-[70px] rounded-[22px] bg-gradient-to-b ${app.color} flex items-center justify-center text-white shadow-[0_8px_16px_rgba(0,0,0,0.4),inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.2)] group-hover:-translate-y-2 group-hover:scale-[1.05] group-hover:shadow-[0_12px_24px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.2)] transition-all duration-300 ease-out mb-2 border border-white/10 relative overflow-hidden`}>
                      <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/30 pointer-events-none rounded-[22px]" />
                      <app.icon size={34} strokeWidth={1.5} className="drop-shadow-md z-10" />
                    </div>
                    <span className="text-white/90 text-[12px] font-medium tracking-wide drop-shadow-md">
                      {app.label}
                    </span>
                  </div>
                );
              })}

              {/* Render deployed Docker Apps directly on Desktop */}
              {dockerApps.map(app => (
                <div 
                  key={`docker-${app.id}`} 
                  className="flex flex-col items-center group cursor-pointer relative" 
                  onClick={() => onOpenDockerManager(app.id)}
                >
                  <div className={`w-[70px] h-[70px] rounded-[22px] bg-gradient-to-b from-[#1E293B] to-[#0F172A] flex items-center justify-center text-[#38BDF8] shadow-[0_8px_16px_rgba(0,0,0,0.4),inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(0,0,0,0.2)] group-hover:-translate-y-2 group-hover:scale-[1.05] transition-all duration-300 ease-out mb-2 border border-white/10 relative overflow-hidden`}>
                    <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/5 to-white/10 pointer-events-none rounded-[22px]" />
                    <Box size={34} strokeWidth={1.5} className="drop-shadow-md z-10" />
                    {app.status === 'running' && (
                      <div className="absolute bottom-2 right-2 w-3 h-3 bg-green-500 rounded-full border-2 border-[#0F172A] shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
                    )}
                  </div>
                  <span className="text-white/90 text-[12px] font-medium tracking-wide drop-shadow-md text-center leading-tight">
                    {app.name}
                  </span>
                  <span className="text-white/50 text-[10px] font-medium tracking-wide text-center uppercase mt-0.5 drop-shadow-md">
                    {app.project_name || 'Docker App'}
                  </span>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      <div className="relative pb-6 flex flex-col items-center w-full z-50 mt-auto">
        <div className="flex items-center space-x-2 text-white/50 bg-black/20 backdrop-blur-md px-4 py-2 rounded-full border border-white/10 shadow-lg mb-4 pointer-events-auto cursor-pointer hover:bg-black/30 transition-colors">
          <span className="text-xs font-medium">Search</span>
          <div className="flex items-center space-x-1 bg-white/10 rounded px-1.5 py-0.5">
            <span className="text-[10px] font-semibold">⌘K</span>
          </div>
        </div>

        <div className="bg-black/40 backdrop-blur-3xl rounded-[32px] p-3 shadow-[0_16px_40px_rgba(0,0,0,0.2)] border border-white/10 hover:bg-black/50 transition-colors duration-500 flex items-center space-x-4">
          {dockAppIds.map((id) => {
            const app = ALL_APPS[id];
            if (!app) return null;
            return (
              <div
                key={`dock-${app.id}`}
                className="relative group cursor-pointer"
                onClick={getOnClick(app.id)}
                onContextMenu={(e) => handleContextMenu(e, app.id, 'dock')}
              >
                {/* Hover tooltip */}
                <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 shadow-lg border border-white/10">
                  {app.label}
                  <span className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-2 h-2 rotate-45 bg-black/70 border-r border-b border-white/10" />
                </span>
                <div className={`w-[56px] h-[56px] rounded-[18px] bg-gradient-to-b ${app.color} flex items-center justify-center text-white shadow-[0_8px_16px_rgba(0,0,0,0.4),inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.2)] hover:-translate-y-2 hover:scale-[1.1] hover:shadow-[0_12px_24px_rgba(0,0,0,0.5),inset_0_2px_4px_rgba(255,255,255,0.4),inset_0_-2px_4px_rgba(0,0,0,0.2)] transition-all duration-300 ease-out border border-white/20 relative overflow-hidden group/dockicon`}>
                  <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-white/30 pointer-events-none rounded-[18px]" />
                  <app.icon size={28} strokeWidth={1.5} className="drop-shadow-md z-10" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {contextMenu && (
        <div 
          className="fixed z-[100] bg-[#1c1c1e]/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-1 w-48 overflow-hidden transform origin-top-left animate-in fade-in zoom-in-95 duration-150"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.source === 'grid' && (
            <>
              <button 
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-blue-500 transition-colors"
                onClick={() => {
                  if (!dockAppIds.includes(contextMenu.appId)) {
                    updateDock([...dockAppIds, contextMenu.appId]);
                  }
                  setContextMenu(null);
                }}
              >
                Add to Dock
              </button>
              <button 
                className="w-full text-left px-4 py-2 text-sm text-white hover:bg-red-500 transition-colors"
                onClick={() => {
                  updateGrid(gridAppIds.filter(id => id !== contextMenu.appId));
                  setContextMenu(null);
                }}
              >
                Remove from Desktop
              </button>
            </>
          )}
          {contextMenu.source === 'dock' && (
            <>
              <button 
                className={`w-full text-left px-4 py-2 text-sm text-white transition-colors ${gridAppIds.includes(contextMenu.appId) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-500'}`}
                disabled={gridAppIds.includes(contextMenu.appId)}
                onClick={() => {
                  if (!gridAppIds.includes(contextMenu.appId)) {
                    updateGrid([...gridAppIds, contextMenu.appId]);
                  }
                  setContextMenu(null);
                }}
              >
                Add to Desktop
              </button>
              <button 
                className={`w-full text-left px-4 py-2 text-sm text-white transition-colors ${FACTORY_DOCK_APPS.includes(contextMenu.appId) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-500'}`}
                disabled={FACTORY_DOCK_APPS.includes(contextMenu.appId)}
                onClick={() => {
                  if (!FACTORY_DOCK_APPS.includes(contextMenu.appId)) {
                     updateDock(dockAppIds.filter(id => id !== contextMenu.appId));
                  }
                  setContextMenu(null);
                }}
              >
                Remove from Dock
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
