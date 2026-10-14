import { useEffect, useRef, useState } from 'react';
import { useShellRoute } from './useShellNavigation';
import { normalizePath, partsPath, pathParts } from '../lib/files';

export function useFileNavigation() {
  const { route, navigate, restored } = useShellRoute();
  const [history, setHistory] = useState(['/']);
  const [index, setIndex] = useState(0);
  const ref = useRef({ history, index }); ref.current = { history, index };
  const path = route.filePath;
  useEffect(() => {
    const current = ref.current;
    if (current.history[current.index] === path) return;
    const existing = restored ? current.history.lastIndexOf(path) : -1;
    if (existing >= 0) setIndex(existing);
    else { const next = [...current.history.slice(0, current.index + 1), path]; setHistory(next); setIndex(next.length - 1); }
  }, [path, restored]);
  return { path, currentPath: pathParts(path), pathHistory: history, historyIndex: index,
    pushPath: (parts: string[]) => navigate({ view: 'files', filePath: partsPath(parts) }),
    navigatePath: (next: string) => navigate({ view: 'files', filePath: normalizePath(next) }),
    back: () => { if (index > 0) { setIndex(index - 1); navigate({ filePath: history[index - 1] }); } },
    forward: () => { if (index < history.length - 1) { setIndex(index + 1); navigate({ filePath: history[index + 1] }); } } };
}
