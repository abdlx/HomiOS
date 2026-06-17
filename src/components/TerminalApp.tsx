import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { io, Socket } from 'socket.io-client';
import { Terminal as TerminalIcon, X, Maximize2, Minus, Plus } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalAppProps {
  onClose: () => void;
}

const TerminalInstance = ({ isActive, isFullScreen }: { isActive: boolean; isFullScreen: boolean }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [term, setTerm] = useState<Terminal | null>(null);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Initialize xterm.js
    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: '"Fira Code", monospace',
      theme: {
        background: '#1c1c1e',
        foreground: '#e4e4e6',
        cursor: '#0d8abc',
        selectionBackground: 'rgba(13, 138, 188, 0.3)',
      }
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(terminalRef.current);
    fitAddon.fit();

    setTerm(terminal);

    // Initialize Socket.io
    const newSocket = io();
    setSocket(newSocket);

    newSocket.on('connect', () => {
      // Send initial resize
      newSocket.emit('resize', { cols: terminal.cols, rows: terminal.rows });
    });

    newSocket.on('output', (data) => {
      terminal.write(data);
    });

    terminal.onData((data) => {
      newSocket.emit('input', data);
    });

    // Handle Copy & Paste & Shortcuts
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown') {
        // Ctrl+C or Cmd+C: Copy if selected, else pass to terminal
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
          const selection = terminal.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection);
            return false;
          }
        }
        // Ctrl+V or Cmd+V: Paste
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV') {
          navigator.clipboard.readText().then((text) => {
            newSocket.emit('input', text);
          }).catch(console.error);
          return false;
        }
        // Ctrl+A or Cmd+A: Select All
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
          terminal.selectAll();
          return false;
        }
        // Forbid Ctrl+D or Cmd+D to prevent accidental disconnects
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
          return false;
        }
      }
      return true;
    });

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      const selection = terminal.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection);
        terminal.clearSelection();
      } else {
        navigator.clipboard.readText().then((text) => {
          newSocket.emit('input', text);
        }).catch(console.error);
      }
    };
    
    const currentRef = terminalRef.current;
    if (currentRef) {
      currentRef.addEventListener('contextmenu', handleContextMenu);
    }

    const handleResize = () => {
      fitAddon.fit();
      newSocket.emit('resize', { cols: terminal.cols, rows: terminal.rows });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (currentRef) {
        currentRef.removeEventListener('contextmenu', handleContextMenu);
      }
      terminal.dispose();
      newSocket.disconnect();
    };
  }, []);

  // Update fit and focus when becoming active or fullscreen changes
  useEffect(() => {
    if (term && isActive) {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
        term.focus();
      }, 50); // wait for CSS transition
    }
  }, [isActive, isFullScreen, term]);

  return (
    <div className={`absolute inset-0 p-4 pt-0 transition-opacity duration-200 ${isActive ? 'opacity-100 z-10 pointer-events-auto' : 'opacity-0 z-0 pointer-events-none'}`}>
      <div className="w-full h-full bg-[#1c1c1e] rounded-[24px] shadow-inner border border-neutral-200/50 dark:border-white/10 overflow-hidden p-4">
        <div ref={terminalRef} className="w-full h-full xterm-container" />
      </div>
    </div>
  );
};

export default function TerminalApp({ onClose }: TerminalAppProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [tabs, setTabs] = useState<{ id: string; title: string }[]>([{ id: 'tab-1', title: 'bash' }]);
  const [activeTabId, setActiveTabId] = useState<string>('tab-1');

  const addTab = () => {
    const newId = `tab-${Date.now()}`;
    setTabs([...tabs, { id: newId, title: 'bash' }]);
    setActiveTabId(newId);
  };

  const removeTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length === 1) {
      onClose(); // Close app if last tab is closed
      return;
    }
    const newTabs = tabs.filter(t => t.id !== id);
    if (activeTabId === id) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
    setTabs(newTabs);
  };

  return (
    <div className={`absolute shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out bg-gray-50 dark:bg-[#161618] font-sans ${
      isFullScreen
        ? 'top-0 left-0 right-0 bottom-0 z-[100] rounded-none'
        : 'top-0 left-0 right-0 bottom-0 z-50 rounded-[40px]'
    }`}>
      {/* Title Bar */}
      <div className="bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-md h-14 flex items-center justify-between px-6 shrink-0 cursor-default select-none border-b border-neutral-200/50 dark:border-white/10 relative z-20">
        <div className="flex items-center space-x-2 w-24">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all flex items-center justify-center group" title="Close" onClick={onClose}>
            <X size={8} className="text-black/50 opacity-0 group-hover:opacity-100" />
          </div>
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all flex items-center justify-center group" title="Minimize">
            <Minus size={8} className="text-black/50 opacity-0 group-hover:opacity-100" />
          </div>
          <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all flex items-center justify-center group" title="Zoom" onClick={() => setIsFullScreen(!isFullScreen)}>
            <Maximize2 size={6} className="text-black/50 opacity-0 group-hover:opacity-100" />
          </div>
        </div>
        <div className="flex items-center space-x-2 text-slate-700 dark:text-slate-200">
          <TerminalIcon size={16} />
          <span className="text-sm font-semibold tracking-wide">Terminal</span>
        </div>
        <div className="w-24 flex justify-end">
          <button onClick={addTab} className="text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition-colors p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10" title="New Tab">
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* Tabs Bar */}
      <div className="flex items-center px-4 pt-3 pb-2 space-x-2 bg-gray-50 dark:bg-[#161618] overflow-x-auto hide-scrollbar shrink-0 z-20 relative">
        {tabs.map((tab) => (
          <div 
            key={tab.id} 
            onClick={() => setActiveTabId(tab.id)}
            className={`flex items-center space-x-2 px-4 py-1.5 rounded-full text-xs font-medium cursor-pointer transition-colors border ${
              activeTabId === tab.id 
                ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:bg-blue-500/20 dark:text-blue-300' 
                : 'bg-transparent border-transparent text-slate-500 hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <span>{tab.title}</span>
            <button 
              onClick={(e) => removeTab(tab.id, e)} 
              className={`ml-2 rounded-full p-0.5 transition-colors ${activeTabId === tab.id ? 'hover:bg-blue-500/20 text-blue-500/70 hover:text-blue-600 dark:hover:bg-white/20 dark:text-blue-300' : 'hover:bg-black/10 dark:hover:bg-white/10'}`}
              title="Close Tab"
            >
              <X size={10} />
            </button>
          </div>
        ))}
      </div>

      {/* Terminal Content Area */}
      <div className="flex-1 relative overflow-hidden bg-gray-50 dark:bg-[#161618]">
        {tabs.map((tab) => (
          <TerminalInstance key={tab.id} isActive={activeTabId === tab.id} isFullScreen={isFullScreen} />
        ))}
      </div>

      <style>{`
        .xterm-container .xterm-viewport {
          background-color: transparent !important;
        }
        .xterm-container .xterm-screen {
          padding-left: 8px;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
