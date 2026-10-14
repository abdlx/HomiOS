import { useCallback, useEffect, useRef, useState } from 'react';
const remoteCache = new Map<string, unknown>();
export function useRemoteResource<T>(url: string, enabled = true) {
  const [state, setState] = useState<{ url: string; data?: T; error?: string; pending: boolean }>({ url, pending: true });
  const controller = useRef<AbortController | null>(null);
  const refresh = useCallback(async (override?: string) => {
    controller.current?.abort(); const current = new AbortController(); controller.current = current;
    setState(previous => ({ url, data: previous.url === url ? previous.data : remoteCache.get(url) as T, pending: true }));
    try {
      const response = await fetch(override || url, { signal: current.signal, cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
      if (!current.signal.aborted) { remoteCache.set(url, data); setState({ url, data, pending: false }); }
      return data as T;
    } catch (error) {
      if (!current.signal.aborted) setState(previous => ({ ...previous, pending: false, error: error instanceof Error ? error.message : 'The server could not be reached.' }));
      return undefined;
    }
  }, [url]);
  useEffect(() => { if (enabled) void refresh(); return () => controller.current?.abort(); }, [refresh, enabled]);
  const current = state.url === url ? state : { url, data: remoteCache.get(url) as T | undefined, pending: true, error: undefined };
  return { ...current, loading: current.pending && !current.data, refreshing: current.pending && !!current.data, refresh };
}
