import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Globe, Home, Menu, Plus, RefreshCw, Search, ShieldAlert, Star, Trash2, X } from 'lucide-react';

interface BrowserTab {
  id: string;
  title: string;
  url: string;
  input: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loadKey: number;
}

interface BrowserAppProps {
  onClose?: () => void;
}

const TABS_KEY = 'openfinder_browser_tabs';
const ACTIVE_KEY = 'openfinder_browser_active_tab';
const HISTORY_KEY = 'openfinder_browser_history';
const BOOKMARKS_KEY = 'openfinder_browser_bookmarks';
const HOME_URL = 'https://example.com';

function createTab(url = HOME_URL): BrowserTab {
  return {
    id: `tab-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    title: 'New Tab',
    url,
    input: url,
    canGoBack: false,
    canGoForward: false,
    loadKey: 0,
  };
}

function normalizeTarget(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return HOME_URL;
  const looksLikeUrl = /^https?:\/\//i.test(trimmed) || /^[\w-]+(\.[\w-]+)+/.test(trimmed);
  if (looksLikeUrl) return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return `https://www.google.com/search?q=${encodeURIComponent(trimmed)}`;
}

export default function BrowserApp({ onClose }: BrowserAppProps) {
  const [tabs, setTabs] = useState<BrowserTab[]>([createTab()]);
  const [activeId, setActiveId] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);

  useEffect(() => {
    try {
      const savedTabs = localStorage.getItem(TABS_KEY);
      const parsedTabs = savedTabs ? JSON.parse(savedTabs) : null;
      const validTabs = Array.isArray(parsedTabs) && parsedTabs.length > 0 ? parsedTabs : [createTab()];
      setTabs(validTabs);
      setActiveId(localStorage.getItem(ACTIVE_KEY) || validTabs[0].id);
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'));
      setBookmarks(JSON.parse(localStorage.getItem(BOOKMARKS_KEY) || '[]'));
    } catch {
      const tab = createTab();
      setTabs([tab]);
      setActiveId(tab.id);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(TABS_KEY, JSON.stringify(tabs));
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [tabs, activeId]);

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 80)));
  }, [history]);

  useEffect(() => {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  }, [bookmarks]);

  const activeTab = useMemo(() => tabs.find((tab) => tab.id === activeId) || tabs[0], [tabs, activeId]);

  const updateActive = (patch: Partial<BrowserTab>) => {
    if (!activeTab) return;
    setTabs((prev) => prev.map((tab) => tab.id === activeTab.id ? { ...tab, ...patch } : tab));
  };

  const navigate = (value: string) => {
    const url = normalizeTarget(value);
    updateActive({ url, input: url, title: new URL(url).hostname, loadKey: (activeTab?.loadKey || 0) + 1 });
    setHistory((prev) => [url, ...prev.filter((item) => item !== url)].slice(0, 80));
  };

  const addTab = (url = HOME_URL) => {
    const tab = createTab(url);
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  };

  const closeTab = (id: string) => {
    setTabs((prev) => {
      const next = prev.filter((tab) => tab.id !== id);
      if (activeId === id) setActiveId((next[0] || createTab()).id);
      return next.length > 0 ? next : [createTab()];
    });
  };

  const toggleBookmark = () => {
    if (!activeTab) return;
    setBookmarks((prev) => prev.includes(activeTab.url) ? prev.filter((item) => item !== activeTab.url) : [activeTab.url, ...prev]);
  };

  const bookmarked = !!activeTab && bookmarks.includes(activeTab.url);

  return (
    <div className="flex h-full w-full select-none overflow-hidden bg-gray-50 text-slate-900 dark:bg-[#161618] dark:text-white">
      <div className={`border-r border-neutral-200/60 bg-white dark:border-white/10 dark:bg-[#1f1f22] ${showSidebar ? 'w-72' : 'hidden'} md:block md:w-72`}>
        <div className="flex items-center justify-between border-b border-neutral-200/60 px-4 py-3 dark:border-white/10">
          <div className="flex items-center gap-2">
            <Globe size={17} className="text-blue-500" />
            <span className="text-sm font-bold">Browser</span>
          </div>
          <button onClick={onClose} className="h-3 w-3 rounded-full bg-[#ff5f56]" title="Close" />
        </div>
        <div className="p-3">
          <button onClick={() => addTab()} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
            <Plus size={14} />
            New Tab
          </button>
          <div className="mb-4">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wide text-neutral-400">Bookmarks</p>
            {bookmarks.length === 0 && <p className="px-1 text-xs text-neutral-400">No bookmarks yet.</p>}
            {bookmarks.slice(0, 8).map((url) => (
              <button key={url} onClick={() => navigate(url)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10">
                <Star size={13} className="text-amber-400" />
                <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
              </button>
            ))}
          </div>
          <div>
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wide text-neutral-400">History</p>
            {history.slice(0, 12).map((url) => (
              <button key={url} onClick={() => navigate(url)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10">
                <Globe size={13} className="text-neutral-400" />
                <span className="truncate">{url.replace(/^https?:\/\//, '')}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-neutral-200/60 bg-white px-3 py-2 dark:border-white/10 dark:bg-[#1c1c1e]">
          <button onClick={() => setShowSidebar((open) => !open)} className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10" title="Sidebar">
            <Menu size={16} />
          </button>
          <button onClick={() => navigate(HOME_URL)} className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10" title="Home">
            <Home size={16} />
          </button>
          <button disabled className="rounded-full p-2 text-neutral-300" title="Back">
            <ArrowLeft size={16} />
          </button>
          <button disabled className="rounded-full p-2 text-neutral-300" title="Forward">
            <ArrowRight size={16} />
          </button>
          <button onClick={() => updateActive({ loadKey: (activeTab?.loadKey || 0) + 1 })} className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/10" title="Reload">
            <RefreshCw size={16} />
          </button>
          <form
            className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 dark:border-white/10 dark:bg-white/5"
            onSubmit={(e) => {
              e.preventDefault();
              if (activeTab) navigate(activeTab.input);
            }}
          >
            <Search size={14} className="text-neutral-400" />
            <input
              value={activeTab?.input || ''}
              onChange={(e) => updateActive({ input: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-neutral-400"
              placeholder="Search or enter website"
            />
          </form>
          <button onClick={toggleBookmark} className={`rounded-full p-2 hover:bg-neutral-100 dark:hover:bg-white/10 ${bookmarked ? 'text-amber-400' : 'text-neutral-500'}`} title="Bookmark">
            <Bookmark size={16} fill={bookmarked ? 'currentColor' : 'none'} />
          </button>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-200/60 bg-neutral-100/70 px-2 py-1 dark:border-white/10 dark:bg-black/20">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveId(tab.id)} className={`group flex max-w-[210px] items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${tab.id === activeTab?.id ? 'bg-white shadow-sm dark:bg-white/10' : 'text-neutral-500 hover:bg-white/70 dark:hover:bg-white/5'}`}>
              <Globe size={12} />
              <span className="truncate">{tab.title || 'New Tab'}</span>
              <span onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }} className="rounded-full p-0.5 opacity-60 hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10">
                <X size={11} />
              </span>
            </button>
          ))}
          <button onClick={() => addTab()} className="rounded-lg p-1.5 text-neutral-500 hover:bg-white/80 dark:hover:bg-white/10" title="New tab">
            <Plus size={14} />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-white dark:bg-[#111113]">
          {activeTab && (
            <>
              <iframe
                key={`${activeTab.id}-${activeTab.loadKey}`}
                src={activeTab.url}
                title={activeTab.title}
                sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
                className="h-full w-full border-0 bg-white"
                onLoad={() => {
                  try {
                    updateActive({ title: new URL(activeTab.url).hostname });
                  } catch {}
                }}
              />
              <div className="pointer-events-none absolute bottom-4 left-1/2 flex max-w-[min(520px,calc(100%-32px))] -translate-x-1/2 items-center gap-2 rounded-2xl border border-amber-400/20 bg-black/65 px-4 py-3 text-xs text-white/80 shadow-xl backdrop-blur-xl">
                <ShieldAlert size={16} className="flex-shrink-0 text-amber-300" />
                <span className="min-w-0">Some websites block embedding. If the frame is blank or refused, open it in a normal tab from the site controls.</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
