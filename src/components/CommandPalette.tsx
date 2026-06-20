import React, { useEffect, useMemo, useState } from 'react';
import { Search, Terminal, Folder, Image, Activity, Settings, Code, RefreshCw, HardDrive, FileText, Globe } from 'lucide-react';
import { SearchResult } from '../types';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onOpenView: (view: 'files' | 'settings' | 'terminal' | 'activity' | 'photos' | 'vscode' | 'notes' | 'browser') => void;
}

const ACTIONS = [
  { id: 'files', label: 'Open Files', icon: Folder, view: 'files' as const },
  { id: 'photos', label: 'Open Photos', icon: Image, view: 'photos' as const },
  { id: 'activity', label: 'Open Task Manager', icon: Activity, view: 'activity' as const },
  { id: 'terminal', label: 'Open Terminal', icon: Terminal, view: 'terminal' as const },
  { id: 'vscode', label: 'Open VS Code', icon: Code, view: 'vscode' as const },
  { id: 'notes', label: 'Open Notes', icon: FileText, view: 'notes' as const },
  { id: 'browser', label: 'Open Browser', icon: Globe, view: 'browser' as const },
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

  if (!open) return null;

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
    <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="w-[min(680px,calc(100vw-32px))] rounded-2xl border border-white/10 bg-white dark:bg-[#1f1f22] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-white/10">
          <Search size={18} className="text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filteredActions[0]) runAction(filteredActions[0].view);
            }}
            placeholder="Search files or run a command"
            className="flex-1 bg-transparent outline-none text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          <button
            onClick={refreshIndex}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200"
          >
            <RefreshCw size={16} className="text-blue-500" />
            <span className="font-medium">Refresh file index</span>
          </button>
          <button
            onClick={() => runAction('activity')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200"
          >
            <HardDrive size={16} className="text-emerald-500" />
            <span className="font-medium">Open backups and task manager</span>
          </button>

          {filteredActions.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/10">
              {filteredActions.map((action) => (
                <button
                  key={action.id}
                  onClick={() => runAction(action.view)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-sm hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-200"
                >
                  <action.icon size={16} className="text-slate-400" />
                  <span>{action.label}</span>
                </button>
              ))}
            </div>
          )}

          {(results.length > 0 || loading) && (
            <div className="mt-2 pt-2 border-t border-slate-100 dark:border-white/10">
              {loading && <div className="px-3 py-2 text-xs text-slate-400">Searching…</div>}
              {results.map((result) => (
                <button
                  key={result.id}
                  onClick={() => runAction(result.kind === 'note' ? 'notes' : result.kind === 'media' ? 'photos' : 'files')}
                  className="w-full px-3 py-2.5 rounded-xl text-left hover:bg-slate-100 dark:hover:bg-white/10"
                >
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{result.name}</div>
                  <div className="text-xs text-slate-400 truncate">{result.path || result.snippet}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
