import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import DesktopEnvironment from './DesktopEnvironment';
import App from '../App';
import SettingsApp from './SettingsApp';
import ActivityApp from './ActivityApp';
import CoolifyApp from './CoolifyApp';
import NotesApp from './NotesApp';
import PhotosApp from './PhotosApp';
import VSCodeApp from './VSCodeApp';
import BrowserApp from './BrowserApp';
import CommandPalette from './CommandPalette';
import { TransferTask } from '../types';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { usePerformanceSettings } from '../hooks/usePerformanceSettings';

const TerminalApp = dynamic(() => import('./TerminalApp'), { ssr: false });
interface WindowManagerProps {
  initialView?: 'desktop' | 'files' | 'settings' | 'terminal' | 'activity' | 'coolify' | 'notes' | 'photos' | 'vscode' | 'browser';
  username?: string;
}

export default function WindowManager({ initialView = 'desktop', username = 'User' }: WindowManagerProps) {
  const [view, setView] = useState<string>(initialView);
  const [transfers, setTransfers] = useState<TransferTask[]>([]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const { settings: performanceSettings } = usePerformanceSettings();
  const hasActiveTransfers = transfers.some(task => task.status === 'uploading' || task.status === 'pending' || task.status === 'paused');
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
    } else if (view === 'coolify') {
      window.history.pushState(null, '', '/coolify');
    } else if (view === 'notes') {
      window.history.pushState(null, '', '/notes');
    } else if (view === 'photos') {
      window.history.pushState(null, '', '/photos');
    } else if (view === 'vscode') {
      window.history.pushState(null, '', '/vscode');
    } else if (view === 'browser') {
      window.history.pushState(null, '', '/browser');
    }
  }, [view]);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      <CommandPalette
        open={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onOpenView={(nextView) => setView(nextView)}
      />

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

      {/* Desktop Environment - ALWAYS MOUNTED to prevent load delays */}
      <div className="absolute inset-0 z-0">
        <DesktopEnvironment
          onOpenFinder={() => setView('files')}
          onOpenSettings={() => setView('settings')}
          onOpenTerminal={() => setView('terminal')}
          onOpenActivity={() => setView('activity')}
          onOpenCoolify={() => setView('coolify')}
          onOpenNotes={() => setView('notes')}
          onOpenPhotos={() => setView('photos')}
          onOpenVSCode={() => setView('vscode')}
          onOpenBrowser={() => setView('browser')}
          username={username}
        />
      </div>

      {/* Files App overlay */}
      <motion.div
        initial={false}
        animate={view === 'files' ? "visible" : "hidden"}
        variants={windowVariants}
        className={`absolute z-10 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 md:origin-bottom shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] ${view === 'files' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          {(view === 'files' || hasActiveTransfers) && <App onClose={() => setView('desktop')} />}
        </div>
      </motion.div>

      {/* Settings App overlay */}
      <motion.div
        initial={false}
        animate={view === 'settings' ? "visible" : "hidden"}
        variants={windowVariants}
        className={`absolute z-20 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 md:origin-bottom shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] ${view === 'settings' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          {view === 'settings' && <SettingsApp onClose={() => setView('desktop')} />}
        </div>
      </motion.div>

      {/* Terminal App overlay */}
      <motion.div
        initial={false}
        animate={view === 'terminal' ? "visible" : "hidden"}
        variants={windowVariants}
        className={`absolute z-30 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 md:origin-bottom shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] ${view === 'terminal' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-gray-50 dark:bg-[#161618] shadow-2xl relative">
          {view === 'terminal' && <TerminalApp onClose={() => setView('desktop')} />}
        </div>
      </motion.div>

      {/* Activity App overlay */}
      <motion.div
        initial={false}
        animate={view === 'activity' ? "visible" : "hidden"}
        variants={windowVariants}
        className={`absolute z-40 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 md:origin-bottom shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] ${view === 'activity' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-gray-50 dark:bg-[#161618] shadow-2xl relative">
          {view === 'activity' && <ActivityApp onClose={() => setView('desktop')} isActive />}
        </div>
      </motion.div>
      {/* Coolify overlay */}
      <motion.div
        initial={false}
        animate={view === 'coolify' ? "visible" : "hidden"}
        variants={windowVariants}
        className={`absolute z-50 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 md:origin-bottom shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] ${view === 'coolify' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-[#0b1120] shadow-2xl relative">
          {view === 'coolify' && <CoolifyApp onClose={() => setView('desktop')} isActive />}
        </div>
      </motion.div>

      {/* Notes App overlay */}
      <motion.div
        initial={false}
        animate={view === 'notes' ? "visible" : "hidden"}
        variants={windowVariants}
        className={`absolute z-50 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 md:origin-bottom shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] ${view === 'notes' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          {view === 'notes' && <NotesApp onClose={() => setView('desktop')} />}
        </div>
      </motion.div>

      {/* Photos App overlay */}
      <motion.div
        initial={false}
        animate={view === 'photos' ? "visible" : "hidden"}
        variants={windowVariants}
        className={`absolute z-50 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 md:origin-bottom shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] ${view === 'photos' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          {view === 'photos' && <PhotosApp onClose={() => setView('desktop')} isActive />}
        </div>
      </motion.div>

      {/* VS Code App overlay */}
      <motion.div
        initial={false}
        animate={view === 'vscode' ? "visible" : "hidden"}
        variants={windowVariants}
        className={`absolute z-50 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 md:origin-bottom shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] ${view === 'vscode' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-[#1e1e1e] shadow-2xl relative">
          {view === 'vscode' && <VSCodeApp onClose={() => setView('desktop')} isActive />}
        </div>
      </motion.div>

      {/* Browser App overlay */}
      <motion.div
        initial={false}
        animate={view === 'browser' ? "visible" : "hidden"}
        variants={windowVariants}
        className={`absolute z-50 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 md:origin-bottom shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)] ${view === 'browser' ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          {view === 'browser' && <BrowserApp onClose={() => setView('desktop')} />}
        </div>
      </motion.div>

    </div>
  );
}
