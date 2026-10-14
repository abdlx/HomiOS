import React, { useState, useEffect } from 'react';
import {
  Activity, BatteryFull, Command, Cpu, HardDrive, Monitor, Search, Wifi, Zap, Bell
} from 'lucide-react';
import { motion } from 'motion/react';
import { useWallpaper } from '../hooks/useWallpaper';
import { useUsername } from '../hooks/useUsername';
import { usePerformanceSettings } from '../hooks/usePerformanceSettings';
import { FloatingDock } from './ui/floating-dock';
import { AppIcon } from './icons/AppIcons';
import GlassSurface from '../../components/GlassSurface';
import NotificationCenter from './NotificationCenter';
import PWAInstallChooser from './PWAInstallChooser';
import PowerControls from './PowerControls';
import { useSystemStats } from '../hooks/useSystemStats';
import { useLauncherApps } from '../hooks/useLauncherApps';
import { useLauncherLayout } from '../hooks/useLauncherLayout';
import { FACTORY_DOCK_APPS, openLauncherUrl, type LauncherApp } from '../lib/launcher-apps';
import { useShellRoute } from '../hooks/useShellNavigation';

interface DesktopEnvironmentProps {
  isActive?: boolean;
  onHomiOS: () => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
  onOpenActivity: () => void;
  onOpenCoolify: () => void;
  onOpenImmich: () => void;
  onOpenNotes: () => void;
  onOpenVSCode: () => void;
  onOpenCodex: () => void;
  onOpenSearch: () => void;
  onOpenAppStore: () => void;
  username?: string;
}

type DesktopAppSource = 'grid' | 'dock';

type DesktopAppConfig = LauncherApp;

const HeaderMetricsBackdrop = React.memo(function HeaderMetricsBackdrop({ glassSurfaces }: { glassSurfaces: boolean }) {
  return glassSurfaces ? (
    <><GlassSurface width="100%" height="100%" borderRadius={28} distortionScale={300} opacity={1} borderWidth={0.07} displace={4} backgroundOpacity={0.45} blur={28} /><div className="absolute inset-0 rounded-[28px] bg-black/15" /></>
  ) : (
    <div className="h-full w-full rounded-[28px] border border-white/10 bg-black/35 shadow-[0_16px_40px_rgba(0,0,0,0.22)] backdrop-blur-md" />
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
  onClick,
  ariaLabel,
}: {
  icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  label: string;
  value: string;
  progress: number;
  tone: keyof typeof METRIC_TONES;
  detail?: React.ReactNode;
  onClick?: () => void;
  ariaLabel: string;
}) {
  const colors = METRIC_TONES[tone];
  const safeProgress = Math.min(100, Math.max(0, Number.isFinite(progress) ? progress : 0));

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="desktop-metric desktop-metric-in-bar group"
    >
      <div>
        <div className="flex items-center gap-3.5">
          <div className={`w-9 h-9 shrink-0 rounded-xl border flex items-center justify-center transition-transform group-hover:scale-105 ${colors.icon}`}>
            <Icon size={19} strokeWidth={1.9} />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-white/55 leading-none mb-2">{label}</p>
            <p className="text-[24px] font-semibold leading-none tracking-tight text-white tabular-nums">{value}</p>
          </div>
        </div>
        <div className="mt-3.5 h-[4px] overflow-hidden rounded-full bg-white/20">
          <div className={`h-full rounded-full transition-[width] duration-700 ${colors.bar}`} style={{ width: `${safeProgress}%` }} />
        </div>
      </div>
      {detail && <div className="mt-3 text-[11px] leading-tight text-white/45 truncate">{detail}</div>}
    </button>
  );
});

const DesktopAppArtwork = React.memo(function DesktopAppArtwork({
  app,
  className,
}: {
  app: DesktopAppConfig;
  className: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);

  if (app.iconUrl && !imageFailed) {
    return (
      <span
        className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-[23%] border border-white/35 ${app.id === 'vscode' ? 'bg-gradient-to-br from-violet-600 to-blue-600 p-[14%]' : 'bg-white p-[6%]'} shadow-[inset_0_1px_2px_rgba(255,255,255,0.8)]`}
        aria-hidden="true"
      >
        <img
          src={app.iconUrl}
          alt=""
          draggable={false}
          className="h-full w-full object-contain"
          onError={() => setImageFailed(true)}
        />
      </span>
    );
  }

  return <AppIcon id={app.id} colorClass={app.color} className={className} />;
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
  const sizeClass = source === 'dock' ? 'w-[48px] h-[48px]' : 'desktop-app-artwork';

  return (
    <motion.div
      role="button" tabIndex={0} aria-label={`Open ${app.label}`} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick?.(); } }} className="relative group cursor-pointer flex flex-col items-center text-center select-none"
      onClick={onClick}
      onContextMenu={(e) => onContextMenu(e, app.id, source)}
      draggable
      onDragStart={(e) => onDragStart(e as unknown as React.DragEvent, app.id, source)}
      onDragOver={(e) => onDragOver(e as unknown as React.DragEvent, app.id, source)}
      onDrop={(e) => onDrop(e as unknown as React.DragEvent, app.id, source)}
      whileHover={!reduceMotion && source === 'grid' ? { scale: 1.03, y: -3 } : undefined}
      whileTap={reduceMotion ? undefined : { scale: 0.92, y: 0 }}
      transition={reduceMotion ? { duration: 0.1 } : { type: "spring", stiffness: 350, damping: 18 }}
    >
      {source === 'dock' && (
        <span className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-lg bg-black/80 backdrop-blur-md text-white text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-200 shadow-lg border border-white/10">
          {app.label}
        </span>
      )}
      <DesktopAppArtwork app={app} className={`${sizeClass} mb-2 drop-shadow-[0_8px_18px_rgba(0,0,0,0.45)]`} />
      {source === 'grid' && (
        <div className="flex flex-col items-center min-h-[32px]">
          <span className="text-white text-[13px] font-semibold tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-center leading-tight truncate max-w-[88px]">
            {app.label}
          </span>
          {app.subtitle && (
            <span className="text-white/70 text-[10px] font-medium tracking-tight drop-shadow truncate max-w-[88px] mt-0.5">
              {app.subtitle}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
});

export default function DesktopEnvironment({
  isActive = true, username: initialUsername,
  onHomiOS, onOpenSettings, onOpenTerminal, onOpenActivity, onOpenCoolify,
  onOpenImmich, onOpenNotes, onOpenVSCode, onOpenCodex, onOpenSearch, onOpenAppStore
}: DesktopEnvironmentProps) {
  const { wallpaper } = useWallpaper();
  const { username } = useUsername(initialUsername);
  const { settings: performanceSettings } = usePerformanceSettings();
  const { data: stats } = useSystemStats(isActive, performanceSettings.backgroundPolling);
  const availableApps = useLauncherApps(isActive);
  const { gridAppIds, dockAppIds, updateGrid, updateDock } = useLauncherLayout(availableApps);
  const { navigate } = useShellRoute();
  const [now, setNow] = useState<Date | null>(null);
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
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const getOnClick = (id: string) => {
    const app = availableApps[id];
    if (app?.installedId) return () => {
      if (!openLauncherUrl(app)) navigate({ view: 'app-store', storeApp: app.installedId });
    };
    if (id === 'files') return onHomiOS;
    if (id === 'settings') return onOpenSettings;
    if (id === 'terminal') return onOpenTerminal;
    if (id === 'activity') return onOpenActivity;
    if (id === 'coolify') return onOpenCoolify;
    if (id === 'immich') return onOpenImmich;
    if (id === 'notes') return onOpenNotes;
    if (id === 'vscode') return onOpenVSCode;
    if (id === 'codex') return onOpenCodex;
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
    e.dataTransfer.setData('application/homios-app', JSON.stringify({ id: appId, source }));
  };

  const readDraggedApp = (e: React.DragEvent) => {
    if (draggingApp) return draggingApp;
    try {
      const raw = e.dataTransfer.getData('application/homios-app');
      return raw ? JSON.parse(raw) as { id: string; source: DesktopAppSource } : null;
    } catch {
      return null;
    }
  };

  const handleAppDragOver = (e: React.DragEvent) => {
    if (draggingApp || e.dataTransfer.types.includes('application/homios-app')) {
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
    <div
      className="h-screen w-full flex flex-col bg-cover bg-center overflow-hidden font-sans relative text-white transition-all duration-1000"
      style={{ backgroundImage: `url('${wallpaper}')` }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/35 via-black/15 to-black/30" />

      {/* Top Menu Bar */}
      <div className="desktop-menubar relative hidden md:flex items-center justify-between h-11 px-6 bg-black/15 backdrop-blur-2xl text-white/90 text-[12px] border-b border-white/5 select-none shrink-0">
        <div className="flex items-center space-x-5">
          <div className="flex items-center space-x-2 cursor-pointer hover:opacity-90 transition" onClick={onHomiOS} title="HomiOS">
            <img src="/icon/homios-icon.svg" alt="HomiOS" className="w-4 h-4 object-contain drop-shadow-sm" />
            <span className="font-semibold tracking-tight">HomiOS</span>
          </div>
          <button type="button" onClick={onHomiOS} className="font-medium text-white/70 hover:text-white transition">Files</button>
          <button type="button" onClick={onOpenSettings} className="font-medium text-white/70 hover:text-white transition">Storage</button>
          <button type="button" onClick={onOpenSettings} className="font-medium text-white/70 hover:text-white transition">Backups</button>
          <button type="button" onClick={onOpenActivity} className="font-medium text-white/70 hover:text-white transition">Activity</button>
          <button type="button" onClick={onOpenSettings} className="font-medium text-white/70 hover:text-white transition">Settings</button>
        </div>
        <div className="flex items-center space-x-4">
          <PowerControls />
          <Wifi size={15} strokeWidth={2} className="text-white/80" />
          <BatteryFull size={17} strokeWidth={2} className="text-white/80" />
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-1 text-white/80 hover:text-white transition"
            title="Search HomiOS (⌘K)"
          >
            <Search size={14} strokeWidth={2.4} />
          </button>
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
          {now && (
            <span className="font-medium tabular-nums tracking-tight">
              {now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} {now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      <NotificationCenter open={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} onUnreadChange={setUnreadNotifications} />

      <div inert={!isActive} className="relative flex-1 flex flex-col items-center pt-6 md:pt-6 px-4 md:px-8 overflow-y-auto w-full hide-scrollbar">
        {/* Header with Greeting & Actionable Telemetry Cards */}
        <header className="w-full max-w-[980px] mb-4 md:mb-5">
          <div className="text-center">
            <h1 className="text-[28px] md:text-[36px] leading-tight font-semibold tracking-[-0.03em] text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.4)]">
              {greeting}, {username || 'User'}
            </h1>
            <p className="mt-1 text-xs md:text-[14px] font-medium tracking-wide text-slate-300/80 drop-shadow">
              {now ? now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) : '\u00a0'}
            </p>
          </div>

          {/* Actionable Telemetry Grid */}
          <div className="relative isolate mt-5 overflow-hidden rounded-[28px] shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
            <div className="pointer-events-none absolute inset-0 -z-10">
              <HeaderMetricsBackdrop glassSurfaces={performanceSettings.glassSurfaces} />
            </div>
            <div className="desktop-metrics-grid grid grid-cols-2 lg:grid-cols-4 divide-x divide-white/10">
              {/* CPU -> Activity */}
              <HeaderMetric
                icon={Activity}
                label="CPU"
                value={stats ? `${cpuPercent.toFixed(0)}%` : '—'}
                progress={cpuPercent}
                tone="blue"
                onClick={onOpenActivity}
                ariaLabel="View CPU activity in Task Manager"
                detail={<span className="truncate">{stats?.cpu?.model || 'Processor details'}</span>}
              />

              {/* Memory -> System */}
              <HeaderMetric
                icon={Cpu}
                label="Memory"
                value={stats ? `${toGiB(stats.memory.used)} GB` : '—'}
                progress={memoryPercent}
                tone="violet"
                onClick={onOpenActivity}
                ariaLabel="View memory usage in Task Manager"
                detail={<span>{memoryPercent.toFixed(0)}% used of {stats ? `${toGiB(stats.memory.total)} GB` : '—'}</span>}
              />

              {/* Storage -> Storage Dashboard */}
              <HeaderMetric
                icon={HardDrive}
                label="Storage"
                value={stats ? `${toGiB(stats.disk.used)} GB` : '—'}
                progress={storagePercent}
                tone="emerald"
                onClick={onOpenSettings}
                ariaLabel="Open Storage Manager & drive settings"
                detail={<span>{storagePercent.toFixed(0)}% used of {stats ? `${toGiB(stats.disk.total)} GB` : '—'}</span>}
              />

              {/* System Load -> Activity */}
              <HeaderMetric
                icon={Zap}
                label="System Load"
                value={stats ? load.toFixed(2) : '—'}
                progress={loadPercent}
                tone="rose"
                onClick={onOpenActivity}
                ariaLabel="View system load metrics in Task Manager"
                detail={(
                  <span className="flex items-center gap-2">
                    <span>{stats?.cpu?.cores || 0} Cores</span>
                    <span className="text-white/35">•</span>
                    <span className="inline-flex items-center gap-1"><Monitor size={11} />{stats?.os?.platform || 'Host'}</span>
                  </span>
                )}
              />
            </div>
          </div>
        </header>

        {/* Desktop App Launcher Grid */}
        <div
          className="desktop-app-grid flex flex-wrap justify-center w-full max-w-[880px] mb-8"
          onDragOver={handleAppDragOver}
          onDrop={(e) => handleAppDrop(e, undefined, 'grid')}
        >
          {gridAppIds.map((id) => {
            const app = availableApps[id];
            return app ? (
              <div key={app.id} className="desktop-app-cell flex flex-col items-center">
                <DashboardAppIcon
                  app={app}
                  source="grid"
                  onClick={getOnClick(app.id)}
                  onContextMenu={handleContextMenu}
                  onDragStart={handleAppDragStart}
                  onDragOver={(e) => handleAppDragOver(e)}
                  onDrop={(e, appId) => handleAppDrop(e, appId, 'grid')}
                  reduceMotion={performanceSettings.reduceMotion}
                />
              </div>
            ) : null;
          })}
          <div className="desktop-app-cell flex flex-col items-center">
            <motion.button
              type="button"
              onClick={onOpenAppStore}
              whileHover={performanceSettings.reduceMotion ? undefined : { scale: 1.03, y: -3 }}
              whileTap={performanceSettings.reduceMotion ? undefined : { scale: 0.97 }}
              className="group flex flex-col items-center"
              aria-label="Open App Store"
            >
              <AppIcon
                id="app-store"
                className="desktop-app-artwork mb-3 drop-shadow-[0_8px_18px_rgba(0,0,0,0.25)]"
              />
              <span className="text-[13px] font-semibold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">App Store</span>
            </motion.button>
          </div>
        </div>
      </div>

      {/* Dock and Spotlight Search Pill */}
      <div inert={!isActive} className="relative pb-3 flex flex-col items-center w-full mt-auto">
        <motion.button
          layoutId="homios-search-pill"
          onClick={onOpenSearch}
          whileHover={performanceSettings.reduceMotion ? undefined : { scale: 1.04, y: -2 }}
          whileTap={performanceSettings.reduceMotion ? undefined : { scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 350, damping: 24 }}
          className="group mb-2 inline-flex h-7 items-center gap-2 rounded-full border border-white/20 bg-black/45 px-3 text-[11px] font-medium text-white/90 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-2xl hover:bg-black/60 hover:text-white transition-all cursor-pointer"
          aria-label="Open Search (⌘K)"
        >
          <Search size={11.5} strokeWidth={2.2} className="text-white/70 group-hover:text-white transition-colors" />
          <span>Search</span>
          <kbd className="rounded-[4px] border border-white/20 bg-white/10 px-1 py-[1px] text-[9px] font-mono text-white/60">⌘K</kbd>
        </motion.button>

        <div onDragOver={handleAppDragOver} onDrop={(e) => handleAppDrop(e, undefined, 'dock')}>
          <FloatingDock
            glassSurfaces={performanceSettings.glassSurfaces}
            reduceMotion={performanceSettings.reduceMotion}
            desktopClassName="transition-colors duration-500 hover:z-[100] z-0"
            items={dockAppIds.map((id) => {
              const app = availableApps[id];
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
                    <DesktopAppArtwork app={app} className="h-full w-full drop-shadow-[0_5px_12px_rgba(0,0,0,0.45)]" />
                  </div>
                ),
                href: "#",
              };
            }).filter(Boolean) as any[]}
          />
        </div>
      </div>

      {contextMenu && (
        <div
          className="fixed z-[100] bg-[#1c1c1e]/95 backdrop-blur-xl border border-white/15 rounded-xl shadow-2xl py-1 w-48 overflow-hidden"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          {contextMenu.source === 'grid' ? (
            <>
              <button className="w-full text-left px-4 py-2 text-sm text-white hover:bg-blue-600 transition" onClick={() => { if (!dockAppIds.includes(contextMenu.appId)) updateDock([...dockAppIds, contextMenu.appId]); setContextMenu(null); }}>Add to Dock</button>
              <button className="w-full text-left px-4 py-2 text-sm text-white hover:bg-red-600 transition" onClick={() => { updateGrid(gridAppIds.filter(id => id !== contextMenu.appId)); setContextMenu(null); }}>Remove from Desktop</button>
            </>
          ) : (
            <>
              <button className={`w-full text-left px-4 py-2 text-sm text-white ${gridAppIds.includes(contextMenu.appId) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-600 transition'}`} disabled={gridAppIds.includes(contextMenu.appId)} onClick={() => { if (!gridAppIds.includes(contextMenu.appId)) updateGrid([...gridAppIds, contextMenu.appId]); setContextMenu(null); }}>Add to Desktop</button>
              <button className={`w-full text-left px-4 py-2 text-sm text-white ${FACTORY_DOCK_APPS.includes(contextMenu.appId) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-red-600 transition'}`} disabled={FACTORY_DOCK_APPS.includes(contextMenu.appId)} onClick={() => { if (!FACTORY_DOCK_APPS.includes(contextMenu.appId)) updateDock(dockAppIds.filter(id => id !== contextMenu.appId)); setContextMenu(null); }}>Remove from Dock</button>
            </>
          )}
        </div>
      )}
      <PWAInstallChooser />
    </div>
  );
}
