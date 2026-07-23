import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight, CheckCircle2, Clock, HardDrive, Loader2, Pause, Play, Plus,
  RefreshCw, Trash2, TriangleAlert, X,
} from 'lucide-react';
import { DriveItem } from '../types';
import { confirmDialog, toast } from './SystemUI';

type Schedule = 'manual' | 'hourly' | 'six_hourly' | 'daily' | 'weekly';

interface SyncPlan {
  id: string;
  name: string;
  sources: string[];
  destinations: string[];
  mirrorDeletes: boolean;
  schedule: Schedule;
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
  filesCopied: number;
  filesSkipped: number;
  filesDeleted: number;
  bytesCopied: number;
  pairs: SyncRunPair[];
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}

const SCHEDULE_LABELS: Record<Schedule, string> = {
  manual: 'Manual only',
  hourly: 'Every hour',
  six_hourly: 'Every 6 hours',
  daily: 'Daily',
  weekly: 'Weekly',
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx++;
  }
  return `${value >= 10 || idx === 0 ? Math.round(value) : value.toFixed(1)} ${units[idx]}`;
};

/** SQLite stores CURRENT_TIMESTAMP as UTC without a zone marker. */
const formatWhen = (value: string | null) => {
  if (!value) return 'Never';
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusStyles: Record<string, string> = {
  completed: 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300',
  partial: 'bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300',
  failed: 'bg-red-50 border-red-200 text-red-600 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300',
  running: 'bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300',
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  return (
    <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border capitalize ${statusStyles[status] || 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-white/5 dark:border-white/10 dark:text-slate-400'}`}>
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
                ? 'bg-blue-50 border-blue-200 dark:bg-blue-500/10 dark:border-blue-500/40'
                : isDisabled
                  ? 'bg-slate-50 border-slate-200 opacity-40 cursor-not-allowed dark:bg-white/5 dark:border-white/10'
                  : 'bg-white border-slate-200 hover:border-slate-300 dark:bg-white/5 dark:border-white/10 dark:hover:border-white/20'
            }`}
          >
            <span className={`w-4 h-4 rounded-md border flex items-center justify-center flex-shrink-0 ${
              isSelected ? 'bg-blue-600 border-blue-600' : 'border-slate-300 dark:border-white/20'
            }`}>
              {isSelected && <CheckCircle2 size={12} className="text-white" />}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{drive.label}</span>
              <span className="block text-[10px] font-mono text-slate-400 dark:text-slate-500 truncate">{drive.path}</span>
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
  const [schedule, setSchedule] = useState<Schedule>('daily');
  const [mirrorDeletes, setMirrorDeletes] = useState(false);
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
      if (driveRes.ok) setDrives((await driveRes.json()).filter((d: DriveItem) => d.isMounted && d.path));
    } catch (e) {
      console.error('Failed to load drives:', e);
    }
    await loadPlans();
    setLoading(false);
  }, [loadPlans]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // While anything is syncing, keep the run list and progress fresh.
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
    setSchedule('daily');
    setMirrorDeletes(false);
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
    setSchedule(plan.schedule);
    setMirrorDeletes(plan.mirrorDeletes);
    setFormError('');
  };

  const toggle = (list: string[], setList: (next: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  };

  const savePlan = async () => {
    setFormError('');
    if (!name.trim()) return setFormError('Give this backup a name');
    if (sources.length === 0) return setFormError('Select at least one source drive');
    if (destinations.length === 0) return setFormError('Select at least one destination drive');

    setSaving(true);
    const body = { name: name.trim(), sources, destinations, schedule, mirrorDeletes };
    try {
      const res = await fetch(editingId ? `/api/sync/${editingId}` : '/api/sync', {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFormError(data.error || 'Could not save this backup');
      } else {
        toast({ message: editingId ? 'Backup updated' : 'Backup created', tone: 'success' });
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
        toast({ message: 'Sync started', description: `${plan.name} is syncing in the background`, tone: 'success' });
      } else {
        toast({ message: data.error || 'Could not start sync', tone: 'danger' });
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
      message: 'The schedule and history are removed. Files already copied to the destination drives are left untouched.',
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    setBusyPlan(plan.id);
    await fetch(`/api/sync/${plan.id}`, { method: 'DELETE' }).catch(() => {});
    setBusyPlan(null);
    if (editingId === plan.id) resetForm();
    toast({ message: 'Backup deleted', tone: 'success' });
    loadPlans();
  };

  const labelFor = (drivePath: string) =>
    drives.find((drive) => drive.path === drivePath)?.label || drivePath;

  return (
    <div className="flex-1 bg-transparent p-8 overflow-y-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">Backups</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Mirror source drives onto backup drives in the background
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
              <span>New Backup</span>
            </button>
          )}
        </div>
      </div>

      {/* Create / edit form */}
      {isCreating && (
        <div className="mb-6 bg-white dark:bg-[#1f1f22] border border-slate-200 dark:border-white/10 rounded-2xl p-5 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {editingId ? 'Edit backup' : 'New backup'}
            </h3>
            <button onClick={resetForm} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={16} />
            </button>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Media drives to backup array"
              className="w-full text-sm rounded-xl px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Source drives <span className="font-normal text-slate-400">— data to protect</span>
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
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
                Destination drives <span className="font-normal text-slate-400">— where copies land</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Schedule</label>
              <select
                value={schedule}
                onChange={(e) => setSchedule(e.target.value as Schedule)}
                className="w-full text-sm rounded-xl px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 outline-none focus:border-blue-400"
              >
                {(Object.keys(SCHEDULE_LABELS) as Schedule[]).map((value) => (
                  <option key={value} value={value}>{SCHEDULE_LABELS[value]}</option>
                ))}
              </select>
            </div>
            <label className="flex items-start space-x-2.5 text-xs text-slate-600 dark:text-slate-300 sm:pt-6 cursor-pointer">
              <input
                type="checkbox"
                checked={mirrorDeletes}
                onChange={(e) => setMirrorDeletes(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded"
              />
              <span>
                <span className="font-semibold block">Mirror deletions</span>
                <span className="text-slate-400 dark:text-slate-500">
                  Remove files from the backup copy once they are gone from the source.
                </span>
              </span>
            </label>
          </div>

          {formError && (
            <div className="flex items-center space-x-2 text-xs px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-500/30">
              <TriangleAlert size={14} />
              <span>{formError}</span>
            </div>
          )}

          <div className="flex items-center justify-end space-x-2">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={savePlan}
              disabled={saving}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center space-x-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              <span>{editingId ? 'Save changes' : 'Create backup'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Plans */}
      {loading && plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-500 dark:text-slate-400 text-sm bg-slate-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
          <RefreshCw size={22} className="animate-spin text-blue-500 mb-3" />
          <p>Loading backups...</p>
        </div>
      ) : plans.length === 0 && !isCreating ? (
        <div className="flex flex-col items-center justify-center h-56 space-y-3 bg-slate-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center">
            <HardDrive size={22} className="text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No backups configured</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm text-center">
            Pick the drives holding your data and the drives that should hold the copies. Syncs run in the background.
          </p>
          <button
            onClick={startCreate}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white"
          >
            Create your first backup
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {plans.map((plan) => {
            const planRuns = runs.filter((run) => run.planId === plan.id);
            const latest = planRuns[0];
            const isBusy = busyPlan === plan.id;

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
                        <span className="flex items-center space-x-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-blue-50 border-blue-200 text-blue-600 dark:bg-blue-500/10 dark:border-blue-500/30 dark:text-blue-300">
                          <Loader2 size={10} className="animate-spin" />
                          <span>Syncing</span>
                        </span>
                      ) : (
                        <StatusBadge status={plan.lastStatus} />
                      )}
                      {!plan.enabled && (
                        <span className="text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-slate-50 border-slate-200 text-slate-500 dark:bg-white/5 dark:border-white/10 dark:text-slate-400">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                      <span className="flex items-center space-x-1">
                        <Clock size={11} />
                        <span>{SCHEDULE_LABELS[plan.schedule]}</span>
                      </span>
                      <span>Last run {formatWhen(plan.lastRunAt)}</span>
                      {plan.mirrorDeletes && <span>Mirrors deletions</span>}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 flex-shrink-0">
                    <button
                      onClick={() => runPlan(plan)}
                      disabled={isBusy || plan.running}
                      title="Sync now"
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 flex items-center space-x-1.5"
                    >
                      {plan.running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                      <span>{plan.running ? 'Syncing' : 'Sync now'}</span>
                    </button>
                    <button
                      onClick={() => togglePlanEnabled(plan)}
                      disabled={isBusy}
                      title={plan.enabled ? 'Pause schedule' : 'Resume schedule'}
                      className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/10 disabled:opacity-50"
                    >
                      {plan.enabled ? <Pause size={13} /> : <Play size={13} />}
                    </button>
                    <button
                      onClick={() => startEdit(plan)}
                      className="px-3 py-2 text-[11px] font-semibold rounded-lg border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/10"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deletePlan(plan)}
                      disabled={isBusy}
                      title="Delete backup"
                      className="p-2 rounded-lg border border-slate-200 dark:border-white/10 text-slate-400 hover:text-red-500 hover:border-red-200 dark:hover:border-red-500/40 disabled:opacity-50"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Sources -> destinations */}
                <div className="flex items-center flex-wrap gap-3 bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10 rounded-xl px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {plan.sources.map((source) => (
                      <span key={source} className="text-[10px] font-mono px-2 py-1 rounded-lg bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300">
                        {labelFor(source)}
                      </span>
                    ))}
                  </div>
                  <ArrowRight size={14} className="text-slate-400 flex-shrink-0" />
                  <div className="flex flex-wrap gap-1.5">
                    {plan.destinations.map((destination) => (
                      <span key={destination} className="text-[10px] font-mono px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/30 text-blue-600 dark:text-blue-300">
                        {labelFor(destination)}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Latest run */}
                {latest && (
                  <div className="space-y-2">
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
                      <div className="flex items-start space-x-2 text-[11px] px-3 py-2 rounded-lg bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-300 border border-red-100 dark:border-red-500/30">
                        <TriangleAlert size={12} className="mt-0.5 flex-shrink-0" />
                        <span>{latest.error}</span>
                      </div>
                    )}
                    {latest.pairs?.filter((pair) => pair.error).map((pair, index) => (
                      <div key={`${pair.source}-${index}`} className="flex items-start space-x-2 text-[11px] px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-100 dark:border-amber-500/30">
                        <TriangleAlert size={12} className="mt-0.5 flex-shrink-0" />
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

      <div className="mt-8 flex items-start space-x-3 bg-blue-50/50 dark:bg-blue-500/10 border border-blue-100/50 dark:border-blue-500/20 rounded-xl px-4 py-3.5 shadow-sm">
        <HardDrive size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
          Each source is mirrored into{' '}
          <span className="font-mono bg-white dark:bg-white/10 px-1.5 py-0.5 rounded border border-slate-100 dark:border-white/10 text-slate-700 dark:text-slate-200">
            &lt;destination&gt;/OpenFinder-Backups/&lt;drive&gt;
          </span>{' '}
          on every destination drive. Syncs are incremental — unchanged files are skipped — and run as background jobs you
          can follow in Activity.
        </p>
      </div>
    </div>
  );
}
