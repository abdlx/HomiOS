import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import DesktopEnvironment from './DesktopEnvironment';
import App from '../App';
import SettingsApp from './SettingsApp';
import ActivityApp from './ActivityApp';

const TerminalApp = dynamic(() => import('./TerminalApp'), { ssr: false });
interface WindowManagerProps {
  initialView?: 'desktop' | 'files' | 'settings' | 'terminal' | 'activity';
  username?: string;
}

export default function WindowManager({ initialView = 'desktop', username = 'User' }: WindowManagerProps) {
  const [view, setView] = useState<string>(initialView);

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
          username={username} 
        />
      </div>

      {/* Files App overlay */}
      <div 
        className={`absolute z-10 top-8 bottom-[120px] left-16 right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom ${
          view === 'files' 
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]' 
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full rounded-[40px] border border-neutral-200/50 overflow-hidden bg-white shadow-2xl relative">
          <App onClose={() => setView('desktop')} />
        </div>
      </div>

      {/* Settings App overlay */}
      <div 
        className={`absolute z-20 top-8 bottom-[120px] left-16 right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom ${
          view === 'settings' 
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]' 
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full rounded-[40px] border border-neutral-200/50 overflow-hidden bg-white shadow-2xl relative">
          <SettingsApp onClose={() => setView('desktop')} />
        </div>
      </div>

      {/* Terminal App overlay */}
      <div 
        className={`absolute z-30 top-8 bottom-[120px] left-16 right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom ${
          view === 'terminal' 
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]' 
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full rounded-[40px] border border-neutral-200/50 overflow-hidden bg-gray-50 shadow-2xl relative">
          <TerminalApp onClose={() => setView('desktop')} />
        </div>
      </div>

      {/* Activity App overlay */}
      <div 
        className={`absolute z-40 top-8 bottom-[120px] left-16 right-16 transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] origin-bottom ${
          view === 'activity' 
            ? 'opacity-100 pointer-events-auto scale-100 translate-y-0 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.7)]' 
            : 'opacity-0 pointer-events-none scale-[0.92] translate-y-8'
        }`}
      >
        <div className="w-full h-full rounded-[40px] border border-neutral-200/50 overflow-hidden bg-gray-50 shadow-2xl relative">
          <ActivityApp onClose={() => setView('desktop')} />
        </div>
      </div>

    </div>
  );
}
