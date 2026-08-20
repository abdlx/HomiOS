import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Loader2, Shield, PauseCircle, ShieldAlert } from 'lucide-react';
import { ProtectionHealth, ProtectionMode } from '../types';

interface ProtectionStatusProps {
  health?: ProtectionHealth;
  mode?: ProtectionMode;
  isProtected?: boolean;
  running?: boolean;
  lastBackupAt?: string | null;
  targetLabel?: string;
  scheduleLabel?: string;
  compact?: boolean;
}

export const MODE_LABELS: Record<ProtectionMode, { label: string; desc: string }> = {
  mirror: {
    label: 'Mirror',
    desc: 'Exact replica; source changes and deletions propagate to destination',
  },
  backup: {
    label: 'Backup',
    desc: 'Preserves destination files; source deletions are not removed',
  },
  versioned: {
    label: 'Versioned Backup',
    desc: 'Retains modified and deleted versions in timestamped snapshots',
  },
};

export default function ProtectionStatus({
  health = 'unprotected',
  mode = 'mirror',
  isProtected = false,
  running = false,
  lastBackupAt,
  targetLabel,
  scheduleLabel,
  compact = false,
}: ProtectionStatusProps) {
  if (!isProtected) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
        <Shield size={11} />
        <span>Unprotected</span>
      </span>
    );
  }

  if (running) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400">
        <Loader2 size={11} className="animate-spin" />
        <span>Syncing...</span>
      </span>
    );
  }

  const getStatusBadge = () => {
    switch (health) {
      case 'healthy':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 size={11} />
            <span>Protected ({MODE_LABELS[mode]?.label || 'Mirror'})</span>
          </span>
        );
      case 'at_risk':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400">
            <AlertCircle size={11} />
            <span>Protection at risk</span>
          </span>
        );
      case 'degraded':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400">
            <AlertTriangle size={11} />
            <span>Backup overdue</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border bg-slate-500/10 border-slate-500/30 text-slate-600 dark:text-slate-400">
            <Shield size={11} />
            <span>Protected</span>
          </span>
        );
    }
  };

  if (compact) {
    return getStatusBadge();
  }

  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-2">
        {getStatusBadge()}
      </div>
      {(targetLabel || lastBackupAt) && (
        <div className="text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5 pt-1">
          {targetLabel && <p>Backup target: <span className="font-semibold text-slate-700 dark:text-slate-200">{targetLabel}</span></p>}
          {scheduleLabel && <p>Schedule: <span>{scheduleLabel}</span></p>}
          {lastBackupAt && <p>Last backup: <span>{new Date(`${lastBackupAt.replace(' ', 'T')}Z`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></p>}
        </div>
      )}
    </div>
  );
}
