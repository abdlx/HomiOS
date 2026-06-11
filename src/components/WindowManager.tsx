import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import DesktopEnvironment from './DesktopEnvironment';
import App from '../App';
import SettingsApp from './SettingsApp';
import ActivityApp from './ActivityApp';
import DockerManagerApp from './DockerManagerApp';
import ServersApp from './ServersApp';

const TerminalApp = dynamic(() => import('./TerminalApp'), { ssr: false });
interface WindowManagerProps {
  initialView?: 'desktop' | 'files' | 'settings' | 'terminal' | 'activity' | 'docker_manager' | 'servers';
  username?: string;
}

export default function WindowManager({ initialView = 'desktop', username = 'User' }: WindowManagerProps) {
  const [view, setView] = useState<string>(initialView);
  const [dockerAppId, setDockerAppId] = useState<string | null>(null);

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
    } else if (view === 'docker_manager') {
      window.history.pushState(null, '', '/docker');
    } else if (view === 'servers') {
      window.history.pushState(null, '', '/servers');
    }
  }, [view]);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      
      {/* Desktop Environment - ALWAYS MOUNTED to prevent load delays */}
      <div className="absolute inset-0 z-0">
        <DesktopEnvironment 
          onOpenFinder={() => setView('files')} 
          onOpenSettings={() => setView('settings')}
          onOpenTerminal={() => setView('terminal')}
          onOpenActivity={() => setView('activity')}
          onOpenDockerManager={(appId) => {
             if (appId) setDockerAppId(appId);
             else setDockerAppId(null);
             setView('docker_manager');
          }}
          onOpenServers={() => setView('servers')}
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

      {/* Docker Manager overlay */}
      <div
        className={`absolute z-50 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] md:origin-bottom ${
          view === 'docker_manager'
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]'
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          <DockerManagerApp initialAppId={dockerAppId} onClose={() => setView('desktop')} />
        </div>
      </div>

      {/* Servers overlay */}
      <div
        className={`absolute z-60 max-md:inset-0 md:top-8 md:bottom-[120px] md:left-16 md:right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] md:origin-bottom ${
          view === 'servers'
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]'
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full md:rounded-[40px] border-0 md:border border-neutral-200/50 dark:border-white/10 overflow-hidden bg-white dark:bg-[#1c1c1e] shadow-2xl relative">
          <ServersApp onClose={() => setView('desktop')} />
        </div>
      </div>

    </div>
  );
}
