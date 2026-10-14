import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FileItem } from '../types';
import { type CollisionPolicy, type FileClipboard, isCloudPath, normalizePath, operationUnavailable } from '../lib/files';
import { invalidateFilePaths, readDirectory } from './useDirectory';
import { useJobActivity } from './useJobActivity';
import { toast } from '../components/SystemUI';

let clipboard: FileClipboard | null = null;
const clipboardListeners = new Set<() => void>();
const subscribe = (listener: () => void) => { clipboardListeners.add(listener); return () => { clipboardListeners.delete(listener); }; };
export function useFileClipboard() {
  const value = useSyncExternalStore(subscribe, () => clipboard, () => null);
  const set = (next: FileClipboard | null) => {
    clipboard = next ? Object.freeze({ action: next.action, items: Object.freeze(next.items.map(item => Object.freeze({ ...item }))) }) : null;
    clipboardListeners.forEach(listener => listener());
  };
  return [value, set] as const;
}
type Decision = { policy: CollisionPolicy; applyAll: boolean } | null;
export type ConflictRequest = { name: string; count: number; cloud: boolean; resolve: (decision: Decision) => void };
export type Submission = { key: string; batchId: string; action: 'copy' | 'move'; item: FileItem; destination: string; jobId?: string; error?: string; immediate?: boolean; skipped?: boolean };

export function useFileOperations() {
  const [clipboardState, setClipboard] = useFileClipboard();
  const { jobs, refresh } = useJobActivity();
  const [conflict, setConflict] = useState<ConflictRequest | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [preparing, setPreparing] = useState(false);
  const inFlight = useRef(false);
  const active = useRef(new Map<string, string>());
  const handled = useRef(new Set<string>());
  const conflictRef = useRef(conflict); conflictRef.current = conflict;
  useEffect(() => () => { conflictRef.current?.resolve(null); }, []);
  useEffect(() => {
    for (const job of jobs) {
      if (!['file.copy', 'file.move'].includes(job.type) || !['completed', 'failed', 'cancelled'].includes(job.status) || handled.current.has(job.id)) continue;
      handled.current.add(job.id);
      const payload = job.payload as any;
      active.current.delete(`${job.type}:${normalizePath(payload.sourcePath)}:${normalizePath(payload.destinationPath)}`);
      if (job.status === 'completed') {
        invalidateFilePaths(payload.sourcePath, payload.destinationPath);
        if (job.type === 'file.move' && !(job.result as any)?.skipped && clipboard?.action === 'cut') {
          const remaining = clipboard.items.filter(item => normalizePath(item.id) !== normalizePath(payload.sourcePath));
          setClipboard(remaining.length ? { action: 'cut', items: remaining } : null);
        }
      }
    }
  }, [jobs]);
  function resolveConflict(decision: Decision) { conflict?.resolve(decision); setConflict(null); }
  async function runBatch(action: 'copy' | 'move', items: readonly FileItem[], target: string) {
    if (!items.length || inFlight.current) return;
    const destination = normalizePath(target);
    const unavailable = operationUnavailable(items, destination, action);
    if (unavailable) { toast({ message: unavailable, tone: 'warning' }); return; }
    inFlight.current = true; setPreparing(true);
    const batchId = crypto.randomUUID();
    try {
      const listing = await readDirectory(destination);
      const existing = new Set(listing.map(item => item.name));
      const remaining = items.filter(item => !(action === 'move' && normalizePath(item.id) === normalizePath(destination + '/' + item.name)));
      const conflicts = remaining.filter(item => existing.has(item.name));
      let all: CollisionPolicy | null = null;
      const work: Submission[] = [];
      const policies = new Map<string, CollisionPolicy>();
      for (const item of remaining) {
        const key = `file.${action}:${normalizePath(item.id)}:${normalizePath(destination + '/' + item.name)}`;
        if (active.current.has(key)) continue;
        let policy: CollisionPolicy = 'error';
        if (existing.has(item.name)) {
          if (all) policy = all;
          else {
            const decision = await new Promise<Decision>(resolve => setConflict({ name: item.name, count: conflicts.length, cloud: isCloudPath(destination), resolve }));
            setConflict(null);
            if (!decision) return;
            policy = decision.policy;
            if (decision.applyAll) all = policy;
          }
        }
        if (policy === 'skip') continue;
        policies.set(key, policy);
        work.push({ key, batchId, action, item: { ...item }, destination });
      }
      if (!work.length) { toast({ message: 'No items need to be transferred.', tone: 'info' }); return; }
      work.forEach(item => active.current.set(item.key, 'submitting'));
      setSubmissions(current => [...current.slice(-100), ...work]);
      let index = 0;
      const update = (key: string, patch: Partial<Submission>) => setSubmissions(current => current.map(item => item.key === key && item.batchId === batchId ? { ...item, ...patch } : item));
      await Promise.all(Array.from({ length: Math.min(4, work.length) }, async () => {
        while (index < work.length) {
          const submission = work[index++];
          try {
            const response = await fetch(`/api/files/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourcePath: normalizePath(submission.item.id), destinationPath: normalizePath(destination + '/' + submission.item.name), collision: policies.get(submission.key), batchId, idempotencyKey: crypto.randomUUID() }) });
            const value = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(value.error || `Could not queue ${action}`);
            update(submission.key, { jobId: value.jobId || value.id, immediate: !!value.immediate });
            if (value.immediate) {
              active.current.delete(submission.key); invalidateFilePaths(submission.item.id, destination + '/' + submission.item.name);
              if (action === 'move' && clipboard?.action === 'cut') { const next = clipboard.items.filter(item => item.id !== submission.item.id); setClipboard(next.length ? { action: 'cut', items: next } : null); }
            } else active.current.set(submission.key, value.jobId || value.id);
          } catch (error) { active.current.delete(submission.key); update(submission.key, { error: error instanceof Error ? error.message : 'Transfer failed' }); }
        }
      }));
      await refresh();
    } catch (error) { toast({ message: 'Could not prepare the transfer', description: error instanceof Error ? error.message : undefined, tone: 'danger' }); }
    finally { inFlight.current = false; setPreparing(false); }
  }
  const hydrated = submissions.map(submission => {
    const job = jobs.find(item => item.id === submission.jobId);
    return { ...submission, status: submission.error ? 'failed' : submission.immediate ? 'completed' : job?.status || 'queued', error: submission.error || job?.error, progress: job?.progress || 0 };
  });
  return { clipboard: clipboardState, setClipboard, conflict, resolveConflict, preparing, runBatch, submissions: hydrated,
    clearFinished: () => setSubmissions(current => current.filter(item => { const job = jobs.find(job => job.id === item.jobId); return !item.error && !item.immediate && !['completed', 'failed', 'cancelled'].includes(job?.status || 'queued'); })),
    paste: (destination: string) => clipboardState && runBatch(clipboardState.action === 'cut' ? 'move' : 'copy', clipboardState.items, destination) };
}
