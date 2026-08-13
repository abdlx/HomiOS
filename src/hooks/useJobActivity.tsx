import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Job } from '../types';

type JobAction = 'pause' | 'resume' | 'cancel' | 'retry';
type JobActivityContextValue = {
  jobs: Job[];
  activeJobs: Job[];
  transferJobs: Job[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  updateJob: (id: string, action: JobAction) => Promise<void>;
};

const JobActivityContext = createContext<JobActivityContextValue | null>(null);
const TRANSFER_TYPES = new Set(['file.copy', 'file.move', 'backup.run', 'backup.restore', 'sync.run']);

export function JobActivityProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const hasActiveRef = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch('/api/jobs?limit=100', { cache: 'no-store' });
      if (!response.ok) throw new Error(`Job service returned ${response.status}`);
      const nextJobs = await response.json();
      setJobs(nextJobs);
      hasActiveRef.current = nextJobs.some((job: Job) => job.status === 'running' || job.status === 'queued');
      setError(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Job service is unavailable');
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    let timer: number | null = null;
    let cancelled = false;
    const schedule = () => {
      if (cancelled) return;
      const delay = document.hidden ? 10_000 : hasActiveRef.current ? 1_250 : 5_000;
      timer = window.setTimeout(async () => {
        await refresh();
        schedule();
      }, delay);
    };
    void refresh().then(schedule);
    const wake = () => void refresh();
    window.addEventListener('focus', wake);
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', wake);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
      window.removeEventListener('focus', wake);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', wake);
    };
  }, [refresh]);

  const updateJob = useCallback(async (id: string, action: JobAction) => {
    const response = await fetch(`/api/jobs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) throw new Error(`Could not ${action} job`);
    const updated = await response.json();
    setJobs((current) => current.map((job) => job.id === id ? updated : job));
    await refresh();
  }, [refresh]);

  const value = useMemo<JobActivityContextValue>(() => ({
    jobs,
    activeJobs: jobs.filter((job) => job.status === 'queued' || job.status === 'running' || job.status === 'paused'),
    transferJobs: jobs.filter((job) => TRANSFER_TYPES.has(job.type)),
    loading,
    error,
    refresh,
    updateJob,
  }), [jobs, loading, error, refresh, updateJob]);

  return <JobActivityContext.Provider value={value}>{children}</JobActivityContext.Provider>;
}

export function useJobActivity() {
  const context = useContext(JobActivityContext);
  if (!context) throw new Error('useJobActivity must be used inside JobActivityProvider');
  return context;
}
