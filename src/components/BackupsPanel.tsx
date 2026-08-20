import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight, CheckCircle2, Clock, HardDrive, Loader2, Pause, Play, Plus,
  RefreshCw, Trash2, TriangleAlert, X, Shield, Layers, Copy, AlertTriangle,
  Info, AlertCircle, Calendar
} from 'lucide-react';
import { DriveItem, ProtectionMode, SyncSchedule } from '../types';
import { confirmDialog, toast } from './SystemUI';

interface SyncPlan {
  id: string;
  name: string;
  sources: string[];
  destinations: string[];
  sourceUuids?: string[];
  destinationUuids?: string[];
  mode: ProtectionMode;
  mirrorDeletes: boolean;
  retentionDays?: number;
  schedule: SyncSchedule;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  running?: boolean;
}

interface SyncRunPair {
  source: string;
  target: string;
  status: 'completed' | 'skipped' | 'failed';
  filesCopied: number;
  filesSkipped: number;
  filesDeleted: number;
  bytesCopied: number;
  error?: string;
}

interface SyncRun {
  id: string;
  planId: string;
  status: string;
  phase?: string;
  filesCopied: number;
  filesSkipped: number;
  filesDeleted: number;
  bytesCopied: number;
  filesTotal?: number;
  bytesTotal?: number;
  pairs: SyncRunPair[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

const SCHEDULE_LABELS: Record<SyncSchedule, string> = {
  manual: 'Manual only',
  hourly: 'Every hour',
  six_hourly: 'Every 6 hours',
  daily: 'Daily',
  weekly: 'Weekly',
};

const MODE_DESCRIPTIONS: Record<ProtectionMode, { title: string; subtitle: string }> = {
  backup: {
    title: 'Backup (Preserve)',
    subtitle: 'Preserves destination files; source deletions are not removed from the backup copy.',
  },
  mirror: {
    title: 'Mirror (Exact)',
    subtitle: 'Exact replica; changes and deletions from the source are reflected in the destination.',
  },
  versioned: {
    title: 'Versioned Backup',
    subtitle: 'Retains modified and deleted versions in timestamped snapshots with automatic pruning.',
  },
};

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value >= 10 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
};

const formatWhen = (value: string | null) => {
  if (!value) return 'Never';
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const nextScheduledRun = (schedule: SyncSchedule, lastRunAt: string | null): string => {
  if (schedule === 'manual') return 'Manual trigger only';
  const last = lastRunAt ? new Date(`${lastRunAt.replace(' ', 'T')}Z`).getTime() : Date.now();
  const intervals: Record<SyncSchedule, number> = {
    manual: 0,
    hourly: 60 * 60 * 1000,
    six_hourly: 6 * 60 * 60 * 1000,
    daily: 24 * 60 * 60 * 1000,
    weekly: 7 * 24 * 60 * 60 * 1000,
  };
  const next = new Date(last + (intervals[schedule] || 0));
  return next.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusStyles: Record<string, string> = {
  completed: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
  partial: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
  failed: 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400',
  running: 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400',
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border capitalize ${statusStyles[status] || 'bg-slate-500/10 border-slate-500/30 text-slate-500 dark:text-slate-400'}`}>
      {status}
    </span>
  );
}

function DrivePicker({
  drives, selected, onToggle, disabledPaths, emptyHint,
}: {
  drives: DriveItem[];
  selected: string[];
  onToggle: (path: string) => void;
  disabledPaths: string[];
  emptyHint: string;
}) {
  if (drives.length === 0) {
    return <p className="text-xs text-slate-400 dark:text-slate-500 py-2">{emptyHint}</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {drives.map((drive) => {
        const isSelected = selected.includes(drive.path);
        const isDisabled = !isSelected && disabledPaths.includes(drive.path);
        return (
          <button
            key={drive.path}
            type="button"
            disabled={isDisabled}
            onClick={() => onToggle(drive.path)}
            className={`flex items-center space-x-3 text-left px-3 py-2.5 rounded-xl border transition-all ${
              isSelected
                ? 'bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-400'
                : isDisabled
                  ? 'bg-slate-50 border-slate-200 opacity-40 cursor-not-allowed dark:bg-white/5 dark:border-white/10'
                  : 'bg-white border-slate-200 hover:border-slate-300 dark:bg-white/5 dark:border-white/10 dark:hover:border-white/20'
            }`}
          >
            <span className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 ${
              isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-white/20'
            }`}>
              {isSelected && <CheckCircle2 size={12} className="text-white" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{drive.label}</span>
              <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                <span className="truncate">{drive.path}</span>
                <span>Free: {drive.freeBytes || 'Unknown'}</span>
              </div>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function BackupsPanel() {
  const [drives, setDrives] = useState<DriveItem[]>([]);
  const [plans, setPlans] = useState<SyncPlan[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [destinations, setDestinations] = useState<string[]>([]);
  const [mode, setMode] = useState<ProtectionMode>('backup');
  const [schedule, setSchedule] = useState<SyncSchedule>('daily');
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadPlans = useCallback(async () => {
    try {
      const res = await fetch('/api/sync');
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans || []);
        setRuns(data.runs || []);
      }
    } catch (e) {
      console.error('Failed to load sync plans:', e);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const driveRes = await fetch('/api/drives/available');
      if (driveRes.ok) {
        const data = await driveRes.json();
        setDrives(data.filter((d: DriveItem) => d.isMounted && d.path));
      }
    } catch (e) {
      console.error('Failed to load drives:', e);
    }
    await loadPlans();
    setLoading(false);
  }, [loadPlans]);

  useEffect(() => { loadAll(); }, [loadAll]);

  useEffect(() => {
    const active = plans.some((plan) => plan.running);
    if (!active) return;
    pollTimer.current = setTimeout(() => { loadPlans(); }, 3000);
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, [plans, runs, loadPlans]);

  const resetForm = () => {
    setIsCreating(false);
    setEditingId(null);
    setName('');
    setSources([]);
    setDestinations([]);
    setMode('backup');
    setSchedule('daily');
    setRetentionDays(30);
    setFormError('');
  };

  const startCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const startEdit = (plan: SyncPlan) => {
    setIsCreating(true);
    setEditingId(plan.id);
    setName(plan.name);
    setSources(plan.sources);
    setDestinations(plan.destinations);
    setMode(plan.mode || 'backup');
    setSchedule(plan.schedule);
    setRetentionDays(plan.retentionDays || 30);
    setFormError('');
  };

  const toggle = (list: string[], setList: (next: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  };

  const savePlan = async () => {
    setFormError('');
    if (!name.trim()) return setFormError('Give this backup policy a name');
    if (sources.length === 0) return setFormError('Select at least one source drive to protect');
    if (destinations.length === 0) return setFormError('Select at least one destination drive');

    setSaving(true);
    const body = {
      name: name.trim(),
      sources,
      destinations,
      mode,
      mirrorDeletes: mode === 'mirror',
      retentionDays: mode === 'versioned' ? retentionDays : undefined,
      schedule,
    };
    try {
      const res = await fetch(editingId ? `/api/sync/${editingId}` : '/api/sync', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || 'Could not save this protection plan');
      } else {
        toast({ message: editingId ? 'Policy updated' : 'Protection policy created', tone: 'success' });
        resetForm();
        await loadPlans();
      }
    } catch {
      setFormError('Connection error');
    }
    setSaving(false);
  };

  const runPlan = async (plan: SyncPlan) => {
    setBusyPlan(plan.id);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', planId: plan.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ message: 'Backup started', description: `${plan.name} is copying in the background`, tone: 'success' });
      } else {
        toast({ message: data.error || 'Could not start backup', tone: 'danger' });
      }
    } catch {
      toast({ message: 'Connection error', tone: 'danger' });
    }
    setBusyPlan(null);
    loadPlans();
  };

  const togglePlanEnabled = async (plan: SyncPlan) => {
    setBusyPlan(plan.id);
    await fetch(`/api/sync/${plan.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !plan.enabled }),
    }).catch(() => {});
    setBusyPlan(null);
    loadPlans();
  };

  const deletePlan = async (plan: SyncPlan) => {
    const ok = await confirmDialog({
      title: `Delete "${plan.name}"?`,
      message: 'The schedule and history are removed. Files already copied to destination drives are preserved.',
      tone: 'danger',
      confirmLabel: 'Delete Policy',
    });
    if (!ok) return;
    setBusyPlan(plan.id);
    await fetch(`/api/sync/${plan.id}`, { method: 'DELETE' }).catch(() => {});
    setBusyPlan(null);
    if (editingId === plan.id) resetForm();
    toast({ message: 'Protection policy deleted', tone: 'success' });
    loadPlans();
  };

  const driveFor = (drivePath: string) =>
    drives.find((drive) => drive.path === drivePath);

  const labelFor = (drivePath: string) =>
    driveFor(drivePath)?.label || drivePath;

  return (
    <div className="flex-1 bg-transparent p-8 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">Scheduled Local Protection</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Keep scheduled local copies of your drives on another disk
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadAll}
            className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10 shadow-sm transition-all text-xs font-medium"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          {!isCreating && (
            <button
              onClick={startCreate}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all text-xs font-semibold"
            >
              <Plus size={14} />
              <span>New Protection Policy</span>
            </button>
          )}
        </div>
      </div>

      {/* Create / edit form */}
      {isCreating && (
        <div className="mb-6 bg-white dark:bg-[#1f1f22] border border-slate-200 dark:border-white/10 rounded-2xl p-6 shadow-sm space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/10 pb-3">
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {editingId ? 'Edit Protection Policy' : 'Create Protection Policy'}
            </h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={16} />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Policy Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Media drives to backup array"
              className="w-full text-sm rounded-xl px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Source Drives <span className="font-normal text-slate-400">— data to protect</span>
              </label>
              <DrivePicker
                drives={drives}
                selected={sources}
                onToggle={(p) => toggle(sources, setSources, p)}
                disabledPaths={destinations}
                emptyHint="No mounted drives detected."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Destination Drives <span className="font-normal text-slate-400">— where copies land</span>
              </label>
              <DrivePicker
                drives={drives}
                selected={destinations}
                onToggle={(p) => toggle(destinations, setDestinations, p)}
                disabledPaths={sources}
                emptyHint="No mounted drives detected."
              />
            </div>
          </div>

          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Protection Mode</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setMode('backup')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  mode === 'backup'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-200 dark:border-white/10 hover:border-slate-300 bg-white dark:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white mb-1">
                  <Shield size={14} className="text-emerald-500" />
                  <span>Backup (Preserve)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Preserves destination files; source deletions are not removed.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('mirror')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  mode === 'mirror'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-200 dark:border-white/10 hover:border-slate-300 bg-white dark:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white mb-1">
                  <Copy size={14} className="text-blue-500" />
                  <span>Mirror (Exact)</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Exact replica; changes and deletions propagate to destination.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('versioned')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  mode === 'versioned'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-200 dark:border-white/10 hover:border-slate-300 bg-white dark:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white mb-1">
                  <Layers size={14} className="text-purple-500" />
                  <span>Versioned Backup</span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">
                  Retains modified/deleted files in dated snapshots with retention policy.
                </p>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Schedule</label>
              <select
                value={schedule}
                onChange={(e) => setSchedule(e.target.value as SyncSchedule)}
                className="w-full text-sm rounded-xl px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400"
              >
                {(Object.keys(SCHEDULE_LABELS) as SyncSchedule[]).map((value) => (
                  <option key={value} value={value}>{SCHEDULE_LABELS[value]}</option>
                ))}
              </select>
            </div>

            {mode === 'versioned' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Snapshot Retention</label>
                <select
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="w-full text-sm rounded-xl px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400"
                >
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                  <option value={30}>30 days (Recommended)</option>
                  <option value={90}>90 days</option>
                  <option value={365}>1 year</option>
                </select>
              </div>
            )}
          </div>

          {formError && (
            <div className="flex items-center space-x-2 text-xs px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-500/30">
              <TriangleAlert size={14} />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100 dark:border-white/10">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={savePlan}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center space-x-2 shadow-sm"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              <span>{editingId ? 'Save changes' : 'Create Policy'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Policy list */}
      {loading && plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400 text-sm bg-slate-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
          <RefreshCw size={22} className="animate-spin text-blue-500 mb-3" />
          <p>Loading protection policies...</p>
        </div>
      ) : plans.length === 0 && !isCreating ? (
        <div className="flex flex-col items-center justify-center h-56 space-y-3 bg-slate-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center">
            <Shield size={22} className="text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No protection policies configured</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm text-center">
            Pick the drives holding your data and destination drives to receive scheduled local copies.
          </p>
          <button
            onClick={startCreate}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            Create your first protection policy
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => {
            const planRuns = runs.filter((run) => run.planId === plan.id);
            const latest = planRuns[0];
            const isBusy = busyPlan === plan.id;

            // Capacity calculation
            const sourceDrives = plan.sources.map(driveFor).filter(Boolean) as DriveItem[];
            const destDrives = plan.destinations.map(driveFor).filter(Boolean) as DriveItem[];
            const sourceUsedBytes = sourceDrives.reduce((acc, d) => acc + (d.usedBytesNumber || 0), 0);
            const destFreeBytes = destDrives.reduce((acc, d) => acc + (d.freeBytesNumber || 0), 0);
            const isDestLowSpace = destFreeBytes > 0 && (sourceUsedBytes > destFreeBytes || destDrives.some((d) => (d.usagePercent || 0) >= 85));

            return (
              <div
                key={plan.id}
                className="bg-white dark:bg-[#1f1f22] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center flex-wrap gap-2">
                      <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{plan.name}</h3>
                      {plan.running ? (
                        <span className="flex items-center space-x-1.5 text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400">
                          <Loader2 size={10} className="animate-spin" />
                          <span>Syncing...</span>
                        </span>
                      ) : (
                        <StatusBadge status={plan.lastStatus} />
                      )}
                      <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400">
                        {MODE_DESCRIPTIONS[plan.mode]?.title || plan.mode}
                      </span>
                      {!plan.enabled && (
                        <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-slate-500/10 border-slate-500/30 text-slate-500 dark:text-slate-400">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                      <span className="flex items-center space-x-1">
                        <Clock size={11} />
                        <span>{SCHEDULE_LABELS[plan.schedule]}</span>
                      </span>
                      <span>Last backup: {formatWhen(plan.lastRunAt)}</span>
                      {plan.enabled && (
                        <span className="flex items-center gap-1 text-slate-400">
                          <Calendar size={11} />
                          <span>Next run: {nextScheduledRun(plan.schedule, plan.lastRunAt)}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    <button
                      onClick={() => runPlan(plan)}
                      disabled={isBusy || plan.running}
                      title="Sync now"
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center space-x-1.5 shadow-sm"
                    >
                      {plan.running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      <span>{plan.running ? 'Syncing' : 'Sync now'}</span>
                    </button>
                    <button
                      onClick={() => togglePlanEnabled(plan)}
                      disabled={isBusy}
                      title={plan.enabled ? 'Pause schedule' : 'Resume schedule'}
                      className="p-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/10 disabled:opacity-50"
                    >
                      {plan.enabled ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button
                      onClick={() => startEdit(plan)}
                      className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deletePlan(plan)}
                      disabled={isBusy}
                      title="Delete policy"
                      className="p-2 rounded-xl border border-slate-200 dark:border-white/10 text-slate-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-500/40 disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Capacity Forecasting & Warnings */}
                {isDestLowSpace && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
                    <AlertTriangle size={15} className="mt-0.5 shrink-0 text-amber-500" />
                    <div>
                      <p className="font-semibold">Capacity Warning</p>
                      <p className="text-[11px] opacity-90">
                        Protected capacity: {formatBytes(sourceUsedBytes)} · Destination free space: {formatBytes(destFreeBytes)}. Protection is at risk of exhaustion.
                      </p>
                    </div>
                  </div>
                )}

                {/* Sources -> Destinations Map */}
                <div className="flex items-center flex-wrap gap-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl px-4 py-3">
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mr-1">Source:</span>
                    {plan.sources.map((source) => (
                      <span key={source} className="text-[10px] font-mono px-2 py-1 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200">
                        {labelFor(source)}
                      </span>
                    ))}
                  </div>
                  <ArrowRight size={14} className="text-slate-400 shrink-0" />
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mr-1">Destination:</span>
                    {plan.destinations.map((destination) => (
                      <span key={destination} className="text-[10px] font-mono px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 text-blue-600 dark:text-blue-300">
                        {labelFor(destination)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Latest run stats */}
                {latest && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center space-x-2">
                        <StatusBadge status={latest.status} />
                        <span>{formatWhen(latest.createdAt)}</span>
                      </span>
                      <span className="font-mono">
                        {latest.filesCopied} copied · {latest.filesSkipped} up to date
                        {latest.filesDeleted > 0 ? ` · ${latest.filesDeleted} removed` : ''} · {formatBytes(latest.bytesCopied)}
                      </span>
                    </div>
                    {latest.error && (
                      <div className="flex items-start space-x-2 text-[11px] px-3 py-2 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-500/30">
                        <AlertCircle size={13} className="mt-0.5 shrink-0" />
                        <span>{latest.error}</span>
                      </div>
                    )}
                    {latest.pairs?.filter((pair) => pair.error).map((pair, index) => (
                      <div key={`${pair.source}-${index}`} className="flex items-start space-x-2 text-[11px] px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-500/30">
                        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                        <span className="font-mono">{pair.source}: {pair.error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Local Protection Explanation Panel */}
      <div className="mt-8 flex items-start space-x-3 bg-blue-50/50 dark:bg-blue-500/10 border border-blue-100/50 dark:border-blue-500/20 rounded-2xl px-5 py-4 shadow-sm">
        <Info size={18} className="text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-1">
          <p className="font-bold text-slate-800 dark:text-slate-100">Local Protection Guarantee</p>
          <p>
            Your selected source drives are copied to the backup destination on the configured schedule.
            This protects against failure of a source drive. Because this is a local copy, remember that off-site backups are recommended for complete disaster recovery.
          </p>
        </div>
      </div>
    </div>
  );
}
