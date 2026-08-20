import React, { useEffect, useState } from 'react';
import {
  HardDrive, Usb, Server, Cpu, ToggleRight, AlertTriangle, RefreshCw,
  CheckCircle2, DatabaseBackup, Pencil, Unplug, Shield, Share2, Info, ChevronDown, ChevronUp
} from 'lucide-react';
import { DriveItem } from '../types';
import BackupsPanel from './BackupsPanel';
import ProtectDriveModal from './ProtectDriveModal';
import ProtectionStatus from './ProtectionStatus';
import { confirmDialog, promptDialog, toast } from './SystemUI';

interface StorageDashboardProps {
  onNavigateDrive: (path: string) => void;
}

type StorageTab = 'drives' | 'backups';

function DrivesPanel({ onNavigateDrive, onOpenBackupsTab }: { onNavigateDrive: (path: string) => void; onOpenBackupsTab: () => void }) {
  const [drives, setDrives] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mountingDevice, setMountingDevice] = useState<string | null>(null);
  const [unmountingDevice, setUnmountingDevice] = useState<string | null>(null);
  const [mountMessage, setMountMessage] = useState<{ device: string; msg: string; rawError?: string; ok: boolean; showDetails?: boolean } | null>(null);
  const [protectingDrive, setProtectingDrive] = useState<DriveItem | null>(null);

  const loadDrives = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/drives/available');
      if (res.ok) {
        const data = await res.json();
        // System volumes (/, /boot, /boot/efi) aren't user storage — hide them.
        setDrives(data.filter((d: DriveItem) => !d.isSystem));
      }
    } catch (e) {
      console.error('Failed to load drives:', e);
    }
    setLoading(false);
  };

  useEffect(() => { loadDrives(); }, []);

  const handleRename = async (drive: DriveItem) => {
    const current = drive.nickname || '';
    const next = await promptDialog({
      title: `Rename ${drive.defaultLabel || drive.label}`,
      message: 'Set a display name for this drive in HomiOS. Leave blank to reset to the default. This does not change the disk label.',
      placeholder: drive.defaultLabel || 'My Drive',
      defaultValue: current,
      confirmLabel: 'Save',
    });
    if (next === null || next.trim() === current) return;
    try {
      const res = await fetch('/api/drives/rename', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: drive.name, label: next.trim() }),
      });
      const result = await res.json();
      if (res.ok) {
        toast({ message: next.trim() ? 'Drive renamed' : 'Name reset', tone: 'success' });
        loadDrives();
      } else {
        toast({ message: result.error || 'Rename failed', tone: 'danger' });
      }
    } catch {
      toast({ message: 'Connection error', tone: 'danger' });
    }
  };

  const handleMount = async (drive: DriveItem) => {
    setMountingDevice(drive.name);
    setMountMessage(null);
    try {
      const res = await fetch('/api/drives/mount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: drive.name }),
      });
      const result = await res.json();
      if (result.ok) {
        setMountMessage({ device: drive.name, msg: `Mounted at ${result.mountPoint}`, ok: true });
        loadDrives();
      } else {
        setMountMessage({
          device: drive.name,
          msg: `This drive couldn't be mounted. ${result.error?.includes('filesystem') ? 'Filesystem requires check/repair.' : 'Check disk format and connection.'}`,
          rawError: result.error || 'Mount command failed',
          ok: false,
        });
      }
    } catch (e: any) {
      setMountMessage({ device: drive.name, msg: 'Connection error while communicating with host server', rawError: e?.message, ok: false });
    }
    setMountingDevice(null);
  };

  const handleUnmount = async (drive: DriveItem) => {
    if (!drive.path) return;
    const confirmed = await confirmDialog({
      title: `Unmount ${drive.label}?`,
      message: 'Open files and terminal sessions using this drive must be closed. Active Samba shares on it must be disabled first.',
      confirmLabel: 'Unmount',
      tone: 'danger',
    });
    if (!confirmed) return;

    setUnmountingDevice(drive.name);
    setMountMessage(null);
    try {
      const res = await fetch('/api/drives/unmount', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device: drive.name, mountPoint: drive.path }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        setMountMessage({ device: drive.name, msg: `Unmounted ${result.mountPoint}`, ok: true });
        await loadDrives();
      } else {
        setMountMessage({
          device: drive.name,
          msg: `Unmount failed. ${result.error?.includes('busy') || result.error?.includes('target is busy') ? 'Drive is currently in use by a process or share.' : ''}`,
          rawError: result.error || 'Unmount command failed',
          ok: false,
        });
      }
    } catch (e: any) {
      setMountMessage({ device: drive.name, msg: 'Connection error while unmounting drive', rawError: e?.message, ok: false });
    } finally {
      setUnmountingDevice(null);
    }
  };

  const usageColor = (pct?: number) => {
    if (pct === undefined) return 'from-blue-500 to-cyan-400';
    if (pct >= 90) return 'from-red-500 to-orange-400';
    if (pct >= 70) return 'from-amber-500 to-yellow-400';
    return 'from-blue-500 to-cyan-400';
  };

  const deviceId = (drive: DriveItem) =>
    /^[A-Za-z]:$/.test(drive.name) ? drive.name : `/dev/${drive.name}`;

  const DriveIcon = (drive: DriveItem) => (drive.isRemovable ? Usb : drive.isSystem ? Server : HardDrive);

  return (
    <div className="flex-1 bg-transparent p-8 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 flex items-center justify-center shadow-sm">
            <HardDrive size={20} className="text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 dark:text-white tracking-tight">Storage Overview</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Every drive: Mounted, Shared via Samba, and Protected by backup policy
            </p>
          </div>
        </div>
        <button
          onClick={loadDrives}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/10 shadow-sm transition-all text-xs font-medium"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {loading && drives.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400 text-sm bg-slate-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
          <RefreshCw size={24} className="animate-spin text-blue-500 mb-3" />
          <p>Scanning block devices...</p>
        </div>
      ) : drives.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 dark:text-slate-400 space-y-3 bg-slate-50/50 dark:bg-white/5 rounded-2xl border border-dashed border-slate-200 dark:border-white/10">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center">
            <HardDrive size={24} className="text-slate-400 dark:text-slate-500" />
          </div>
          <p className="text-sm font-medium">No drives detected</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">Connect a USB or SATA device to your server to see it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {drives.map((drive) => {
            const isMounting = mountingDevice === drive.name;
            const isUnmounting = unmountingDevice === drive.name;
            const feedback = mountMessage?.device === drive.name ? mountMessage : null;
            const pct = drive.usagePercent;

            return (
              <div
                key={drive.uuid || drive.name || drive.label}
                className="relative bg-white dark:bg-[#1f1f22] border border-slate-200 dark:border-white/10 rounded-2xl p-5 flex flex-col space-y-4 shadow-sm hover:shadow-md transition-all group"
              >
                {/* Drive Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ${drive.isMounted ? 'bg-blue-50 border-blue-100 dark:bg-blue-500/10 dark:border-blue-500/30' : 'bg-slate-50 border-slate-200 dark:bg-white/5 dark:border-white/10'}`}>
                      {React.createElement(DriveIcon(drive), {
                        size: 20,
                        className: drive.isMounted ? 'text-blue-500' : 'text-slate-400',
                      })}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-tight truncate">{drive.label}</p>
                        <button
                          onClick={() => handleRename(drive)}
                          title="Rename drive display name"
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-blue-500 transition-all shrink-0"
                        >
                          <Pencil size={12} />
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 truncate">
                        {deviceId(drive)} {drive.fstype ? `· ${drive.fstype}` : ''}
                      </p>
                    </div>
                  </div>

                  {/* Drive Tri-State Badges */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {/* State 1: Mounted */}
                    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${
                      drive.isMounted
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                        : 'bg-slate-500/10 border-slate-500/30 text-slate-500 dark:text-slate-400'
                    }`}>
                      {drive.isMounted ? 'Mounted' : 'Unmounted'}
                    </span>

                    {/* State 2: Shared via Samba */}
                    <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                      drive.isShared
                        ? 'bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400'
                        : 'bg-slate-500/10 border-slate-500/20 text-slate-400 dark:text-slate-500'
                    }`} title={drive.shareNames?.join(', ')}>
                      <Share2 size={10} />
                      <span>{drive.isShared ? `Shared (${drive.shareNames?.[0] || 'SMB'})` : 'Not Shared'}</span>
                    </span>

                    {/* State 3: Protected by Backup */}
                    <ProtectionStatus
                      health={drive.protectionHealth}
                      mode={drive.protectionMode}
                      isProtected={drive.isProtected}
                      compact
                    />
                  </div>
                </div>

                {/* Capacity bar */}
                {drive.isMounted && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <span>
                        {drive.usedBytes
                          ? `${drive.usedBytes} of ${drive.totalBytes || drive.size || '?'} used`
                          : 'Usage unknown'}
                      </span>
                      <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{pct !== undefined ? `${pct}%` : drive.size || '?'}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${usageColor(pct)} transition-all duration-700`}
                        style={{ width: `${pct ?? 50}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-400">
                      <span>Free: <strong className="text-slate-600 dark:text-slate-300 font-semibold">{drive.freeBytes || 'Unknown'}</strong></span>
                      {drive.uuid && <span className="font-mono text-[9px] opacity-75" title={`UUID: ${drive.uuid}`}>UUID: {drive.uuid.slice(0, 10)}...</span>}
                    </div>
                  </div>
                )}

                {/* Mount path */}
                {drive.isMounted && drive.path && (
                  <div className="flex items-center space-x-2 text-[11px] bg-slate-50 dark:bg-white/5 rounded-xl px-3 py-2 border border-slate-100 dark:border-white/10 font-mono text-slate-600 dark:text-slate-300">
                    <Cpu size={12} className="text-slate-400 dark:text-slate-500 shrink-0" />
                    <span className="truncate">{drive.path}</span>
                  </div>
                )}

                {/* Feedback message with technical details toggle */}
                {feedback && (
                  <div className={`p-3 rounded-xl border text-xs space-y-1.5 ${feedback.ok ? 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300' : 'bg-red-50 text-red-600 border-red-100 dark:bg-red-500/10 dark:border-red-500/30 dark:text-red-300'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-1.5">
                        {feedback.ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
                        <span>{feedback.msg}</span>
                      </div>
                      {feedback.rawError && (
                        <button
                          onClick={() => setMountMessage({ ...feedback, showDetails: !feedback.showDetails })}
                          className="text-[10px] underline font-semibold shrink-0"
                        >
                          {feedback.showDetails ? 'Hide details' : 'View details'}
                        </button>
                      )}
                    </div>
                    {feedback.showDetails && feedback.rawError && (
                      <pre className="p-2 rounded bg-black/40 font-mono text-[10px] text-white/80 overflow-x-auto whitespace-pre-wrap">
                        {feedback.rawError}
                      </pre>
                    )}
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center space-x-2.5 pt-2 mt-auto">
                  {drive.isMounted ? (
                    <>
                      <button
                        onClick={() => onNavigateDrive(drive.path)}
                        disabled={isUnmounting}
                        className="flex-1 text-xs font-semibold py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all disabled:opacity-50"
                      >
                        Browse Files
                      </button>
                      {!drive.isProtected ? (
                        <button
                          onClick={() => setProtectingDrive(drive)}
                          className="px-3.5 py-2.5 text-xs font-semibold rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 transition-all flex items-center gap-1.5"
                          title="Configure scheduled local protection"
                        >
                          <Shield size={14} />
                          <span>Protect</span>
                        </button>
                      ) : (
                        <button
                          onClick={onOpenBackupsTab}
                          className="px-3 py-2.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-white/10 transition-all flex items-center gap-1.5"
                          title="View in Backups"
                        >
                          <Shield size={14} className="text-emerald-500" />
                          <span>Policy</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleUnmount(drive)}
                        disabled={isUnmounting}
                        className="text-xs font-semibold py-2.5 px-3 rounded-xl bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-500/20 transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Unmount drive"
                      >
                        {isUnmounting ? (
                          <RefreshCw size={14} className="animate-spin" />
                        ) : (
                          <Unplug size={14} />
                        )}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => handleMount(drive)}
                      disabled={isMounting}
                      className="flex-1 text-xs font-semibold py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/10 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isMounting ? (
                        <><RefreshCw size={14} className="animate-spin" /><span>Mounting...</span></>
                      ) : (
                        <><ToggleRight size={14} /><span>Mount Device</span></>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Protect Drive Wizard Modal */}
      {protectingDrive && (
        <ProtectDriveModal
          sourceDrive={protectingDrive}
          allDrives={drives}
          onClose={() => setProtectingDrive(null)}
          onPlanCreated={() => {
            loadDrives();
          }}
        />
      )}

      {/* Info banner with realistic positioning */}
      <div className="mt-8 flex items-start space-x-3 bg-blue-50/50 dark:bg-blue-500/10 border border-blue-100/50 dark:border-blue-500/20 rounded-xl px-4 py-3.5 shadow-sm">
        <Info size={16} className="text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed space-y-1">
          <p className="font-semibold text-slate-800 dark:text-slate-200">Hardware-Agnostic Storage Architecture</p>
          <p>
            HomiOS identifies disks persistently via UUID/PARTUUID. You can safely connect USB drives, SATA disks, or NVMe volumes of any mixed sizes.
          </p>
        </div>
      </div>
    </div>
  );
}

const TABS: { id: StorageTab; label: string; icon: typeof HardDrive }[] = [
  { id: 'drives', label: 'Drives', icon: HardDrive },
  { id: 'backups', label: 'Backups', icon: DatabaseBackup },
];

export default function StorageDashboard({ onNavigateDrive }: StorageDashboardProps) {
  const [activeTab, setActiveTab] = useState<StorageTab>('drives');

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex items-center space-x-1 px-8 pt-6 border-b border-slate-200/70 dark:border-white/10">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-4 py-2.5 text-xs font-semibold rounded-t-xl border-b-2 -mb-px transition-all ${
              activeTab === tab.id
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {React.createElement(tab.icon, { size: 14 })}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'backups' ? (
        <BackupsPanel />
      ) : (
        <DrivesPanel
          onNavigateDrive={onNavigateDrive}
          onOpenBackupsTab={() => setActiveTab('backups')}
        />
      )}
    </div>
  );
}
