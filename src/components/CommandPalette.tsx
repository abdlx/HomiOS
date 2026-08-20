import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Terminal, Folder, Activity, Settings, Code, RefreshCw, HardDrive, FileText, Sparkles, Images, Boxes } from 'lucide-react';
import { GooeyInput } from '@/components/ui/gooey-input';
import { SearchResult } from '../types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenView: (view: 'files' | 'settings' | 'terminal' | 'activity' | 'vscode' | 'codex' | 'notes' | 'coolify' | 'immich') => void;
}

const ACTIONS = [
  { id: 'files', label: 'Open Files', icon: Folder, view: 'files' as const },
  { id: 'activity', label: 'Open Task Manager', icon: Activity, view: 'activity' as const },
  { id: 'terminal', label: 'Open Terminal', icon: Terminal, view: 'terminal' as const },
  { id: 'vscode', label: 'Open VS Code', icon: Code, view: 'vscode' as const },
  { id: 'codex', label: 'Open Codex', icon: Sparkles, view: 'codex' as const },
  { id: 'notes', label: 'Open Notes', icon: FileText, view: 'notes' as const },
  { id: 'immich', label: 'Open Immich', icon: Images, view: 'immich' as const },
  { id: 'coolify', label: 'Open Coolify', icon: Boxes, view: 'coolify' as const },
  { id: 'settings', label: 'Open Settings', icon: Settings, view: 'settings' as const },
];

export default function CommandPalette({ open, onClose, onOpenView }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setResults([]);
  }, [open]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=8`, { signal: controller.signal });
        if (res.ok) setResults(await res.json());
      } catch (e) {
        if ((e as any)?.name !== 'AbortError') console.error('Search failed', e);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query]);

  const filteredActions = useMemo(() => {
    const q = query.toLowerCase().trim();
    return ACTIONS.filter((action) => !q || action.label.toLowerCase().includes(q)).slice(0, 8);
  }, [query]);

  const runAction = (view: typeof ACTIONS[number]['view']) => {
    onOpenView(view);
    onClose();
  };

  const refreshIndex = async () => {
    await fetch('/api/index/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scope: 'files' }),
    });
    onOpenView('activity');
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[300] flex items-start justify-center bg-black/30 px-4 pt-[18vh] backdrop-blur-xl"
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
          >
            <GooeyInput
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') onClose();
                if (e.key === 'Enter' && filteredActions[0]) runAction(filteredActions[0].view);
              }}
              placeholder="Search files or run a command"
              aria-label="Search files or run a command"
              trailing={<kbd className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[10px] font-semibold text-white/45">ESC</kbd>}
            />

            <AnimatePresence>
              {query.trim().length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -10, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.2 }}
                  className="mt-3 max-h-[54vh] overflow-y-auto rounded-[28px] border border-white/14 bg-[#17171a]/86 p-2 text-white shadow-[0_28px_90px_rgba(0,0,0,0.46),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-3xl"
                >
          <button
            onClick={refreshIndex}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[18px] text-left text-sm text-white/78 hover:bg-white/10 hover:text-white"
          >
            <RefreshCw size={16} className="text-blue-500" />
            <span className="font-medium">Refresh file index</span>
          </button>
          <button
            onClick={() => runAction('activity')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[18px] text-left text-sm text-white/78 hover:bg-white/10 hover:text-white"
          >
            <HardDrive size={16} className="text-emerald-500" />
            <span className="font-medium">Open backups and task manager</span>
          </button>

          {filteredActions.length > 0 && (
            <div className="mt-2 border-t border-white/10 pt-2">
              {filteredActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => runAction(action.view)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[18px] text-left text-sm text-white/78 hover:bg-white/10 hover:text-white"
                >
                  <action.icon size={16} className="text-slate-400" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}

          {(results.length > 0 || loading) && (
            <div className="mt-2 border-t border-white/10 pt-2">
              {loading && <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>}
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => runAction(result.kind === 'note' ? 'notes' : 'files')}
                  className="w-full rounded-[18px] px-3 py-2.5 text-left hover:bg-white/10"
                >
                  <div className="truncate text-sm font-medium text-white/90">{result.name}</div>
                  <div className="truncate text-xs text-white/42">{result.path || result.snippet}</div>
                </button>
              ))}
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
