import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Terminal, Folder, Activity, Settings, Code, RefreshCw, HardDrive, FileText,
  Sparkles, Images, Boxes, Search, Shield, Share2, ArrowRight, Play, Database,
  Moon, Sun, Cpu
} from 'lucide-react';
import GlassSurface from '@/components/GlassSurface';
import { SearchResult } from '../types';
import { useCapabilities } from '../hooks/useCapabilities';
import { usePerformanceSettings } from '../hooks/usePerformanceSettings';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenView: (view: 'files' | 'settings' | 'terminal' | 'activity' | 'vscode' | 'codex' | 'notes' | 'coolify' | 'immich' | 'app-store') => void;
}

interface CommandEntry {
  id: string;
  category: 'Applications' | 'Drives & Protection' | 'Actions' | 'Settings';
  label: string;
  subtitle?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  action: () => void;
  keywords?: string[];
}

export default function CommandPalette({ open, onClose, onOpenView }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [fileResults, setFileResults] = useState<SearchResult[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { isEnabled } = useCapabilities();
  const { settings: performanceSettings } = usePerformanceSettings();
  const inputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFileResults([]);
    setSelectedIndex(0);
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [open]);

  // Build command registry respecting capabilities
  const commands: CommandEntry[] = useMemo(() => {
    const list: CommandEntry[] = [
      // Applications
      { id: 'app-files', category: 'Applications', label: 'Files', subtitle: 'Browse drives & root filesystem', icon: Folder, action: () => onOpenView('files'), keywords: ['finder', 'storage', 'browse', 'explorer'] },
      { id: 'app-activity', category: 'Applications', label: 'Activity', subtitle: 'CPU, memory, processes & active tasks', icon: Activity, action: () => onOpenView('activity'), keywords: ['tasks', 'processes', 'jobs', 'system monitor', 'cpu'] },
      { id: 'app-terminal', category: 'Applications', label: 'Terminal', subtitle: 'Interactive host shell session', icon: Terminal, action: () => onOpenView('terminal'), keywords: ['bash', 'sh', 'ssh', 'cmd', 'powershell'] },
      { id: 'app-notes', category: 'Applications', label: 'Notes', subtitle: 'Server scratchpad & text editor', icon: FileText, action: () => onOpenView('notes'), keywords: ['memo', 'text', 'doc'] },
      { id: 'app-settings', category: 'Applications', label: 'Settings', subtitle: 'Storage, backups, Samba & system config', icon: Settings, action: () => onOpenView('settings'), keywords: ['preferences', 'config', 'users', 'samba', 'network'] },
      { id: 'app-store', category: 'Applications', label: 'App Store', subtitle: 'Install self-hosted apps with Coolify', icon: Boxes, action: () => onOpenView('app-store'), keywords: ['install', 'apps', 'store', 'coolify'] },
    ];

    if (isEnabled('codeServer')) {
      list.push({ id: 'app-vscode', category: 'Applications', label: 'Code Server', subtitle: 'Browser-based development environment', icon: Code, action: () => onOpenView('vscode'), keywords: ['editor', 'ide', 'develop', 'code-server'] });
    }
    if (isEnabled('codex')) {
      list.push({ id: 'app-codex', category: 'Applications', label: 'Codex', subtitle: 'AI assistant workspace', icon: Sparkles, action: () => onOpenView('codex'), keywords: ['ai', 'chat', 'llm'] });
    }
    if (isEnabled('immich')) {
      list.push({ id: 'app-immich', category: 'Applications', label: 'Immich', subtitle: 'Self-hosted photo management', icon: Images, action: () => onOpenView('immich'), keywords: ['photos', 'gallery', 'media'] });
    }
    if (isEnabled('coolify')) {
      list.push({ id: 'app-coolify', category: 'Applications', label: 'Coolify', subtitle: 'Application & database deployment', icon: Boxes, action: () => onOpenView('coolify'), keywords: ['docker', 'deploy', 'apps', 'containers'] });
    }

    // Drives & Protection
    list.push(
      { id: 'act-storage', category: 'Drives & Protection', label: 'Open Storage Overview', subtitle: 'Manage block devices & mount points', icon: HardDrive, action: () => onOpenView('settings'), keywords: ['drives', 'disks', 'mount', 'unmount'] },
      { id: 'act-backups', category: 'Drives & Protection', label: 'Open Scheduled Backups', subtitle: 'Local drive protection & mirror policies', icon: Shield, action: () => onOpenView('settings'), keywords: ['sync', 'mirror', 'protect', 'schedule'] },
      { id: 'act-samba', category: 'Drives & Protection', label: 'Open Samba Sharing', subtitle: 'Windows & Mac network file sharing (SMB)', icon: Share2, action: () => onOpenView('settings'), keywords: ['smb', 'cifs', 'shares', 'lan'] },
    );

    // Actions & Maintenance
    list.push(
      {
        id: 'act-refresh-index',
        category: 'Actions',
        label: 'Refresh File Search Index',
        subtitle: 'Re-index storage for instant search',
        icon: RefreshCw,
        action: async () => {
          await fetch('/api/index/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ scope: 'files' }),
          }).catch(() => {});
          onOpenView('activity');
        },
        keywords: ['index', 'reindex', 'scan', 'search'],
      }
    );

    return list;
  }, [isEnabled, onOpenView]);

  // Filter commands by query
  const filteredCommands = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return commands.slice(0, 8);
    return commands.filter((cmd) => {
      return (
        cmd.label.toLowerCase().includes(q) ||
        cmd.subtitle?.toLowerCase().includes(q) ||
        cmd.category.toLowerCase().includes(q) ||
        cmd.keywords?.some((k) => k.includes(q))
      );
    }).slice(0, 10);
  }, [commands, query]);

  // File search debouncer
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setFileResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoadingFiles(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=6`, { signal: controller.signal });
        if (res.ok) setFileResults(await res.json());
      } catch (e) {
        if ((e as any)?.name !== 'AbortError') console.error('Search failed', e);
      } finally {
        if (!controller.signal.aborted) setLoadingFiles(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const totalItems = filteredCommands.length + fileResults.length;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((idx) => (idx + 1) % Math.max(1, totalItems));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((idx) => (idx - 1 + totalItems) % Math.max(1, totalItems));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex < filteredCommands.length) {
        filteredCommands[selectedIndex]?.action();
        onClose();
      } else {
        const file = fileResults[selectedIndex - filteredCommands.length];
        if (file) {
          if (file.kind === 'application' && file.path) window.open(file.path, '_blank', 'noopener,noreferrer');
          else onOpenView(file.kind === 'note' ? 'notes' : 'files');
          onClose();
        }
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[300] flex items-start justify-center bg-black/40 px-4 pt-[18vh] backdrop-blur-xl"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Search HomiOS"
        >
          <motion.div
            initial={{ opacity: 0, y: 120, scale: 0.35 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 80, scale: 0.55 }}
            transition={{ type: 'spring', stiffness: 250, damping: 27, mass: 0.72 }}
            className="w-[min(680px,calc(100vw-32px))]"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleKeyDown}
          >
            <div className="relative isolate flex h-14 w-full items-center overflow-hidden rounded-[28px] px-4.5 shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
              <div className="pointer-events-none absolute inset-0 -z-10">
                {performanceSettings.glassSurfaces ? (
                  <GlassSurface
                    width="100%"
                    height="100%"
                    borderRadius={28}
                    distortionScale={300}
                    opacity={1}
                    borderWidth={0.07}
                    displace={4}
                    backgroundOpacity={0.45}
                    blur={28}
                  />
                ) : (
                  <div className="h-full w-full rounded-[28px] border border-white/10 bg-black/35 shadow-[0_16px_40px_rgba(0,0,0,0.22)] backdrop-blur-md" />
                )}
              </div>
              <Search size={18} strokeWidth={2} className="text-white/60 shrink-0 mr-3" />
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Search apps, drives, actions, files..."
                aria-label="Search HomiOS"
                className="flex-1 min-w-0 bg-transparent text-[14px] md:text-[15px] font-normal text-white placeholder:text-white/40 border-none outline-none ring-0 shadow-none focus:outline-none focus:ring-0 focus:border-none focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-none"
                style={{ outline: 'none', border: 'none', boxShadow: 'none' }}
              />
              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                <kbd className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-white/60">⌘K</kbd>
                <kbd className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-white/60">ESC</kbd>
              </div>
            </div>

            {/* Results list only shown when searching */}
            <AnimatePresence>
              {query.trim().length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 max-h-[54vh] overflow-y-auto rounded-[28px] border border-white/14 bg-[#17171a]/90 p-2 text-white shadow-[0_28px_90px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-3xl space-y-1"
                >
                  {filteredCommands.length > 0 && (
                    <div className="space-y-0.5">
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40">
                        Commands &amp; Tools
                      </div>
                      {filteredCommands.map((cmd, index) => {
                        const isSelected = selectedIndex === index;
                        const Icon = cmd.icon;
                        return (
                          <button
                            key={cmd.id}
                            type="button"
                            onClick={() => {
                              cmd.action();
                              onClose();
                            }}
                            onMouseEnter={() => setSelectedIndex(index)}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-left transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'hover:bg-white/10 text-white/80'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 border ${
                                isSelected ? 'bg-white/20 border-white/30 text-white' : 'bg-white/10 border-white/10 text-white/70'
                              }`}>
                                <Icon size={16} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold leading-tight truncate">{cmd.label}</p>
                                {cmd.subtitle && (
                                  <p className={`text-[11px] leading-tight truncate mt-0.5 ${isSelected ? 'text-white/80' : 'text-white/45'}`}>
                                    {cmd.subtitle}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span className={`text-[10px] font-medium shrink-0 ml-2 ${isSelected ? 'text-white/80' : 'text-white/35'}`}>
                              {cmd.category}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* File Results */}
                  {(fileResults.length > 0 || loadingFiles) && (
                    <div className={`${filteredCommands.length > 0 ? 'pt-2 border-t border-white/10' : ''} space-y-0.5`}>
                      <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40 flex items-center justify-between">
                        <span>Search Results</span>
                        {loadingFiles && <span className="text-blue-400">Searching...</span>}
                      </div>
                      {fileResults.map((result, idx) => {
                        const itemIndex = filteredCommands.length + idx;
                        const isSelected = selectedIndex === itemIndex;
                        return (
                          <button
                            key={result.id}
                            type="button"
                            onClick={() => {
                              if (result.kind === 'application' && result.path) window.open(result.path, '_blank', 'noopener,noreferrer');
                              else onOpenView(result.kind === 'note' ? 'notes' : 'files');
                              onClose();
                            }}
                            onMouseEnter={() => setSelectedIndex(itemIndex)}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-left transition-all ${
                              isSelected
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'hover:bg-white/10 text-white/80'
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white/95 truncate">{result.name}</p>
                              <p className={`text-[10px] font-mono truncate mt-0.5 ${isSelected ? 'text-white/80' : 'text-white/40'}`}>
                                {result.path || result.snippet}
                              </p>
                            </div>
                            <span className={`text-[10px] uppercase font-semibold shrink-0 ml-2 ${isSelected ? 'text-white/80' : 'text-white/35'}`}>
                              {result.kind}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {filteredCommands.length === 0 && fileResults.length === 0 && !loadingFiles && (
                    <div className="py-8 text-center text-xs text-white/40">
                      No matching apps, actions, or files found for &ldquo;{query}&rdquo;
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
