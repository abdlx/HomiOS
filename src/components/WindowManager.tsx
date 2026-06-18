import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import DesktopEnvironment from './DesktopEnvironment';
import App from '../App';
import SettingsApp from './SettingsApp';
import ActivityApp from './ActivityApp';
import CoolifyApp from './CoolifyApp';
import NotesApp from './NotesApp';
import PhotosApp from './PhotosApp';
import { TransferTask } from '../types';
import { CheckCircle, Loader2, XCircle } from 'lucide-react';

const TerminalApp = dynamic(() => import('./TerminalApp'), { ssr: false });
interface WindowManagerProps {
  initialView?: 'desktop' | 'files' | 'settings' | 'terminal' | 'activity' | 'coolify' | 'notes' | 'photos';
  username?: string;
}

export default function WindowManager({ initialView = 'desktop', username = 'User' }: WindowManagerProps) {
  const [view, setView] = useState<string>(initialView);
  const [transfers, setTransfers] = useState<TransferTask[]>([]);

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
    }
  }, [view]);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()}>
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
          username={username}
        />
      </div>

      {/* Files App overlay */}
      <div 
        className={`absolute z-10 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] md:origin-bottom ${
          view === 'files' 
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]' 
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          <App onClose={() => setView('desktop')} />
        </div>
      </div>

      {/* Settings App overlay */}
      <div 
        className={`absolute z-20 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] md:origin-bottom ${
          view === 'settings' 
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]' 
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          <SettingsApp onClose={() => setView('desktop')} />
        </div>
      </div>

      {/* Terminal App overlay */}
      <div 
        className={`absolute z-30 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] md:origin-bottom ${
          view === 'terminal' 
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]' 
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-gray-50 dark:bg-[#161618] shadow-2xl relative">
          <TerminalApp onClose={() => setView('desktop')} />
        </div>
      </div>

      {/* Activity App overlay */}
      <div 
        className={`absolute z-40 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] md:origin-bottom ${
          view === 'activity' 
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]' 
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-gray-50 dark:bg-[#161618] shadow-2xl relative">
          <ActivityApp onClose={() => setView('desktop')} />
        </div>
      </div>
      {/* Coolify overlay */}
      <div
        className={`absolute z-50 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] md:origin-bottom ${
          view === 'coolify'
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]'
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-[#0b1120] shadow-2xl relative">
          <CoolifyApp onClose={() => setView('desktop')} />
        </div>
      </div>

      {/* Notes App overlay */}
      <div
        className={`absolute z-50 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] md:origin-bottom ${
          view === 'notes'
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]'
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          <NotesApp onClose={() => setView('desktop')} />
        </div>
      </div>

      {/* Photos App overlay */}
      <div
        className={`absolute z-50 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] md:origin-bottom ${
          view === 'photos'
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]'
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          <PhotosApp onClose={() => setView('desktop')} />
        </div>
      </div>

    </div>
  );
}


