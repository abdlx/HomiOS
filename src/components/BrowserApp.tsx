import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, Clock, Globe, Home, Menu, Plus, RefreshCw, Search, ShieldAlert, Star, X } from 'lucide-react';

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

  const navButtonClass = 'p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-white hover:shadow-sm transition-all cursor-pointer';
  const disabledNavButtonClass = 'p-1.5 rounded-full text-gray-300 dark:text-gray-600 pointer-events-none';
  const sideItemClass = 'w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors font-medium text-gray-600 dark:text-gray-300 hover:bg-neutral-200/50 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white';

  return (
    <div className="flex h-full w-full select-none overflow-hidden bg-white text-slate-900 dark:bg-[#1c1c1e] dark:text-white">
      {showSidebar && (
        <button
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm md:hidden"
          onClick={() => setShowSidebar(false)}
          aria-label="Close sidebar backdrop"
        />
      )}

      <aside className={`relative z-40 flex flex-col justify-between bg-white dark:bg-[#1f1f22] md:border border-neutral-200/50 dark:border-white/10 transition-colors duration-300 ${
        showSidebar
          ? 'absolute left-0 top-0 bottom-0 w-[280px] shadow-2xl p-4 pt-5 animate-in slide-in-from-left duration-300'
          : 'hidden md:flex w-[240px] md:w-[250px] shadow-sm m-3 rounded-[32px] p-4 pt-5'
      }`}>
        <div className="flex min-h-0 flex-col">
          <div className="mb-4 flex items-center justify-between px-1">
            <div className="flex items-center space-x-2">
              <button
                onClick={onClose}
                className="h-3 w-3 rounded-full border border-[#e0443e] bg-[#ff5f56] transition-all hover:brightness-90"
                title="Close"
              />
              <div className="h-3 w-3 rounded-full border border-[#dfa123] bg-[#ffbd2e]" title="Minimize" />
              <div className="h-3 w-3 rounded-full border border-[#1aab29] bg-[#27c93f]" title="Zoom" />
            </div>
            {showSidebar && (
              <button
                onClick={() => setShowSidebar(false)}
                className="rounded-full p-1 text-neutral-500 transition-all hover:bg-neutral-100 active:scale-95 dark:text-neutral-400 dark:hover:bg-white/10 md:hidden"
                title="Close Sidebar"
              >
                <X size={16} />
              </button>
            )}
          </div>

          <div className="mb-4 flex items-center space-x-2 px-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300">
              <Globe size={17} />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-bold tracking-wide text-gray-800 dark:text-gray-100">Browser</h2>
              <p className="truncate text-[10px] font-medium text-neutral-400 dark:text-neutral-500">
                {activeTab ? activeTab.url.replace(/^https?:\/\//, '') : 'Ready'}
              </p>
            </div>
          </div>

          <button
            onClick={() => addTab()}
            className="mb-4 flex w-full items-center justify-center space-x-2 rounded-full border border-neutral-200/40 bg-neutral-100/60 px-3 py-2 text-xs font-bold text-gray-700 shadow-sm transition-all hover:bg-white hover:text-blue-600 dark:border-white/10 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10 dark:hover:text-blue-300"
          >
            <Plus size={14} className="stroke-[2.5]" />
            <span>New Tab</span>
          </button>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1 sidebar-scroll">
            <div className="mb-4">
              <span className="mb-1 block px-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Bookmarks
              </span>
              <div className="space-y-0.5">
                {bookmarks.length === 0 && <p className="px-2 py-1 text-xs italic text-neutral-400 dark:text-neutral-500">No bookmarks yet</p>}
                {bookmarks.slice(0, 8).map((url) => (
                  <button key={url} onClick={() => navigate(url)} className={sideItemClass}>
                    <Star size={14} className="flex-shrink-0 text-amber-400" />
                    <span className="truncate flex-1">{url.replace(/^https?:\/\//, '')}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="mb-1 block px-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                History
              </span>
              <div className="space-y-0.5">
                {history.length === 0 && <p className="px-2 py-1 text-xs italic text-neutral-400 dark:text-neutral-500">No recent pages</p>}
                {history.slice(0, 12).map((url) => (
                  <button key={url} onClick={() => navigate(url)} className={sideItemClass}>
                    <Clock size={14} className="flex-shrink-0 text-neutral-400" />
                    <span className="truncate flex-1">{url.replace(/^https?:\/\//, '')}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-neutral-200/30 px-1.5 pt-2.5 text-[10px] text-neutral-400 dark:border-white/10 dark:text-neutral-500">
          <span className="font-semibold text-neutral-500 dark:text-neutral-400">{tabs.length} tab{tabs.length === 1 ? '' : 's'}</span>
          <span className="opacity-75">Private iframe</span>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-transparent">
        <div className="flex flex-col gap-3 bg-transparent px-4 pb-3 pt-5 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center space-x-4">
              <div className="flex items-center space-x-1 rounded-full border border-neutral-200/40 bg-neutral-100/60 px-1.5 py-1 shadow-sm dark:border-white/10 dark:bg-white/5">
                <button onClick={() => setShowSidebar((open) => !open)} className={navButtonClass} title="Sidebar">
                  <Menu size={15} className="stroke-[2.5]" />
                </button>
                <button disabled className={disabledNavButtonClass} title="Back">
                  <ArrowLeft size={15} className="stroke-[2.5]" />
                </button>
                <button disabled className={disabledNavButtonClass} title="Forward">
                  <ArrowRight size={15} className="stroke-[2.5]" />
                </button>
              </div>

              <h1 className="truncate text-sm font-bold tracking-wide text-gray-800 dark:text-gray-100">
                {activeTab?.title || 'New Tab'}
              </h1>
            </div>

            <div className="flex flex-shrink-0 items-center space-x-2">
              <div className="flex items-center space-x-1 rounded-full border border-neutral-200/40 bg-neutral-100/60 px-1.5 py-1 shadow-sm dark:border-white/10 dark:bg-white/5">
                <button onClick={() => navigate(HOME_URL)} className={navButtonClass} title="Home">
                  <Home size={15} className="stroke-[2]" />
                </button>
                <button onClick={() => updateActive({ loadKey: (activeTab?.loadKey || 0) + 1 })} className={navButtonClass} title="Reload">
                  <RefreshCw size={15} className="stroke-[2]" />
                </button>
                <button onClick={toggleBookmark} className={`${navButtonClass} ${bookmarked ? 'text-amber-500 dark:text-amber-300' : ''}`} title="Bookmark">
                  <Bookmark size={15} fill={bookmarked ? 'currentColor' : 'none'} className="stroke-[2]" />
                </button>
              </div>
            </div>
          </div>

          <form
            className="flex min-w-0 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-2 shadow-inner dark:border-white/10 dark:bg-white/5"
            onSubmit={(e) => {
              e.preventDefault();
              if (activeTab) navigate(activeTab.input);
            }}
          >
            <Search size={15} className="flex-shrink-0 text-neutral-400" />
            <input
              value={activeTab?.input || ''}
              onChange={(e) => updateActive({ input: e.target.value })}
              className="min-w-0 flex-1 bg-transparent text-sm font-medium text-gray-800 outline-none placeholder:text-neutral-400 dark:text-gray-100"
              placeholder="Search or enter website"
            />
          </form>

          <div className="flex items-center gap-1 overflow-x-auto rounded-full border border-neutral-200/40 bg-neutral-100/60 px-1.5 py-1 shadow-sm dark:border-white/10 dark:bg-white/5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveId(tab.id)}
                className={`group flex h-8 max-w-[210px] flex-shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold transition-all ${
                  tab.id === activeTab?.id
                    ? 'bg-white text-gray-800 shadow-sm dark:bg-white/15 dark:text-white'
                    : 'text-gray-500 hover:bg-white/70 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                <Globe size={13} className="flex-shrink-0" />
                <span className="truncate">{tab.title || 'New Tab'}</span>
                <span
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                  className="rounded-full p-0.5 opacity-60 transition-all hover:bg-black/10 hover:opacity-100 dark:hover:bg-white/10"
                  title="Close Tab"
                >
                  <X size={11} />
                </span>
              </button>
            ))}
            <button onClick={() => addTab()} className={navButtonClass} title="New tab">
              <Plus size={15} className="stroke-[2.5]" />
            </button>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 p-4 pt-0 md:p-5 md:pt-0">
          <div className="relative h-full overflow-hidden rounded-2xl border border-neutral-200/60 bg-white shadow-sm dark:border-white/10 dark:bg-[#111113]">
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
    </div>
  );
}
