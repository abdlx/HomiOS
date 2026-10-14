import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { normalizePath } from '../features/files/lib/files';

export type ShellRoute = { view: string; filePath: string; storeCategory: string; storeQuery: string; storeApp: string | null; settingsTab?: string };
const defaults: ShellRoute = { view: 'desktop', filePath: '/', storeCategory: 'Discover', storeQuery: '', storeApp: null, settingsTab: 'overview' };
const views = new Set(['desktop', 'files', 'settings', 'terminal', 'activity', 'notes', 'vscode', 'codex', 'coolify', 'immich', 'app-store']);
export function parseShellRoute(url: URL, fallback = 'desktop'): ShellRoute {
  const pathnameView = url.pathname.split('/')[1];
  const view = pathnameView === 'dashboard' ? url.searchParams.get('view') || 'desktop' : pathnameView || fallback;
  return { view: views.has(view) ? view : fallback, filePath: normalizePath(url.searchParams.get('path') || '/'),
    storeCategory: url.searchParams.get('category') || 'Discover', storeQuery: url.searchParams.get('q') || '', storeApp: url.searchParams.get('app'), settingsTab: url.searchParams.get('tab') || 'overview' };
}
export function shellRouteUrl(route: ShellRoute) {
  const query = new URLSearchParams();
  if (route.view === 'app-store') {
    query.set('view', 'app-store');
    if (route.storeCategory !== 'Discover') query.set('category', route.storeCategory);
    if (route.storeQuery) query.set('q', route.storeQuery);
    if (route.storeApp) query.set('app', route.storeApp);
  }
  if (route.view === 'settings' && route.settingsTab && route.settingsTab !== 'overview') query.set('tab', route.settingsTab);
  if (route.view === 'files' && route.filePath !== '/') query.set('path', route.filePath);
  return `${route.view === 'desktop' || route.view === 'app-store' ? '/dashboard' : '/' + route.view}${query.size ? '?' + query : ''}`;
}
type Navigation = { route: ShellRoute; navigate: (patch: Partial<ShellRoute>, replace?: boolean) => void; restored: boolean };
export const ShellNavigationContext = createContext<Navigation>({ route: defaults, navigate: () => {}, restored: false });
export const useShellRoute = () => useContext(ShellNavigationContext);
export function useShellNavigation(initialView: string, onView: (view: string) => void) {
  const [route, setRoute] = useState<ShellRoute>({ ...defaults, view: initialView });
  const [restored, setRestored] = useState(false);
  const routeRef = useRef(route);
  const callback = useRef(onView); callback.current = onView;
  const saved = useRef(new Map<string, ShellRoute>());
  const navigate = useCallback((patch: Partial<ShellRoute>, replace = false) => {
    const previous = routeRef.current;
    let next = { ...previous, ...patch };
    if (patch.view && patch.view !== previous.view) {
      saved.current.set(previous.view, previous);
      next = { ...next, ...saved.current.get(patch.view), ...patch };
    }
    const url = shellRouteUrl(next);
    const historyState = { ...window.history.state, homios: next };
    if (window.location.pathname + window.location.search !== url) window.history[replace ? 'replaceState' : 'pushState'](historyState, '', url);
    else window.history.replaceState(historyState, '', url);
    routeRef.current = next; setRoute(next); setRestored(false); callback.current(next.view);
  }, []);
  useEffect(() => {
    const read = () => {
      const next = { ...routeRef.current, ...parseShellRoute(new URL(window.location.href), initialView) };
      saved.current.set(routeRef.current.view, routeRef.current);
      routeRef.current = next; setRoute(next); setRestored(true); callback.current(next.view);
    };
    read();
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    window.addEventListener('popstate', read);
    return () => { window.removeEventListener('popstate', read); window.history.scrollRestoration = previous; };
  }, [initialView]);
  return { route, navigate, restored };
}
