import React, { useEffect, useState } from 'react';
import { HardDrive, Cpu, ToggleLeft, ToggleRight, AlertTriangle, RefreshCw, CheckCircle2 } from 'lucide-react';
import { DriveItem } from '../types';

interface StorageDashboardProps {
  onNavigateDrive: (path: string) => void;
}

export default function StorageDashboard({ onNavigateDrive }: StorageDashboardProps) {
  const [drives, setDrives] = useState<DriveItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mountingDevice, setMountingDevice] = useState<string | null>(null);
  const [mountMessage, setMountMessage] = useState<{ device: string; msg: string; ok: boolean } | null>(null);

  const loadDrives = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/drives/available');
      if (res.ok) {
        const data = await res.json();
        setDrives(data);
      }
    } catch (e) {
      console.error('Failed to load drives:', e);
    }
    setLoading(false);
  };

  useEffect(() => { loadDrives(); }, []);

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
        setMountMessage({ device: drive.name, msg: result.error || 'Mount failed', ok: false });
      }
    } catch {
      setMountMessage({ device: drive.name, msg: 'Connection error', ok: false });
    }
    setMountingDevice(null);
  };

  const usageColor = (pct?: number) => {
    if (!pct) return 'from-blue-500 to-cyan-400';
    if (pct >= 90) return 'from-red-500 to-orange-400';
    if (pct >= 70) return 'from-amber-500 to-yellow-400';
    return 'from-blue-500 to-cyan-400';
  };

  return (
    <div className="flex-1 bg-transparent p-8 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-4">
          <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-sm">
            <HardDrive size={20} className="text-blue-500" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">Storage Overview</h2>
            <p className="text-xs text-slate-500 mt-0.5">Block devices &amp; mounted filesystems</p>
          </div>
        </div>
        <button
          onClick={loadDrives}
          className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-sm transition-all text-xs font-medium"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {loading && drives.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 text-sm bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <RefreshCw size={24} className="animate-spin text-blue-500 mb-3" />
          <p>Scanning block devices…</p>
        </div>
      ) : drives.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-500 space-y-3 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
            <HardDrive size={24} className="text-slate-400" />
          </div>
          <p className="text-sm font-medium">No drives detected</p>
          <p className="text-xs text-slate-400">Connect a device to your server to see it here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {drives.map((drive) => {
            const isMounting = mountingDevice === drive.name;
            const feedback = mountMessage?.device === drive.name ? mountMessage : null;
            const pct = drive.usagePercent;

            return (
              <div
                key={drive.name || drive.label}
                className="relative bg-white border border-slate-200 rounded-2xl p-5 flex flex-col space-y-4 shadow-sm hover:shadow-md transition-all group"
              >
                {/* Drive Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${drive.isMounted ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-200'}`}>
                      <HardDrive size={18} className={drive.isMounted ? 'text-blue-500' : 'text-slate-400'} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 leading-tight">{drive.label}</p>
                      <p className="text-[11px] text-slate-500 font-mono mt-0.5">/dev/{drive.name} {drive.fstype ? `• ${drive.fstype}` : ''}</p>
                    </div>
                  </div>

                  {/* Mounted badge */}
                  <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                    drive.isMounted
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                      : 'bg-slate-50 border-slate-200 text-slate-500'
                  }`}>
                    {drive.isMounted ? 'Mounted' : 'Unmounted'}
                  </span>
                </div>

                {/* Capacity bar */}
                {drive.isMounted && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs text-slate-500 font-medium">
                      <span>{drive.usedBytes ? `${drive.usedBytes} used` : 'Usage unknown'}</span>
                      <span className="font-mono">{pct !== undefined ? `${pct}%` : drive.size || '?'}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${usageColor(pct)} transition-all duration-700`}
                        style={{ width: `${pct ?? 50}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Mount path */}
                {drive.isMounted && drive.path && (
                  <div className="flex items-center space-x-2 text-[11px] bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 font-mono text-slate-600">
                    <Cpu size={12} className="text-slate-400 flex-shrink-0" />
                    <span className="truncate">{drive.path}</span>
                  </div>
                )}

                {/* Feedback message */}
                {feedback && (
                  <div className={`flex items-center space-x-1.5 text-xs px-3 py-2 rounded-lg ${feedback.ok ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>
                    {feedback.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
                    <span>{feedback.msg}</span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center space-x-3 pt-2 mt-auto">
                  {drive.isMounted ? (
                    <button
                      onClick={() => onNavigateDrive(drive.path)}
                      className="flex-1 text-xs font-semibold py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all"
                    >
                      Browse Files
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMount(drive)}
                      disabled={isMounting}
                      className="flex-1 text-xs font-semibold py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 transition-all flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isMounting ? (
                        <><RefreshCw size={14} className="animate-spin" /><span>Mounting…</span></>
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

      {/* Info banner */}
      <div className="mt-8 flex items-start space-x-3 bg-blue-50/50 border border-blue-100/50 rounded-xl px-4 py-3.5 shadow-sm">
        <HardDrive size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600 leading-relaxed">
          OpenFinder runs as a native <span className="font-mono bg-white px-1.5 py-0.5 rounded border border-slate-100 text-slate-700">systemd</span> daemon, allowing direct access to mount and format host-level hardware safely without container limitations.
        </p>
      </div>
    </div>
  );
}
