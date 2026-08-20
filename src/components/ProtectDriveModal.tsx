import React, { useState, useMemo } from 'react';
import {
  Shield, CheckCircle2, AlertTriangle, ArrowRight, Clock,
  HardDrive, Info, X, Layers, RotateCcw, Copy
} from 'lucide-react';
import { DriveItem, ProtectionMode, SyncSchedule } from '../types';
import { toast } from './SystemUI';

interface ProtectDriveModalProps {
  sourceDrive: DriveItem;
  allDrives: DriveItem[];
  onClose: () => void;
  onPlanCreated: () => void;
}

const SCHEDULE_OPTIONS: { id: SyncSchedule; label: string }[] = [
  { id: 'daily', label: 'Daily (Recommended)' },
  { id: 'six_hourly', label: 'Every 6 hours' },
  { id: 'hourly', label: 'Every hour' },
  { id: 'weekly', label: 'Weekly' },
  { id: 'manual', label: 'Manual only' },
];

export default function ProtectDriveModal({
  sourceDrive,
  allDrives,
  onClose,
  onPlanCreated,
}: ProtectDriveModalProps) {
  const [selectedDestination, setSelectedDestination] = useState<string>('');
  const [mode, setMode] = useState<ProtectionMode>('backup');
  const [schedule, setSchedule] = useState<SyncSchedule>('daily');
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [planName, setPlanName] = useState<string>(`Protect ${sourceDrive.nickname || sourceDrive.defaultLabel || sourceDrive.label}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Destination candidates: mounted drives with paths, excluding the source drive itself
  const destinationDrives = useMemo(() => {
    return allDrives.filter(
      (d) => d.isMounted && d.path && d.path !== sourceDrive.path && d.name !== sourceDrive.name
    );
  }, [allDrives, sourceDrive]);

  // Set default destination if available
  React.useEffect(() => {
    if (!selectedDestination && destinationDrives.length > 0) {
      setSelectedDestination(destinationDrives[0].path);
    }
  }, [destinationDrives, selectedDestination]);

  const targetDrive = useMemo(() => {
    return destinationDrives.find((d) => d.path === selectedDestination);
  }, [destinationDrives, selectedDestination]);

  // Capacity forecasting check
  const capacityWarning = useMemo(() => {
    if (!targetDrive) return null;
    const sourceUsed = sourceDrive.usedBytesNumber || 0;
    const destFree = targetDrive.freeBytesNumber || 0;
    const destUsage = targetDrive.usagePercent || 0;

    if (destFree > 0 && sourceUsed > destFree) {
      return `Destination free space (${targetDrive.freeBytes || 'low'}) is smaller than source data (${sourceDrive.usedBytes || 'unknown'}). Backup will likely run out of space.`;
    }
    if (destUsage >= 85) {
      return `Destination is ${destUsage}% full (${targetDrive.freeBytes || 'low space'} remaining). Monitor storage growth closely.`;
    }
    return null;
  }, [sourceDrive, targetDrive]);

  const handleSave = async () => {
    setError('');
    if (!selectedDestination) {
      setError('Please select a destination drive');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: planName.trim() || `Protect ${sourceDrive.label}`,
          sources: [sourceDrive.path],
          destinations: [selectedDestination],
          sourceUuids: sourceDrive.uuid ? [sourceDrive.uuid] : [],
          destinationUuids: targetDrive?.uuid ? [targetDrive.uuid] : [],
          mode,
          mirrorDeletes: mode === 'mirror',
          retentionDays: mode === 'versioned' ? retentionDays : undefined,
          schedule,
          enabled: true,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast({ message: 'Protection configured', description: `${planName} is scheduled`, tone: 'success' });
        onPlanCreated();
        onClose();
      } else {
        setError(data.error || 'Failed to configure protection');
      }
    } catch {
      setError('Network connection error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[250] bg-black/60 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white dark:bg-[#1a1a1c] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center">
              <Shield size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 dark:text-white">Protect this drive</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configure scheduled local protection for <span className="font-semibold text-slate-700 dark:text-slate-200">{sourceDrive.nickname || sourceDrive.defaultLabel || sourceDrive.label}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Step 1: Destination Drive */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              1. Choose Backup Destination Drive
            </label>
            {destinationDrives.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                <span>No secondary mounted drives detected. Connect and mount another drive to act as the backup target.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {destinationDrives.map((drive) => {
                  const isSelected = selectedDestination === drive.path;
                  return (
                    <button
                      key={drive.path}
                      type="button"
                      onClick={() => setSelectedDestination(drive.path)}
                      className={`flex flex-col p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500/10 shadow-sm'
                          : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-white dark:bg-white/[0.02]'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="text-xs font-bold text-slate-800 dark:text-white truncate">{drive.label}</span>
                        {isSelected && <CheckCircle2 size={14} className="text-blue-500 shrink-0" />}
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono truncate">{drive.path}</p>
                      <div className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-between">
                        <span>Free: <strong className="text-slate-700 dark:text-slate-200">{drive.freeBytes || 'Unknown'}</strong></span>
                        <span>{drive.usagePercent !== undefined ? `${drive.usagePercent}% used` : ''}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Capacity warning alert */}
          {capacityWarning && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
              <div>
                <p className="font-semibold">Capacity Warning</p>
                <p className="text-[11px] opacity-90 mt-0.5">{capacityWarning}</p>
              </div>
            </div>
          )}

          {/* Step 2: Protection Policy Mode */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              2. Protection Mode
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setMode('backup')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  mode === 'backup'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-white dark:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white mb-1">
                  <Shield size={14} className="text-emerald-500" />
                  <span>Backup</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Preserves destination files. Source deletions do NOT remove backup files.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('mirror')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  mode === 'mirror'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-white dark:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white mb-1">
                  <Copy size={14} className="text-blue-500" />
                  <span>Mirror</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Exact mirror. Changes and deletions on source reflect on destination.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setMode('versioned')}
                className={`p-3 rounded-xl border text-left transition-all ${
                  mode === 'versioned'
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 bg-white dark:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white mb-1">
                  <Layers size={14} className="text-purple-500" />
                  <span>Versioned</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Retains modified and deleted versions in timestamped snapshots.
                </p>
              </button>
            </div>

            {mode === 'versioned' && (
              <div className="mt-3 flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/10">
                <Clock size={14} className="text-purple-400 shrink-0" />
                <span className="text-xs text-slate-600 dark:text-slate-300">Retention period:</span>
                <select
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(Number(e.target.value))}
                  className="text-xs bg-white dark:bg-[#252528] border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1 text-slate-800 dark:text-white outline-none"
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

          {/* Step 3: Schedule */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
              3. Backup Schedule
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {SCHEDULE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSchedule(opt.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border transition-all text-left ${
                    schedule === opt.id
                      ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold'
                      : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Info note */}
          <div className="p-3.5 rounded-xl bg-blue-500/5 border border-blue-500/20 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
            <Info size={15} className="mt-0.5 shrink-0 text-blue-500" />
            <div className="space-y-1 text-[11px] leading-relaxed">
              <p className="font-semibold text-slate-800 dark:text-slate-200">Local Protection Guarantee</p>
              <p>
                Your drive data is copied to the destination on the configured schedule. This protects against drive hardware failure. Because this is a local copy, remember that off-site backups are recommended for disaster recovery.
              </p>
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-white/10 flex items-center justify-end gap-2.5 bg-slate-50/50 dark:bg-white/[0.02]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || destinationDrives.length === 0}
            className="px-5 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition shadow-sm"
          >
            {saving ? 'Configuring...' : 'Protect Drive'}
          </button>
        </div>
      </div>
    </div>
  );
}
