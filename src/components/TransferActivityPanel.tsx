import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronUp, Clock3, Copy, DatabaseBackup, Loader2, Pause,
  Play, RefreshCw, XCircle, FileText, Image, Search, AlertCircle, AlertTriangle,
  Zap, CheckCircle2, ArrowRight
} from 'lucide-react';
import { Job } from '../types';
import { useJobActivity } from '../hooks/useJobActivity';
import { usePerformanceSettings } from '../hooks/usePerformanceSettings';
import GlassSurface from '../../components/GlassSurface';

const terminal = new Set(['completed', 'failed', 'cancelled']);

function jobIcon(job: Job) {
  if (job.type === 'file.copy' || job.type === 'file.move') return Copy;
  if (job.type === 'index.files' || job.type === 'index.photos') return Search;
  if (job.type === 'ocr.run') return FileText;
  if (job.type === 'thumbnail.generate') return Image;
  return DatabaseBackup;
}

function formatBytes(value?: number) {
  if (!value || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function formatSpeed(bytesPerSec?: number) {
  if (!bytesPerSec || bytesPerSec <= 0) return '';
  return `${formatBytes(bytesPerSec)}/s`;
}

function formatEta(seconds?: number) {
  if (!seconds || seconds <= 0) return '';
  if (seconds < 60) return `${seconds}s remaining`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s remaining`;
}

const PHASE_COLORS: Record<string, string> = {
  scanning: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  comparing: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  copying: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  verifying: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  completed: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-300 border-red-500/30',
};

export default function TransferActivityPanel() {
  const { transferJobs, activeJobs, error, updateJob } = useJobActivity();
  const { settings: performanceSettings } = usePerformanceSettings();
  const [collapsed, setCollapsed] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem('homios_transfer_panel_collapsed') === 'true');
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const panel = panelRef.current;
    if (!panel) {
      root.style.removeProperty('--homios-activity-panel-offset');
      return;
    }

    const publishOffset = () => {
      root.style.setProperty('--homios-activity-panel-offset', `${Math.ceil(panel.getBoundingClientRect().height) + 12}px`);
    };
    publishOffset();
    const observer = new ResizeObserver(publishOffset);
    observer.observe(panel);
    return () => {
      observer.disconnect();
      root.style.removeProperty('--homios-activity-panel-offset');
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
      localStorage.setItem('homios_transfer_panel_collapsed', String(!current));
      return !current;
    });
  };

  return (
    <aside
      ref={panelRef}
      className="fixed bottom-5 right-5 z-[210] isolate w-[400px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[24px] text-white shadow-[0_24px_80px_rgba(0,0,0,0.55)] border border-white/15 bg-[#121216]/95 backdrop-blur-3xl"
    >
      <div className="relative z-10">
        {/* Header */}
        <button
          onClick={toggleCollapsed}
          className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.06] transition ${collapsed ? '' : 'border-b border-white/10'}`}
        >
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
            {running > 0 ? <Loader2 size={17} className="animate-spin text-blue-400" /> : <DatabaseBackup size={17} />}
            {(running + queued) > 0 && (
              <span className="absolute -right-1.5 -top-1.5 min-w-4.5 h-4.5 rounded-full bg-blue-500 px-1 text-center text-[9px] font-bold text-white flex items-center justify-center shadow">
                {running + queued}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-bold text-white tracking-tight">Transfers &amp; Backups</h2>
            <p className="truncate text-[11px] text-white/55">
              {error || (running ? `${running} running on server` : queued ? `${queued} queued on server` : 'Job center')}
            </p>
          </div>
          {collapsed ? <ChevronUp size={16} className="text-white/60" /> : <ChevronDown size={16} className="text-white/60" />}
        </button>

        {!collapsed && (
          <>
            <div className="max-h-[380px] space-y-2.5 overflow-y-auto p-3">
              {visible.map((job) => {
                const Icon = jobIcon(job);
                const isRunning = job.status === 'running';
                const progressData = job.progressData || {};
                const phase = progressData.phase || (isRunning ? 'copying' : job.status);
                const scheduled = job.status === 'queued' && job.runAt && new Date(job.runAt).getTime() > Date.now();
                const isExpanded = expandedDetails === job.id;

                const speed = formatSpeed(progressData.speedBps);
                const eta = formatEta(progressData.etaSeconds);

                return (
                  <div
                    key={job.id}
                    className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 space-y-2 transition shadow-sm"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80 border border-white/10">
                        <Icon size={15} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-bold text-white/95">{job.name}</p>
                          <span className="font-mono text-[11px] font-semibold text-white/80">{job.progress || 0}%</span>
                        </div>

                        {/* Lifecycle Phase Badge & State */}
                        <div className="mt-1 flex items-center flex-wrap gap-1.5 text-[10px]">
                          {isRunning && (
                            <span className={`px-2 py-0.5 rounded-full border text-[9px] font-bold uppercase tracking-wider ${PHASE_COLORS[phase] || 'bg-blue-500/15 text-blue-300 border-blue-500/30'}`}>
                              {phase}
                            </span>
                          )}
                          {scheduled && (
                            <span className="flex items-center gap-1 text-white/50">
                              <Clock3 size={10} />
                              <span>Scheduled</span>
                            </span>
                          )}
                          {!isRunning && !scheduled && (
                            <span className="text-white/55 font-medium capitalize">{job.status}</span>
                          )}
                          {(job.attempts || 0) > 1 && <span className="text-white/40">· attempt {job.attempts}/{job.maxAttempts}</span>}
                        </div>

                        {/* Telemetry metrics */}
                        {isRunning && (
                          <div className="mt-1.5 text-[11px] font-mono tabular-nums text-white/70 flex items-center flex-wrap gap-x-2 gap-y-0.5">
                            {progressData.filesTotal ? (
                              <span>{progressData.filesTransferred || 0}/{progressData.filesTotal} files</span>
                            ) : null}
                            {progressData.bytesTotal ? (
                              <span>
                                {formatBytes(progressData.bytesTransferred)} of {formatBytes(progressData.bytesTotal)}
                              </span>
                            ) : null}
                            {speed && <span className="text-blue-300 font-semibold">{speed}</span>}
                            {eta && <span className="text-white/50">{eta}</span>}
                          </div>
                        )}

                        {/* Progress Bar */}
                        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                          <div
                            className={`h-full rounded-full transition-[width] duration-300 ${
                              job.status === 'failed'
                                ? 'bg-red-400'
                                : job.status === 'completed'
                                  ? 'bg-emerald-400'
                                  : 'bg-blue-400'
                            }`}
                            style={{ width: `${Math.max(isRunning ? 2 : 0, job.progress || 0)}%` }}
                          />
                        </div>

                        {/* Actionable Error State */}
                        {job.error && (
                          <div className="mt-2 p-2 rounded-xl bg-red-500/15 border border-red-500/30 text-[10px] text-red-300 flex items-start gap-1.5">
                            <AlertCircle size={13} className="shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold">Protection Issue</p>
                              <p className="truncate opacity-90">{job.error}</p>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Control buttons */}
                      <div className="flex shrink-0 gap-1">
                        {job.status === 'queued' && (
                          <button onClick={() => void updateJob(job.id, 'pause')} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" title="Pause">
                            <Pause size={12} />
                          </button>
                        )}
                        {job.status === 'paused' && (
                          <button onClick={() => void updateJob(job.id, 'resume')} className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white" title="Resume">
                            <Play size={12} />
                          </button>
                        )}
                        {!terminal.has(job.status) && (
                          <button onClick={() => void updateJob(job.id, 'cancel')} className="rounded-lg p-1.5 text-white/50 hover:bg-red-500/20 hover:text-red-300" title="Cancel">
                            <XCircle size={12} />
                          </button>
                        )}
                        {(job.status === 'failed' || job.status === 'cancelled') && (
                          <button onClick={() => void updateJob(job.id, 'retry')} className="rounded-lg p-1.5 text-white/70 bg-white/10 hover:bg-white/20 hover:text-white" title="Retry">
                            <RefreshCw size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {visible.length === 0 && (
                <div className="py-6 text-center text-xs text-white/45">
                  No transfers running. Server operations will appear here.
                </div>
              )}
            </div>

            <button
              onClick={() => setShowHistory((current) => !current)}
              className="w-full border-t border-white/10 px-4 py-2.5 text-[11px] font-semibold text-white/65 hover:bg-white/[0.06] hover:text-white transition"
            >
              {showHistory ? 'Show active only' : 'Show recent history'}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
