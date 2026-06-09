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

    const handleResize = () => {
      fitAddon.fit();
      newSocket.emit('resize', { cols: terminal.cols, rows: terminal.rows });
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
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
    <div className={`absolute shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ease-in-out ${
      isFullScreen 
        ? 'top-0 left-0 right-0 bottom-0 z-[100] rounded-none' 
        : 'top-10 left-10 right-10 bottom-24 z-50 rounded-[40px] border border-white/20'
    }`}>
      {/* Title Bar */}
      <div className="bg-[#2c2c2e] h-14 flex items-center justify-between px-6 shrink-0 cursor-default select-none border-b border-black/20">
        <div className="flex items-center space-x-2 w-24">
          <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-600 transition-colors flex items-center justify-center group">
            <X size={10} className="text-black/50 opacity-0 group-hover:opacity-100" />
          </button>
          <button className="w-3.5 h-3.5 rounded-full bg-yellow-500 hover:bg-yellow-600 transition-colors flex items-center justify-center group">
            <Minus size={10} className="text-black/50 opacity-0 group-hover:opacity-100" />
          </button>
          <button onClick={() => setIsFullScreen(!isFullScreen)} className="w-3.5 h-3.5 rounded-full bg-green-500 hover:bg-green-600 transition-colors flex items-center justify-center group">
            <Maximize2 size={8} className="text-black/50 opacity-0 group-hover:opacity-100" />
          </button>
        </div>
        <div className="flex items-center space-x-2 text-white/70">
          <TerminalIcon size={16} />
          <span className="text-sm font-semibold tracking-wide">Terminal</span>
        </div>
        <div className="w-24" /> {/* Spacer for centering */}
      </div>

      {/* Terminal Content */}
      <div className="flex-1 bg-[#1c1c1e] p-4 pt-6 overflow-hidden">
        <div ref={terminalRef} className="w-full h-full xterm-container" />
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
