import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileItem } from '../types';
import { normalizePath, parentPath, toFileItem } from '../lib/files';

type Entry = { files: FileItem[]; time: number };
const cache = new Map<string, Entry>();
const listeners = new Set<() => void>();
export function invalidateDirectories(...paths: string[]) {
  paths.forEach(path => cache.delete(normalizePath(path)));
  listeners.forEach(listener => listener());
}
export function invalidateFilePaths(...paths: string[]) { invalidateDirectories(...paths.map(parentPath)); }
export async function readDirectory(path: string, signal?: AbortSignal): Promise<FileItem[]> {
  const response = await fetch(`/api/files?path=${encodeURIComponent(normalizePath(path))}&includeCounts=false`, { signal, cache: 'no-store' });
  if (response.status === 401) { window.location.assign('/login'); throw new Error('Please sign in again.'); }
  if (!response.ok) {
    const value = await response.json().catch(() => ({}));
    throw new Error(value.error || (response.status === 404 ? 'This folder no longer exists.' : 'This folder could not be opened.'));
  }
  const value = await response.json();
  if (!Array.isArray(value)) throw new Error('The server returned an invalid folder listing.');
  return value.map(toFileItem);
}
export function useDirectory(input: string, enabled = true) {
  const path = normalizePath(input);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ path: string; files?: FileItem[]; error?: string; pending: boolean }>({ path, pending: true });
  const generation = useRef(0);
  const visited = useRef(false);
  const refresh = useCallback(() => { cache.delete(path); setRevision(value => value + 1); }, [path]);
  useEffect(() => {
    const invalidate = () => { if (!cache.has(path)) setRevision(value => value + 1); };
    listeners.add(invalidate);
    return () => { listeners.delete(invalidate); };
  }, [path]);
  useEffect(() => {
    if (!enabled) return;
    const request = ++generation.current;
    const controller = new AbortController();
    const existing = cache.get(path);
    setState({ path, files: existing?.files, pending: !existing || Date.now() - existing.time >= 5000 });
    if (existing && Date.now() - existing.time < 5000) return;
    void readDirectory(path, controller.signal).then(files => {
      if (request !== generation.current || controller.signal.aborted) return;
      cache.delete(path); cache.set(path, { files, time: Date.now() });
      if (cache.size > 40) cache.delete(cache.keys().next().value!);
      visited.current = true;
      setState({ path, files, pending: false });
    }).catch(error => {
      if (controller.signal.aborted || request !== generation.current) return;
      setState({ path, files: existing?.files, pending: false, error: error.message });
    });
    return () => { controller.abort(); };
  }, [path, revision, enabled]);
  // Effects run after paint: derive from the requested path to prevent even one stale frame.
  const current = state.path === path ? state : { path, files: cache.get(path)?.files, pending: true, error: undefined };
  const files = current.files || [];
  const status = current.pending ? (current.files ? 'refreshing' : visited.current ? 'navigating' : 'initial-loading') : current.error ? 'error' : files.length ? 'ready' : 'empty';
  return { files, error: current.error, status, loading: current.pending && !current.files, refreshing: current.pending && !!current.files, refresh };
}
