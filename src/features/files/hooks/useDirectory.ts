import { useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getQueryClient } from '../../../providers/ServerDataProvider';
import type { FileItem } from '../../../types';
import { normalizePath, parentPath, toFileItem } from '../lib/files';

const directoryKey = (path: string) => ['files', 'directory', normalizePath(path)] as const;
export function invalidateDirectories(...paths: string[]) {
  const client = getQueryClient();
  paths.forEach(path => { void client.invalidateQueries({ queryKey: directoryKey(path), exact: true }); });
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
  const visited = useRef(false);
  const query = useQuery<FileItem[], Error>({ queryKey: directoryKey(path), queryFn: ({ signal }) => readDirectory(path, signal), enabled, staleTime: 5000 });
  const refresh = useCallback(() => { void query.refetch(); }, [query.refetch]);
  if (query.data) visited.current = true;
  const files = query.data || EMPTY_FILES;
  const loading = query.isPending && !query.data;
  const refreshing = query.isFetching && !!query.data;
  const status = loading ? visited.current ? 'navigating' : 'initial-loading' : query.error ? 'error' : refreshing ? 'refreshing' : files.length ? 'ready' : 'empty';
  return { files, error: query.error?.message, status, loading, refreshing, refresh };
}
const EMPTY_FILES: FileItem[] = [];
