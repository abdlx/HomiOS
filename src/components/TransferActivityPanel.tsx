import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Clock3, Copy, DatabaseBackup, Loader2, Pause, Play, RefreshCw, XCircle } from 'lucide-react';
import { Job } from '../types';
import { useJobActivity } from '../hooks/useJobActivity';
import { usePerformanceSettings } from '../hooks/usePerformanceSettings';
import GlassSurface from '../../components/GlassSurface';

const terminal = new Set(['completed', 'failed', 'cancelled']);

function jobIcon(job: Job) {
  if (job.type === 'file.copy' || job.type === 'file.move') return Copy;
  return DatabaseBackup;
}

function jobLabel(job: Job) {
  if (job.status === 'queued' && job.runAt && new Date(job.runAt).getTime() > Date.now()) return 'Scheduled';
  if (job.status === 'queued') return 'Queued';
  if (job.status === 'running') return 'Running on server';
  if (job.status === 'paused') return 'Paused';
  if (job.status === 'completed') return 'Completed';
  if (job.status === 'cancelled') return 'Cancelled';
  return 'Needs attention';
}

function formatBytes(value?: number) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

export default function TransferActivityPanel() {
  const { transferJobs, activeJobs, error, updateJob } = useJobActivity();
  const { settings: performanceSettings } = usePerformanceSettings();
  const [collapsed, setCollapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem('openfinder_transfer_panel_collapsed') === 'true');
  }, []);

  // This panel and Finder's local upload panel live in different component
  // trees. Publish our measured footprint so either panel can stack cleanly,
  // even when this one expands, collapses, or changes with server activity.
  useEffect(() => {
    const root = document.documentElement;
    const panel = panelRef.current;
    if (!panel) {
      root.style.removeProperty('--openfinder-activity-panel-offset');
      return;
    }

    const publishOffset = () => {
      root.style.setProperty('--openfinder-activity-panel-offset', `${Math.ceil(panel.getBoundingClientRect().height) + 12}px`);
    };
    publishOffset();
    const observer = new ResizeObserver(publishOffset);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--openfinder-activity-panel-offset');
    };
  }, [transferJobs.length, error]);

  const activeTransferIds = useMemo(() => new Set(activeJobs.map((job) => job.id)), [activeJobs]);
  const visible = useMemo(() => {
    const active = transferJobs.filter((job) => activeTransferIds.has(job.id));
    if (!showHistory) return active;
    return [...active, ...transferJobs.filter((job) => !activeTransferIds.has(job.id)).slice(0, 8)];
  }, [transferJobs, activeTransferIds, showHistory]);

  if (transferJobs.length === 0 && !error) return null;
  const running = visible.filter((job) => job.status === 'running').length;
  const queued = visible.filter((job) => job.status === 'queued').length;

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      localStorage.setItem('openfinder_transfer_panel_collapsed', String(!current));
      return !current;
    });
  };

  return (
    <aside ref={panelRef} className="fixed bottom-5 right-5 z-[210] isolate w-[380px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[24px] text-white shadow-[0_24px_80px_rgba(0,0,0,.34)]">
      <div className="pointer-events-none absolute inset-0 z-0">
        {performanceSettings.glassSurfaces ? (
          <GlassSurface
            width="100%"
            height="100%"
            borderRadius={24}
            distortionScale={300}
            opacity={1}
            borderWidth={0.2}
            displace={1.6}
            backgroundOpacity={0}
          />
        ) : (
          <div className="h-full w-full rounded-[24px] border border-white/10 bg-black/30 shadow-[0_14px_36px_rgba(0,0,0,0.24)] backdrop-blur-md" />
        )}
      </div>
      <div className="relative z-10">
      <button onClick={toggleCollapsed} className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.04] ${collapsed ? '' : 'border-b border-white/10'}`}>
        <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
          {running > 0 ? <Loader2 size={17} className="animate-spin" /> : <DatabaseBackup size={17} />}
          {(running + queued) > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-blue-500 px-1 text-center text-[9px] font-bold text-white">{running + queued}</span>}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Transfers & backups</h2>
          <p className="truncate text-[11px] text-white/45">
            {error || (running ? `${running} running on the server` : queued ? `${queued} queued or scheduled` : 'Recent server activity')}
          </p>
        </div>
        {collapsed ? <ChevronUp size={16} className="text-white/45" /> : <ChevronDown size={16} className="text-white/45" />}
      </button>

      {!collapsed && (
        <>
          <div className="max-h-[360px] space-y-2 overflow-y-auto p-3">
            {visible.map((job) => {
              const Icon = jobIcon(job);
              const scheduled = job.status === 'queued' && job.runAt && new Date(job.runAt).getTime() > Date.now();
              return (
                <div key={job.id} className="rounded-2xl border border-white/8 bg-white/[0.055] p-3">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/8 text-white/65"><Icon size={15} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold">{job.name}</p>
                        <span className="font-mono text-[10px] text-white/55">{job.progress || 0}%</span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/42">
                        {scheduled && <Clock3 size={10} />}
                        <span>{jobLabel(job)}</span>
                        {(job.attempts || 0) > 1 && <span>· attempt {job.attempts}/{job.maxAttempts}</span>}
                      </div>
                      {!!job.progressData?.bytesTotal && (
                        <p className="mt-1 text-[10px] tabular-nums text-white/35">
                          {formatBytes(job.progressData.bytesTransferred)} of {formatBytes(job.progressData.bytesTotal)}
                          {job.progressData.filesTotal ? ` · ${job.progressData.filesTransferred || 0}/${job.progressData.filesTotal} files` : ''}
                        </p>
                      )}
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                        <div className={`h-full rounded-full transition-[width] duration-300 ${job.status === 'failed' ? 'bg-red-400' : job.status === 'completed' ? 'bg-emerald-400' : 'bg-blue-400'}`} style={{ width: `${Math.max(job.status === 'running' ? 2 : 0, job.progress || 0)}%` }} />
                      </div>
                      {job.error && <p className="mt-1.5 truncate text-[10px] text-red-300/80">{job.error}</p>}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {job.status === 'queued' && <button onClick={() => void updateJob(job.id, 'pause')} className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white" title="Pause"><Pause size={12} /></button>}
                      {job.status === 'paused' && <button onClick={() => void updateJob(job.id, 'resume')} className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white" title="Resume"><Play size={12} /></button>}
                      {!terminal.has(job.status) && <button onClick={() => void updateJob(job.id, 'cancel')} className="rounded-lg p-1.5 text-white/45 hover:bg-red-500/15 hover:text-red-300" title="Cancel"><XCircle size={12} /></button>}
                      {(job.status === 'failed' || job.status === 'cancelled') && <button onClick={() => void updateJob(job.id, 'retry')} className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white" title="Retry"><RefreshCw size={12} /></button>}
                    </div>
                  </div>
                </div>
              );
            })}
            {visible.length === 0 && <div className="py-5 text-center text-xs text-white/40">No transfers are running. Recent history is still stored on the server.</div>}
          </div>
          <button onClick={() => setShowHistory((current) => !current)} className="w-full border-t border-white/10 px-4 py-2.5 text-[11px] font-semibold text-white/55 hover:bg-white/[0.04] hover:text-white">
            {showHistory ? 'Show active only' : 'Show recent history'}
          </button>
        </>
      )}
      </div>
    </aside>
  );
}
