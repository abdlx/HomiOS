import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'motion/react';
import {
  Folder, FolderOpen, Settings, Terminal, Activity, Boxes,
  FileText, Code, Battery, Wifi,
  Signal, Download, Search, ChevronRight, Sparkles, Images
} from 'lucide-react';
import PWAInstallChooser, { PWAInstallButton } from './PWAInstallChooser';
import { usePWAInstall } from '../hooks/usePWAInstall';

const ALL_APPS = [
  { id: 'files',    label: 'Files',     icon: Folder,     color: 'from-[#3A3A3E] to-[#1C1C1E]' },
  { id: 'notes',    label: 'Notes',     icon: FileText,   color: 'from-[#F59E0B] to-[#D97706]' },
  { id: 'settings', label: 'Settings',  icon: Settings,   color: 'from-[#8E8E93] to-[#48484A]' },
  { id: 'terminal', label: 'Terminal',  icon: Terminal,   color: 'from-[#2C2C2E] to-[#1C1C1E]' },
  { id: 'activity', label: 'Activity',  icon: Activity,   color: 'from-[#32ADE6] to-[#12648A]' },
  { id: 'coolify',  label: 'Coolify',   icon: Boxes,      color: 'from-[#8C52FF] to-[#5B13D5]' },
  { id: 'immich',   label: 'Immich',    icon: Images,     color: 'from-[#D946EF] via-[#F43F5E] to-[#F59E0B]' },
  { id: 'vscode',   label: 'VS Code',   icon: Code,       color: 'from-[#0066b8] to-[#007acc]' },
  { id: 'codex',    label: 'Codex',     icon: Sparkles,   color: 'from-[#17BE92] to-[#0A6F55]' },
];

const DOCK_IDS = ['files', 'notes', 'settings'];
const APPS_PER_PAGE = 16; // 4x4 grid

interface MobileLauncherProps {
  onHomiOS: () => void;
  onOpenSettings: () => void;
  onOpenTerminal: () => void;
  onOpenActivity: () => void;
  onOpenCoolify: () => void;
  onOpenImmich: () => void;
  onOpenNotes: () => void;
  onOpenVSCode: () => void;
  onOpenCodex: () => void;
  username?: string;
  wallpaper?: string;
}

function MobileStatusBar({ now }: { now: Date | null }) {
  return (
    <div className="relative z-30 flex items-center justify-between px-6 pt-safe-top"
         style={{ paddingTop: 'max(env(safe-area-inset-top), 14px)', height: 'max(calc(env(safe-area-inset-top) + 28px), 52px)' }}>
      <span className="text-white font-semibold text-[15px] tracking-tight tabular-nums">
        {now ? now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}
      </span>
      <div className="flex items-center gap-1.5 text-white">
        <Signal size={13} strokeWidth={2.5} />
        <Wifi size={14} strokeWidth={2.5} />
        <Battery size={16} strokeWidth={2.5} />
      </div>
    </div>
  );
}

function AppIcon({ app, onClick, size = 'md' }: {
  app: typeof ALL_APPS[0];
  onClick: () => void;
  size?: 'sm' | 'md';
}) {
  const Icon = app.icon;
  const s = size === 'sm'
    ? { box: 'w-[54px] h-[54px] rounded-[14px]', icon: 22, label: 'text-[11px]' }
    : { box: 'w-[62px] h-[62px] rounded-[17px]', icon: 28, label: 'text-[11.5px]' };

  return (
    <motion.div
      className="flex flex-col items-center gap-1.5 cursor-pointer select-none"
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      transition={{ type: 'spring', stiffness: 500, damping: 25 }}
    >
      <div className={`${s.box} bg-gradient-to-b ${app.color} flex items-center justify-center shadow-[0_4px_14px_rgba(0,0,0,0.45),inset_0_1px_3px_rgba(255,255,255,0.3)] relative overflow-hidden`}>
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/8 to-white/25 pointer-events-none" />
        <Icon size={s.icon} strokeWidth={1.5} className="text-white drop-shadow z-10" />
      </div>
      <span className={`${s.label} font-medium text-white/90 drop-shadow-sm tracking-tight leading-tight text-center`}>{app.label}</span>
    </motion.div>
  );
}

function AppGrid({ apps, getOnClick }: { apps: typeof ALL_APPS; getOnClick: (id: string) => () => void }) {
  const pages: (typeof ALL_APPS)[] = [];
  for (let i = 0; i < apps.length; i += APPS_PER_PAGE) {
    pages.push(apps.slice(i, i + APPS_PER_PAGE));
  }

  const [page, setPage] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - startXRef.current;
    if (Math.abs(dx) > 50) {
      if (dx < 0 && page < pages.length - 1) setPage(p => p + 1);
      if (dx > 0 && page > 0) setPage(p => p - 1);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-center">
      <div
        ref={containerRef}
        className="overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={page}
            initial={{ x: 60, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            className="grid grid-cols-4 gap-y-6 gap-x-4 px-6"
          >
            {pages[page]?.map(app => (
              <div key={app.id} className="flex justify-center">
                <AppIcon app={app} onClick={getOnClick(app.id)} />
              </div>
            ))}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Page dots */}
      {pages.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-6">
          {pages.map((_, i) => (
            <div
              key={i}
              onClick={() => setPage(i)}
              className={`rounded-full transition-all duration-300 cursor-pointer ${i === page ? 'w-5 h-1.5 bg-white' : 'w-1.5 h-1.5 bg-white/40'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MobileDock({ apps, getOnClick }: { apps: typeof ALL_APPS; getOnClick: (id: string) => () => void }) {
  return (
    <div className="px-4 pb-2" style={{ paddingBottom: 'max(calc(env(safe-area-inset-bottom) + 8px), 16px)' }}>
      <div className="flex justify-around items-center px-4 py-3 rounded-[26px] bg-white/15 backdrop-blur-2xl border border-white/20 shadow-[0_4px_24px_rgba(0,0,0,0.3)]">
        {apps.map(app => (
          <AppIcon key={app.id} app={app} onClick={getOnClick(app.id)} size="sm" />
        ))}
      </div>
      {/* Home indicator */}
      <div className="flex justify-center mt-2.5">
        <div className="w-32 h-1 rounded-full bg-white/50" />
      </div>
    </div>
  );
}

export default function MobileLauncher({
  onHomiOS, onOpenSettings, onOpenTerminal, onOpenActivity,
  onOpenCoolify, onOpenImmich, onOpenNotes, onOpenVSCode, onOpenCodex,
  username, wallpaper
}: MobileLauncherProps) {
  const [now, setNow] = useState<Date | null>(null);
  const { canInstall, openChooser, isStandalone } = usePWAInstall();

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  const getOnClick = useCallback((id: string) => {
    const map: Record<string, () => void> = {
      files: onHomiOS,
      settings: onOpenSettings, terminal: onOpenTerminal,
      activity: onOpenActivity, coolify: onOpenCoolify, immich: onOpenImmich,
      notes: onOpenNotes,
      vscode: onOpenVSCode, codex: onOpenCodex,
    };
    return map[id] || (() => {});
  }, [onHomiOS, onOpenSettings, onOpenTerminal, onOpenActivity, onOpenCoolify, onOpenImmich, onOpenNotes, onOpenVSCode, onOpenCodex]);

  const gridApps = ALL_APPS.filter(a => !DOCK_IDS.includes(a.id));
  const dockApps = ALL_APPS.filter(a => DOCK_IDS.includes(a.id));

  const greeting = now
    ? (now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening')
    : 'Welcome';

  return (
    <div
      className="h-full w-full flex flex-col overflow-hidden relative"
      style={{ backgroundImage: wallpaper ? `url('${wallpaper}')` : 'linear-gradient(135deg,#1a1a2e 0%,#16213e 50%,#0f3460 100%)', backgroundSize: 'cover', backgroundPosition: 'center' }}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/5 to-black/30 pointer-events-none" />

      <MobileStatusBar now={now} />

      {/* Greeting */}
      <div className="relative z-10 px-6 mt-3 mb-2">
        <p className="text-white/70 text-[14px] font-medium">{greeting},</p>
        <h1 className="text-white text-[28px] font-bold tracking-tight leading-tight">{username || 'User'}</h1>

        {/* Install button */}
        {!isStandalone && canInstall && (
          <button
            onClick={openChooser}
            className="mt-2 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white text-[12px] font-semibold active:bg-white/25 transition-all"
          >
            <Download size={12} strokeWidth={2.5} />
            <span>Install App</span>
          </button>
        )}
      </div>

      {/* App grid */}
      <div className="relative z-10 flex-1 flex flex-col min-h-0">
        <AppGrid apps={gridApps} getOnClick={getOnClick} />
      </div>

      {/* Dock */}
      <div className="relative z-10">
        <MobileDock apps={dockApps} getOnClick={getOnClick} />
      </div>

      <PWAInstallChooser />
    </div>
  );
}
