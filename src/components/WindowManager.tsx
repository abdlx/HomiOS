import React, { useState, useEffect } from 'react';
import DesktopEnvironment from './DesktopEnvironment';
import App from '../App';

interface WindowManagerProps {
  initialView?: 'desktop' | 'files';
  username?: string;
}

export default function WindowManager({ initialView = 'desktop', username = 'User' }: WindowManagerProps) {
  const [view, setView] = useState(initialView);

  useEffect(() => {
    // When view changes, seamlessly update URL without reloading
    if (view === 'desktop') {
      window.history.pushState(null, '', '/dashboard');
    } else if (view === 'files') {
      window.history.pushState(null, '', '/files');
    }
  }, [view]);

  return (
    <div className="relative h-screen w-full bg-black overflow-hidden select-none" onContextMenu={(e) => e.preventDefault()}>
      
      {/* Desktop Environment - ALWAYS MOUNTED to prevent load delays */}
      <div className="absolute inset-0 z-0">
        <DesktopEnvironment onOpenFinder={() => setView('files')} username={username} />
      </div>

      {/* Files App overlay */}
      <div 
        className={`absolute z-10 transition-all duration-300 ${
          view === 'files' 
            ? 'opacity-100 pointer-events-auto scale-100 top-8 bottom-24 left-16 right-16 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.5)]' 
            : 'opacity-0 pointer-events-none scale-95 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%]'
        }`}
      >
        <div className="w-full h-full rounded-[24px] border border-neutral-200/50 overflow-hidden bg-white shadow-2xl relative">
          {/* We keep App permanently mounted inside so it holds its state and renders instantly */}
          <App onClose={() => setView('desktop')} />
        </div>
      </div>

    </div>
  );
}
