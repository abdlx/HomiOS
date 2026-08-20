import React, { useState, useEffect, useReducer } from 'react';
import dynamic from 'next/dynamic';
import DesktopEnvironment from './DesktopEnvironment';
import MobileLauncher from './MobileLauncher';
import App from '../App';
import SettingsApp from './SettingsApp';
import ActivityApp from './ActivityApp';

import NotesApp from './NotesApp';
import VSCodeApp from './VSCodeApp';
import CodexApp from './CodexApp';
import CoolifyApp from './CoolifyApp';
import ImmichApp from './ImmichApp';
import CommandPalette from './CommandPalette';
import { TransferTask } from '../types';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { usePerformanceSettings } from '../hooks/usePerformanceSettings';
import { useWallpaper } from '../hooks/useWallpaper';
import { JobActivityProvider } from '../hooks/useJobActivity';
import TransferActivityPanel from './TransferActivityPanel';

const TerminalApp = dynamic(() => import('./TerminalApp'), { ssr: false });
interface WindowManagerProps {
  initialView?: 'desktop' | 'files' | 'settings' | 'terminal' | 'activity' | 'notes' | 'vscode' | 'codex' | 'coolify' | 'immich';
  username?: string;
}

type WindowMode = 'normal' | 'fullscreen';
type WindowState = { activeView: string; openedViews: string[]; modes: Record<string, WindowMode> };
type WindowAction =
  | { type: 'hydrate'; openedViews: string[]; modes: Record<string, WindowMode> }
  | { type: 'open'; view: string }
  | { type: 'close'; view: string }
  | { type: 'minimize'; view: string }
  | { type: 'toggle-fullscreen'; view: string };

function windowReducer(state: WindowState, action: WindowAction): WindowState {
  if (action.type === 'hydrate') {
    return {
      ...state,
      openedViews: Array.from(new Set([...action.openedViews, ...state.openedViews])),
      modes: action.modes,
    };
  }
  if (action.type === 'open') {
    if (action.view === 'desktop') return { ...state, activeView: 'desktop' };
    return {
      ...state,
      activeView: action.view,
      openedViews: state.openedViews.includes(action.view) ? state.openedViews : [...state.openedViews, action.view],
    };
  }
  if (action.type === 'close') {
    return { ...state, activeView: 'desktop', openedViews: state.openedViews.filter((view) => view !== action.view) };
  }
  if (action.type === 'minimize') return { ...state, activeView: 'desktop' };
  return {
    ...state,
    modes: { ...state.modes, [action.view]: state.modes[action.view] === 'fullscreen' ? 'normal' : 'fullscreen' },
  };
}

function initialWindowState(initialView: string): WindowState {
  return {
    activeView: initialView,
    openedViews: initialView === 'desktop' ? [] : [initialView],
    modes: {},
  };
}

function WindowTrafficLights({ onClose, onMinimize, onZoom }: { onClose: () => void; onMinimize: () => void; onZoom: () => void }) {
  return (
    <div className="absolute left-4 top-4 z-[120] hidden items-center gap-2 md:flex">
      <button onClick={onClose} className="h-3 w-3 rounded-full border border-[#e0443e] bg-[#ff5f56] hover:brightness-90" title="Close" aria-label="Close window" />
      <button onClick={onMinimize} className="h-3 w-3 rounded-full border border-[#dfa123] bg-[#ffbd2e] hover:brightness-90" title="Minimize" aria-label="Minimize window" />
      <button onClick={onZoom} className="h-3 w-3 rounded-full border border-[#1aab29] bg-[#27c93f] hover:brightness-90" title="Zoom" aria-label="Toggle full screen" />
    </div>
  );
}

function WindowManagerShell({ initialView = 'desktop', username = 'User' }: WindowManagerProps) {
  const [windowState, dispatchWindow] = useReducer(windowReducer, initialView, initialWindowState);
  const [windowStateHydrated, setWindowStateHydrated] = useState(false);
  const view = windowState.activeView;
  const setView = (nextView: string) => dispatchWindow({ type: 'open', view: nextView });
  const [transfers, setTransfers] = useState<TransferTask[]>([]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const { settings: performanceSettings } = usePerformanceSettings();
  const { wallpaper } = useWallpaper();
  const hasActiveTransfers = transfers.some(task => task.status === 'uploading' || task.status === 'pending' || task.status === 'paused');
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('openfinder_window_state') || '{}');
      dispatchWindow({
        type: 'hydrate',
        openedViews: Array.isArray(saved.openedViews) ? saved.openedViews : [],
        modes: saved.modes && typeof saved.modes === 'object' ? saved.modes : {},
      });
    } catch {}
    setWindowStateHydrated(true);
  }, []);

  useEffect(() => {
    if (!windowStateHydrated) return;
    localStorage.setItem('openfinder_window_state', JSON.stringify({
      openedViews: windowState.openedViews,
      modes: windowState.modes,
    }));
  }, [windowState.openedViews, windowState.modes, windowStateHydrated]);

  const frameClass = (appId: string, zClass: string) => {
    const fullscreen = windowState.modes[appId] === 'fullscreen';
    return `absolute ${zClass} ${fullscreen ? 'inset-0 [&>div]:md:rounded-none' : 'max-md:inset-0 md:top-7 md:bottom-[104px] md:left-0 md:right-0 md:origin-bottom'} shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] ${view === appId ? 'pointer-events-auto' : 'pointer-events-none'}`;
  };

  const handleChromeCapture = (appId: string, event: React.MouseEvent) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[title]');
    if (!button) return;
    const classes = button.className?.toString() || '';
    const isTrafficLight = classes.includes('rounded-full') && classes.includes('w-3') && classes.includes('h-3');
    if (!isTrafficLight) return;
    const title = button.getAttribute('title');
    if (title === 'Minimize') {
      event.preventDefault();
      event.stopPropagation();
      dispatchWindow({ type: 'minimize', view: appId });
    } else if (title === 'Zoom') {
      event.preventDefault();
      event.stopPropagation();
      dispatchWindow({ type: 'toggle-fullscreen', view: appId });
    } else if (title === 'Close') {
      event.preventDefault();
      event.stopPropagation();
      dispatchWindow({ type: 'close', view: appId });
    }
  };

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const windowVariants = {
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: performanceSettings.reduceMotion
        ? { duration: 0.12, ease: "easeOut" as const }
        : { type: "spring" as const, stiffness: 350, damping: 25, mass: 0.5 },
    },
    hidden: {
      opacity: 0,
      scale: performanceSettings.reduceMotion ? 1 : 0.92,
      y: performanceSettings.reduceMotion ? 0 : 32,
      transition: { duration: performanceSettings.reduceMotion ? 0.1 : 0.2, ease: "easeOut" as const },
    },
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const handleTransfers = (event: Event) => {
      setTransfers((event as CustomEvent<TransferTask[]>).detail || []);
    };
    window.addEventListener('openfinder:transfers', handleTransfers);
    return () => window.removeEventListener('openfinder:transfers', handleTransfers);
  }, []);

  useEffect(() => {
    // When view changes, seamlessly update URL without reloading
    if (view === 'desktop') {
      window.history.pushState(null, '', '/dashboard');
    } else if (view === 'files') {
      window.history.pushState(null, '', '/files');
    } else if (view === 'settings') {
      window.history.pushState(null, '', '/settings');
    } else if (view === 'terminal') {
      window.history.pushState(null, '', '/terminal');
    } else if (view === 'activity') {
      window.history.pushState(null, '', '/activity');
    } else if (view === 'notes') {
      window.history.pushState(null, '', '/notes');
    } else if (view === 'vscode') {
      window.history.pushState(null, '', '/vscode');
    } else if (view === 'codex') {
      // /codex is served by the codex-web-ui proxy, so a refresh here opens
      // the full-page Codex app rather than the desktop — both are valid entries.
      window.history.pushState(null, '', '/codex');
    } else if (view === 'coolify') {
      window.history.pushState(null, '', '/coolify');
    } else if (view === 'immich') {
      window.history.pushState(null, '', '/immich');
    }
  }, [view]);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      <CommandPalette
        open={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenView={(nextView) => setView(nextView)}
      />
      <TransferActivityPanel />

      {transfers.length > 0 && (() => {
        const active = transfers.filter(task => task.status === 'uploading' || task.status === 'pending');
        const failed = transfers.filter(task => task.status === 'error');
        const completed = transfers.filter(task => task.status === 'completed');
        const visibleTasks = active.length > 0 ? active : failed.length > 0 ? failed : completed;
        const current = visibleTasks[visibleTasks.length - 1];
        const progress = active.length > 0
          ? Math.round(active.reduce((sum, task) => sum + task.progress, 0) / active.length)
          : current?.progress ?? 100;
        const Icon = active.length > 0 ? Loader2 : failed.length > 0 ? XCircle : CheckCircle;

        return (
          <button
            onClick={() => setView('files')}
            className="fixed top-1 right-3 z-[200] hidden md:flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-1 text-[12px] text-white/90 shadow-lg backdrop-blur-xl hover:bg-black/70 transition-colors"
            title="Open Files transfers"
          >
            <Icon size={13} className={active.length > 0 ? 'animate-spin text-blue-300' : failed.length > 0 ? 'text-red-300' : 'text-emerald-300'} />
            <span className="font-semibold">
              {active.length > 0 ? `${active.length} transfer${active.length === 1 ? '' : 's'}` : failed.length > 0 ? 'Transfer failed' : 'Transfers done'}
            </span>
            <span className="text-white/60 truncate max-w-[140px]">{current?.name}</span>
            <span className="font-mono text-white/75">{progress}%</span>
          </button>
        );
      })()}

      {/* Home Screen - Mobile uses native launcher, desktop uses DesktopEnvironment */}
      <div className="absolute inset-0">
        {isMobile ? (
          <MobileLauncher
            onOpenFinder={() => setView('files')}
            onOpenSettings={() => setView('settings')}
            onOpenTerminal={() => setView('terminal')}
            onOpenActivity={() => setView('activity')}
            onOpenCoolify={() => setView('coolify')}
            onOpenImmich={() => setView('immich')}
            onOpenNotes={() => setView('notes')}
            onOpenVSCode={() => setView('vscode')}
            onOpenCodex={() => setView('codex')}
            username={username}
            wallpaper={wallpaper}
          />
        ) : (
          <DesktopEnvironment
            onOpenFinder={() => setView('files')}
            onOpenSettings={() => setView('settings')}
            onOpenTerminal={() => setView('terminal')}
            onOpenActivity={() => setView('activity')}
            onOpenCoolify={() => setView('coolify')}
            onOpenImmich={() => setView('immich')}
            onOpenNotes={() => setView('notes')}
            onOpenVSCode={() => setView('vscode')}
            onOpenCodex={() => setView('codex')}
            onOpenSearch={() => setIsCommandPaletteOpen(true)}
            username={username}
          />
        )}
      </div>

      {/* Files App overlay */}
      <motion.div
        initial={false}
        animate={view === 'files' ? "visible" : "hidden"}
        variants={windowVariants}
        className={frameClass('files', 'z-10')}
        onClickCapture={(event) => handleChromeCapture('files', event)}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          {(windowState.openedViews.includes('files') || hasActiveTransfers) && <App onClose={() => dispatchWindow({ type: 'close', view: 'files' })} />}
        </div>
      </motion.div>

      {/* Settings App overlay */}
      <motion.div
        initial={false}
        animate={view === 'settings' ? "visible" : "hidden"}
        variants={windowVariants}
        className={frameClass('settings', 'z-20')}
        onClickCapture={(event) => handleChromeCapture('settings', event)}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          {windowState.openedViews.includes('settings') && <SettingsApp onClose={() => dispatchWindow({ type: 'close', view: 'settings' })} />}
        </div>
      </motion.div>

      {/* Terminal App overlay */}
      <motion.div
        initial={false}
        animate={view === 'terminal' ? "visible" : "hidden"}
        variants={windowVariants}
        className={frameClass('terminal', 'z-30')}
        onClickCapture={(event) => handleChromeCapture('terminal', event)}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-gray-50 dark:bg-[#161618] shadow-2xl relative">
          {windowState.openedViews.includes('terminal') && <TerminalApp onClose={() => dispatchWindow({ type: 'close', view: 'terminal' })} />}
        </div>
      </motion.div>

      {/* Activity App overlay */}
      <motion.div
        initial={false}
        animate={view === 'activity' ? "visible" : "hidden"}
        variants={windowVariants}
        className={frameClass('activity', 'z-40')}
        onClickCapture={(event) => handleChromeCapture('activity', event)}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-gray-50 dark:bg-[#161618] shadow-2xl relative">
          {windowState.openedViews.includes('activity') && <ActivityApp onClose={() => dispatchWindow({ type: 'close', view: 'activity' })} isActive={view === 'activity'} />}
        </div>
      </motion.div>

      {/* Notes App overlay */}
      <motion.div
        initial={false}
        animate={view === 'notes' ? "visible" : "hidden"}
        variants={windowVariants}
        className={frameClass('notes', 'z-50')}
        onClickCapture={(event) => handleChromeCapture('notes', event)}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          {windowState.openedViews.includes('notes') && <NotesApp onClose={() => dispatchWindow({ type: 'close', view: 'notes' })} />}
        </div>
      </motion.div>

      {/* VS Code App overlay */}
      <motion.div
        initial={false}
        animate={view === 'vscode' ? "visible" : "hidden"}
        variants={windowVariants}
        className={frameClass('vscode', 'z-50')}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-[#1e1e1e] shadow-2xl relative">
          <WindowTrafficLights
            onClose={() => dispatchWindow({ type: 'close', view: 'vscode' })}
            onMinimize={() => dispatchWindow({ type: 'minimize', view: 'vscode' })}
            onZoom={() => dispatchWindow({ type: 'toggle-fullscreen', view: 'vscode' })}
          />
          {windowState.openedViews.includes('vscode') && <VSCodeApp onClose={() => dispatchWindow({ type: 'close', view: 'vscode' })} isActive={view === 'vscode'} />}
        </div>
      </motion.div>

      {/* Codex App overlay */}
      <motion.div
        initial={false}
        animate={view === 'codex' ? "visible" : "hidden"}
        variants={windowVariants}
        className={frameClass('codex', 'z-50')}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-[#0a0a0a] shadow-2xl relative">
          <WindowTrafficLights
            onClose={() => dispatchWindow({ type: 'close', view: 'codex' })}
            onMinimize={() => dispatchWindow({ type: 'minimize', view: 'codex' })}
            onZoom={() => dispatchWindow({ type: 'toggle-fullscreen', view: 'codex' })}
          />
          {windowState.openedViews.includes('codex') && <CodexApp onClose={() => dispatchWindow({ type: 'close', view: 'codex' })} isActive={view === 'codex'} />}
        </div>
      </motion.div>

      {/* Optional service apps */}
      <motion.div initial={false} animate={view === 'coolify' ? "visible" : "hidden"} variants={windowVariants} className={frameClass('coolify', 'z-50')} onClickCapture={(event) => handleChromeCapture('coolify', event)}>
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-white/10 overflow-hidden bg-[#0b1120] shadow-2xl relative">
          {windowState.openedViews.includes('coolify') && <CoolifyApp onClose={() => dispatchWindow({ type: 'close', view: 'coolify' })} isActive={view === 'coolify'} />}
        </div>
      </motion.div>

      <motion.div initial={false} animate={view === 'immich' ? "visible" : "hidden"} variants={windowVariants} className={frameClass('immich', 'z-50')} onClickCapture={(event) => handleChromeCapture('immich', event)}>
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-white/10 overflow-hidden bg-[#111827] shadow-2xl relative">
          {windowState.openedViews.includes('immich') && <ImmichApp onClose={() => dispatchWindow({ type: 'close', view: 'immich' })} isActive={view === 'immich'} />}
        </div>
      </motion.div>

    </div>
  );
}

export default function WindowManager(props: WindowManagerProps) {
  return (
    <JobActivityProvider>
      <WindowManagerShell {...props} />
    </JobActivityProvider>
  );
}
