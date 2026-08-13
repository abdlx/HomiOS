import React, { useState, useEffect } from 'react';
import {
  Activity, BatteryFull, Boxes, Command, Cpu, Folder, FolderOpen, HardDrive,
  Monitor, Search, Settings, Terminal, Wifi, Zap, FileText, Image as ImageIcon, Code, Bell, Globe, Sparkles
} from 'lucide-react';
import { motion } from 'motion/react';
import { useWallpaper } from '../hooks/useWallpaper';
import { useUsername } from '../hooks/useUsername';
import { usePerformanceSettings } from '../hooks/usePerformanceSettings';
import { FloatingDock } from './ui/floating-dock';
import { AppIcon } from './icons/AppIcons';
import GlassSurface from '../../components/GlassSurface';
import NotificationCenter from './NotificationCenter';
import PWAInstallChooser, { PWAInstallButton } from './PWAInstallChooser';

interface DesktopEnvironmentProps {
  onOpenFinder: () => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
  onOpenActivity: () => void;
  onOpenCoolify: () => void;
  onOpenNotes: () => void;
  onOpenPhotos: () => void;
  onOpenVSCode: () => void;
  onOpenCodex: () => void;
  onOpenBrowser: () => void;
  username?: string;
}

type DesktopAppSource = 'grid' | 'dock';

type DesktopAppConfig = {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  color: string;
  subtitle?: string;
  url?: string;
};

const ALL_APPS: Record<string, DesktopAppConfig> = {
  files: { id: 'files', label: 'Files', icon: Folder, color: 'from-[#0A84FF] to-[#0055B3]' },
  settings: { id: 'settings', label: 'Settings', icon: Settings, color: 'from-[#8E8E93] to-[#48484A]' },
  activity: { id: 'activity', label: 'Activity', icon: Activity, color: 'from-[#32ADE6] to-[#12648A]' },
  terminal: { id: 'terminal', label: 'Terminal', icon: Terminal, color: 'from-[#2C2C2E] to-[#1C1C1E]' },
  coolify: { id: 'coolify', label: 'Coolify', icon: Boxes, color: 'from-[#22D3EE] to-[#2563EB]' },
  finder: { id: 'finder', label: 'Finder', icon: FolderOpen, color: 'from-[#0A84FF] to-[#0055B3]' },
  notes: { id: 'notes', label: 'Notes', icon: FileText, color: 'from-[#F59E0B] to-[#D97706]' },
  photos: { id: 'photos', label: 'Photos', icon: ImageIcon, color: 'from-[#EC4899] to-[#BE185D]' },
  vscode: { id: 'vscode', label: 'VS Code', icon: Code, color: 'from-[#0066b8] to-[#007acc]' },
  codex: { id: 'codex', label: 'Codex', icon: Sparkles, color: 'from-[#17BE92] to-[#0A6F55]' },
  browser: { id: 'browser', label: 'Browser', icon: Globe, color: 'from-[#14B8A6] to-[#0F766E]' },
};

const FACTORY_DOCK_APPS = ['settings', 'finder', 'terminal', 'activity', 'coolify', 'notes', 'photos', 'vscode', 'codex', 'browser'];

const HeaderMetricsBackdrop = React.memo(function HeaderMetricsBackdrop({ glassSurfaces }: { glassSurfaces: boolean }) {
  return glassSurfaces ? (
    <GlassSurface width="100%" height="100%" borderRadius={32} distortionScale={300} opacity={1} borderWidth={0.07} displace={5} backgroundOpacity={0.4} blur={30} />
  ) : (
    <div className="h-full w-full rounded-[32px] border border-white/10 bg-black/25 shadow-[0_16px_40px_rgba(0,0,0,0.16)] backdrop-blur-md" />
  );
});

const METRIC_TONES = {
  blue: {
    icon: 'bg-blue-500/20 border-blue-400/30 text-blue-300 shadow-[inset_0_0_18px_rgba(59,130,246,0.18)]',
    bar: 'bg-gradient-to-r from-blue-500 to-cyan-400',
  },
  violet: {
    icon: 'bg-violet-500/20 border-violet-400/30 text-violet-300 shadow-[inset_0_0_18px_rgba(139,92,246,0.18)]',
    bar: 'bg-gradient-to-r from-violet-500 to-fuchsia-400',
  },
  emerald: {
    icon: 'bg-emerald-500/20 border-emerald-400/30 text-emerald-300 shadow-[inset_0_0_18px_rgba(16,185,129,0.18)]',
    bar: 'bg-gradient-to-r from-emerald-500 to-teal-300',
  },
  rose: {
    icon: 'bg-rose-500/20 border-rose-400/30 text-rose-300 shadow-[inset_0_0_18px_rgba(244,63,94,0.18)]',
    bar: 'bg-gradient-to-r from-rose-500 to-pink-400',
  },
} as const;

const HeaderMetric = React.memo(function HeaderMetric({
  icon: Icon,
  label,
  value,
  progress,
  tone,
  detail,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: string;
  progress: number;
  tone: keyof typeof METRIC_TONES;
  detail?: React.ReactNode;
}) {
  const colors = METRIC_TONES[tone];
  const safeProgress = Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0));

  return (
    <div className="relative min-h-[138px] px-6 py-5 md:px-7 flex flex-col justify-between">
      <div>
        <div className="flex items-center gap-4">
          <div className={`w-11 h-11 shrink-0 rounded-xl border flex items-center justify-center ${colors.icon}`}>
            <Icon size={23} strokeWidth={1.8} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-slate-300/80 leading-none mb-1.5">{label}</p>
            <p className="text-[21px] font-semibold leading-none tracking-tight text-white tabular-nums">{value}</p>
          </div>
        </div>
        <div className="mt-4 h-[5px] overflow-hidden rounded-full bg-white/20">
          <div className={`h-full rounded-full transition-[width] duration-700 ${colors.bar}`} style={{ width: `${safeProgress}%` }} />
        </div>
      </div>
      {detail && <div className="mt-3 min-h-[28px] text-[11px] leading-[1.45] text-slate-300/75">{detail}</div>}
    </div>
  );
});

const DashboardAppIcon = React.memo(function DashboardAppIcon({
  app,
  source,
  onClick,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  reduceMotion,
}: {
  app: DesktopAppConfig;
  source: DesktopAppSource;
  onClick?: () => void;
  onContextMenu: (e: React.MouseEvent, appId: string, source: DesktopAppSource) => void;
  onDragStart: (e: React.DragEvent, appId: string, source: DesktopAppSource) => void;
  onDragOver: (e: React.DragEvent, appId: string, source: DesktopAppSource) => void;
  onDrop: (e: React.DragEvent, appId: string, source: DesktopAppSource) => void;
  reduceMotion: boolean;
}) {
  const sizeClass = source === 'dock' ? 'w-[54px] h-[54px]' : 'w-[64px] h-[64px]';

  return (
    <motion.div
      className="relative group cursor-pointer flex flex-col items-center text-center"
      onClick={onClick}
      onContextMenu={(e) => onContextMenu(e, app.id, source)}
      draggable
      onDragStart={(e) => onDragStart(e as unknown as React.DragEvent, app.id, source)}
      onDragOver={(e) => onDragOver(e as unknown as React.DragEvent, app.id, source)}
      onDrop={(e) => onDrop(e as unknown as React.DragEvent, app.id, source)}
      whileHover={!reduceMotion && source === 'grid' ? { scale: 1.05, y: -8 } : undefined}
      whileTap={reduceMotion ? undefined : { scale: 0.9, y: 0 }}
      transition={reduceMotion ? { duration: 0.1 } : { type: "spring", stiffness: 300, damping: 15 }}
    >
      {source === 'dock' && (
        <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 shadow-lg border border-white/10">
          {app.label}
        </span>
      )}
      <AppIcon id={app.id} colorClass={app.color} className={`${sizeClass} mb-2 drop-shadow-[0_6px_14px_rgba(0,0,0,0.4)]`} />
      {source === 'grid' && (
        <div className="flex flex-col items-center min-h-[30px]">
          <span className="text-white/95 text-[12px] font-medium tracking-tight drop-shadow-md text-center leading-tight truncate max-w-[84px]">{app.label}</span>
          {app.subtitle && <span className="text-white/60 text-[10px] font-medium tracking-tight drop-shadow-md truncate max-w-[84px] mt-0.5">{app.subtitle}</span>}
        </div>
      )}
    </motion.div>
  );
});

export default function DesktopEnvironment({ onOpenFinder, onOpenSettings, onOpenTerminal, onOpenActivity, onOpenCoolify, onOpenNotes, onOpenPhotos, onOpenVSCode, onOpenCodex, onOpenBrowser }: DesktopEnvironmentProps) {
  const [stats, setStats] = useState<any>(null);
  const { wallpaper } = useWallpaper();
  const { username } = useUsername();
  const { settings: performanceSettings } = usePerformanceSettings();
  const [now, setNow] = useState<Date | null>(null);
  const [gridAppIds, setGridAppIds] = useState<string[]>(['files']);
  const [dockAppIds, setDockAppIds] = useState<string[]>(['activity', 'terminal', 'coolify', 'settings', 'finder']);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, appId: string, source: 'grid' | 'dock' } | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [draggingApp, setDraggingApp] = useState<{ id: string; source: DesktopAppSource } | null>(null);

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fetchCoolifyApps = async () => {
      try {
        const res = await fetch('/api/coolify/applications', { cache: 'no-store' });
        if (res.ok) {
          const apps = await res.json();
          const newAppIds: string[] = [];
          let hasChanges = false;
          
          apps.forEach((app: any) => {
            const appId = app.id;
            const existing = ALL_APPS[appId];
            if (!existing || existing.label !== app.name || existing.subtitle !== app.projectName || existing.url !== app.url) {
              hasChanges = true;
            }
            ALL_APPS[appId] = {
              id: appId,
              label: app.name,
              subtitle: app.projectName,
              icon: Globe,
              color: 'from-[#14B8A6] to-[#0F766E]',
              url: app.url
            };
            newAppIds.push(appId);
          });
          
          if (hasChanges && newAppIds.length > 0) {
            let dockIds: string[] = [];
            setDockAppIds(prev => {
              dockIds = prev;
              return prev; // We just need to read prev dockIds
            });
            setGridAppIds(prev => {
              const missingNew = newAppIds.filter(id => !prev.includes(id) && !dockIds.includes(id));
              if (missingNew.length > 0) {
                const newGrid = [...prev, ...missingNew];
                localStorage.setItem('openfinder_grid_apps', JSON.stringify(newGrid));
                return newGrid;
              }
              return [...prev]; // Force re-render to reflect ALL_APPS mutation
            });
          }
        }
      } catch (err) {
        console.error('Failed to fetch coolify applications', err);
      }
    };
    
    fetchCoolifyApps();
    const timer = setInterval(fetchCoolifyApps, 15000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const intervalByMode = {
      live: 3000,
      balanced: 7000,
      quiet: 15000,
    } as const;
    let controller: AbortController | null = null;

    const fetchStats = async () => {
      if (document.visibilityState === 'hidden') return;
      controller?.abort();
      controller = new AbortController();

      try {
        const res = await fetch('/api/system/stats', { signal: controller.signal });
        if (res.ok) setStats(await res.json());
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
  }, [performanceSettings.backgroundPolling]);

  useEffect(() => {
    const activeAppIds = Object.keys(ALL_APPS);
    const savedGrid = localStorage.getItem('openfinder_grid_apps');
    const savedDock = localStorage.getItem('openfinder_dock_apps');
    let currentGrid = savedGrid ? JSON.parse(savedGrid).filter((id: string) => activeAppIds.includes(id) || id.startsWith('coolify_app_')) : ['files'];
    let currentDock = savedDock ? JSON.parse(savedDock).filter((id: string) => activeAppIds.includes(id) || id.startsWith('coolify_app_')) : ['activity', 'terminal', 'vscode', 'coolify', 'settings', 'finder', 'photos'];
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
    if (ALL_APPS[id]?.url) {
      return () => {
        let url = ALL_APPS[id].url as string;
        if (!url.startsWith('http')) {
          url = `https://${url}`;
        }
        window.open(url, '_blank');
      };
    }
    if (id === 'finder' || id === 'files') return onOpenFinder;
    if (id === 'settings') return onOpenSettings;
    if (id === 'terminal') return onOpenTerminal;
    if (id === 'activity') return onOpenActivity;
    if (id === 'coolify') return onOpenCoolify;
    if (id === 'notes') return onOpenNotes;
    if (id === 'photos') return onOpenPhotos;
    if (id === 'vscode') return onOpenVSCode;
    if (id === 'codex') return onOpenCodex;
    if (id === 'browser') return onOpenBrowser;
    return undefined;
  };

  const moveApp = (appId: string, from: DesktopAppSource, to: DesktopAppSource, beforeId?: string) => {
    const remove = (items: string[]) => items.filter((id) => id !== appId);
    const insert = (items: string[]) => {
      const clean = remove(items);
      const targetIndex = beforeId ? clean.indexOf(beforeId) : -1;
      if (targetIndex >= 0) {
        clean.splice(targetIndex, 0, appId);
        return clean;
      }
      return [...clean, appId];
    };

    if (from === 'grid' && to === 'grid') updateGrid(insert(gridAppIds));
    if (from === 'dock' && to === 'dock') updateDock(insert(dockAppIds));
    if (from === 'grid' && to === 'dock') {
      updateGrid(remove(gridAppIds));
      updateDock(insert(dockAppIds));
    }
    if (from === 'dock' && to === 'grid') {
      updateDock(remove(dockAppIds));
      updateGrid(insert(gridAppIds));
    }
  };

  const handleAppDragStart = (e: React.DragEvent, appId: string, source: DesktopAppSource) => {
    setDraggingApp({ id: appId, source });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/openfinder-app', JSON.stringify({ id: appId, source }));
  };

  const readDraggedApp = (e: React.DragEvent) => {
    if (draggingApp) return draggingApp;
    try {
      const raw = e.dataTransfer.getData('application/openfinder-app');
      return raw ? JSON.parse(raw) as { id: string; source: DesktopAppSource } : null;
    } catch {
      return null;
    }
  };

  const handleAppDragOver = (e: React.DragEvent) => {
    if (draggingApp || e.dataTransfer.types.includes('application/openfinder-app')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleAppDrop = (e: React.DragEvent, beforeId?: string, targetSource?: DesktopAppSource) => {
    e.preventDefault();
    const dragged = readDraggedApp(e);
    if (!dragged) return;
    const destination = targetSource || dragged.source;
    if (dragged.id !== beforeId) moveApp(dragged.id, dragged.source, destination, beforeId);
    setDraggingApp(null);
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

  const cpuPercent = stats?.cpu?.usagePercent || 0;
  const memoryPercent = stats?.memory?.total ? (stats.memory.used / stats.memory.total) * 100 : 0;
  const storagePercent = stats?.disk?.total ? (stats.disk.used / stats.disk.total) * 100 : 0;
  const load = stats?.cpu?.load || 0;
  const loadPercent = stats?.cpu?.cores ? (load / stats.cpu.cores) * 100 : 0;
  const toGiB = (bytes: number | undefined) => ((bytes || 0) / 1024 / 1024 / 1024).toFixed(1);
  const greeting = now
    ? now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening'
    : 'Welcome';

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
          <PWAInstallButton />
          <Wifi size={15} strokeWidth={2} className="text-white/80" />
          <BatteryFull size={17} strokeWidth={2} className="text-white/80" />
          <Search size={14} strokeWidth={2.5} className="text-white/80" />
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsNotificationsOpen((open) => !open);
            }}
            className="relative text-white/80 hover:text-white transition"
            title="Notifications"
          >
            <Bell size={15} strokeWidth={2} />
            {unreadNotifications > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-blue-400" />}
          </button>
          {now && <span className="font-medium tabular-nums tracking-tight">{now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
        </div>
      </div>

      <NotificationCenter open={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} onUnreadChange={setUnreadNotifications} />

      <div className="relative z-10 flex-1 flex flex-col items-center pt-5 md:pt-4 px-4 md:px-8 overflow-y-auto w-full hide-scrollbar">
        <header className="w-full max-w-[1050px] mb-8 md:mb-10">
          <div className="text-center">
            <h1 className="text-[30px] md:text-[38px] leading-tight font-semibold tracking-[-0.035em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
              {greeting}, {username || 'User'}
            </h1>
            <p className="mt-2 text-sm md:text-[15px] font-medium tracking-wide text-slate-300/75 drop-shadow-md">
              {now ? now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : '\u00a0'}
            </p>
          </div>

          <div className="relative isolate mt-6 overflow-hidden rounded-[32px] shadow-[0_16px_40px_rgba(0,0,0,0.2)]">
            <div className="pointer-events-none absolute inset-0 -z-10">
              <HeaderMetricsBackdrop glassSurfaces={performanceSettings.glassSurfaces} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
              <div className="relative after:absolute after:inset-x-6 after:bottom-0 after:h-px after:bg-white/10 md:after:inset-y-5 md:after:left-auto md:after:right-0 md:after:h-auto md:after:w-px lg:after:block">
                <HeaderMetric
                  icon={Activity}
                  label="CPU"
                  value={`${cpuPercent.toFixed(0)}%`}
                  progress={cpuPercent}
                  tone="blue"
                  detail={<span className="line-clamp-2">{stats?.cpu?.model || 'Processor details unavailable'}</span>}
                />
              </div>
              <div className="relative after:absolute after:inset-x-6 after:bottom-0 after:h-px after:bg-white/10 md:after:inset-x-6 md:after:inset-y-auto md:after:bottom-0 md:after:h-px md:after:w-auto lg:after:inset-y-5 lg:after:left-auto lg:after:right-0 lg:after:h-auto lg:after:w-px">
                <HeaderMetric
                  icon={Cpu}
                  label="Memory"
                  value={`${toGiB(stats?.memory?.used)} / ${toGiB(stats?.memory?.total)} GB`}
                  progress={memoryPercent}
                  tone="violet"
                />
              </div>
              <div className="relative after:absolute after:inset-x-6 after:bottom-0 after:h-px after:bg-white/10 md:after:inset-y-5 md:after:left-auto md:after:right-0 md:after:h-auto md:after:w-px lg:after:block">
                <HeaderMetric
                  icon={HardDrive}
                  label="Storage"
                  value={`${toGiB(stats?.disk?.used)} / ${toGiB(stats?.disk?.total)} GB`}
                  progress={storagePercent}
                  tone="emerald"
                />
              </div>
              <HeaderMetric
                icon={Zap}
                label="System Load"
                value={load.toFixed(2)}
                progress={loadPercent}
                tone="rose"
                detail={(
                  <span className="flex items-center gap-2.5 capitalize">
                    <span>{stats?.cpu?.cores || 0} Cores</span>
                    <span className="text-white/35">•</span>
                    <span className="inline-flex items-center gap-1.5"><Monitor size={12} />{stats?.os?.platform || 'N/A'}</span>
                  </span>
                )}
              />
            </div>
          </div>
        </header>

        <div
          className="flex flex-wrap justify-center gap-x-7 gap-y-7 md:gap-x-9 md:gap-y-8 w-full max-w-[720px] mb-8"
          onDragOver={handleAppDragOver}
          onDrop={(e) => handleAppDrop(e, undefined, 'grid')}
        >
          {gridAppIds.map((id) => {
            const app = ALL_APPS[id];
            return app ? (
              <div key={app.id} className="flex flex-col items-center w-[76px]">
                <DashboardAppIcon
                  app={app}
                  source="grid"
                  onClick={getOnClick(app.id)}
                  onContextMenu={handleContextMenu}
                  onDragStart={handleAppDragStart}
                  onDragOver={(e) => {
                    handleAppDragOver(e);
                  }}
                  onDrop={(e, appId) => handleAppDrop(e, appId, 'grid')}
                  reduceMotion={performanceSettings.reduceMotion}
                />
              </div>
            ) : null;
          })}
        </div>
      </div>

      <div className="relative pb-6 flex flex-col items-center w-full z-50 mt-auto">
        <div onDragOver={handleAppDragOver} onDrop={(e) => handleAppDrop(e, undefined, 'dock')}>
        <FloatingDock
          glassSurfaces={performanceSettings.glassSurfaces}
          reduceMotion={performanceSettings.reduceMotion}
          desktopClassName="transition-colors duration-500"
          items={dockAppIds.map((id) => {
            const app = ALL_APPS[id];
            if (!app) return null;
            return {
              title: app.label,
              id: app.id,
              onClick: getOnClick(app.id),
              onDragStart: (e: React.DragEvent) => handleAppDragStart(e, app.id, 'dock'),
              onDragOver: (e: React.DragEvent) => handleAppDragOver(e),
              onDrop: (e: React.DragEvent) => handleAppDrop(e, app.id, 'dock'),
              icon: (
                <div
                  className="w-full h-full"
                  onContextMenu={(e) => handleContextMenu(e, app.id, 'dock')}
                >
                  <AppIcon id={app.id} colorClass={app.color} className="w-full h-full drop-shadow-[0_5px_12px_rgba(0,0,0,0.45)]" />
                </div>
              ),
              href: "#",
            };
          }).filter(Boolean) as any[]}
        />
        </div>
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
      <PWAInstallChooser />
    </div>
  );
}
