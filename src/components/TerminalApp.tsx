import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { io, Socket } from 'socket.io-client';
import { Terminal as TerminalIcon, X, Maximize2, Minus } from 'lucide-react';
import 'xterm/css/xterm.css';

interface TerminalAppProps {
  onClose: () => void;
}

export default function TerminalApp({ onClose }: TerminalAppProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [term, setTerm] = useState<Terminal | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

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
        // Ctrl+C or Cmd+C (or with Shift): Copy if selected, else pass to terminal (cancel)
        if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
          const selection = terminal.getSelection();
          if (selection) {
            navigator.clipboard.writeText(selection);
            return false;
          }
        }
        // Ctrl+V or Cmd+V (or with Shift): Paste
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

  // Update fit when full screen changes
  useEffect(() => {
    if (term) {
      setTimeout(() => {
        // Trigger a fake resize event to force FitAddon to recalculate
        window.dispatchEvent(new Event('resize'));
      }, 350); // wait for CSS transition
    }
  }, [isFullScreen, term]);

  return (
    <div className={`absolute shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out bg-gray-50 dark:bg-[#161618] font-sans ${
      isFullScreen
        ? 'top-0 left-0 right-0 bottom-0 z-[100] rounded-none'
        : 'top-0 left-0 right-0 bottom-0 z-50 rounded-[40px]'
    }`}>
      {/* Title Bar */}
      <div className="bg-white/80 dark:bg-[#1c1c1e]/80 backdrop-blur-md h-14 flex items-center justify-between px-6 shrink-0 cursor-default select-none border-b border-neutral-200/50 dark:border-white/10 relative z-10">
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
        <div className="w-24" /> {/* Spacer for centering */}
      </div>

      {/* Terminal Content */}
      <div className="flex-1 bg-gray-50 dark:bg-[#161618] p-4 pt-4 overflow-hidden relative flex flex-col">
        <div className="flex-1 bg-[#1c1c1e] rounded-[24px] shadow-inner border border-neutral-200/50 dark:border-white/10 overflow-hidden p-4">
          <div ref={terminalRef} className="w-full h-full xterm-container" />
        </div>
      </div>

      <style>{`
        .xterm-container .xterm-viewport {
          background-color: transparent !important;
        }
        .xterm-container .xterm-screen {
          padding-left: 8px;
        }
      `}</style>
    </div>
  );
}
