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
    <div className="flex-1 bg-[#0b0f19] p-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
            <HardDrive size={16} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-100">Storage Overview</h2>
            <p className="text-[10px] text-slate-500">Block devices &amp; mounted filesystems</p>
          </div>
        </div>
        <button
          onClick={loadDrives}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800/60 border border-white/5 text-slate-400 hover:text-slate-200 hover:border-white/10 transition-all text-xs"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          <span>Refresh</span>
        </button>
      </div>

      {loading && drives.length === 0 ? (
        <div className="flex items-center justify-center h-48 text-slate-600 text-sm">
          <RefreshCw size={18} className="animate-spin mr-2" /> Scanning block devices…
        </div>
      ) : drives.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-slate-600 space-y-2">
          <HardDrive size={36} className="opacity-30" />
          <p className="text-xs">No external drives detected. Connect a device or check mount permissions.</p>
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
                className="relative bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-2xl p-4 flex flex-col space-y-3 hover:border-white/10 transition-all group"
              >
                {/* Drive Header */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${drive.isMounted ? 'bg-blue-500/10 border-blue-500/20' : 'bg-slate-800/80 border-white/5'}`}>
                      <HardDrive size={16} className={drive.isMounted ? 'text-blue-400' : 'text-slate-600'} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-200 leading-tight">{drive.label}</p>
                      <p className="text-[10px] text-slate-500 font-mono">/dev/{drive.name} {drive.fstype ? `• ${drive.fstype}` : ''}</p>
                    </div>
                  </div>

                  {/* Mounted badge */}
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                    drive.isMounted
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-slate-800 border-white/5 text-slate-500'
                  }`}>
                    {drive.isMounted ? 'Mounted' : 'Unmounted'}
                  </span>
                </div>

                {/* Capacity bar */}
                {drive.isMounted && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[10px] text-slate-500">
                      <span>{drive.usedBytes ? `${drive.usedBytes} used` : 'Usage unknown'}</span>
                      <span className="font-mono">{pct !== undefined ? `${pct}%` : drive.size || '?'}</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full bg-gradient-to-r ${usageColor(pct)} transition-all duration-700`}
                        style={{ width: `${pct ?? 50}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Mount path */}
                {drive.isMounted && drive.path && (
                  <div className="flex items-center space-x-2 text-[10px] bg-slate-800/60 rounded-lg px-2.5 py-1.5 border border-white/5 font-mono text-slate-400">
                    <Cpu size={10} className="text-slate-600 flex-shrink-0" />
                    <span className="truncate">{drive.path}</span>
                  </div>
                )}

                {/* Feedback message */}
                {feedback && (
                  <div className={`flex items-center space-x-1.5 text-[10px] px-2.5 py-1.5 rounded-lg ${feedback.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                    {feedback.ok ? <CheckCircle2 size={11} /> : <AlertTriangle size={11} />}
                    <span>{feedback.msg}</span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center space-x-2 pt-1">
                  {drive.isMounted ? (
                    <button
                      onClick={() => onNavigateDrive(drive.path)}
                      className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 transition-all"
                    >
                      Browse Files
                    </button>
                  ) : (
                    <button
                      onClick={() => handleMount(drive)}
                      disabled={isMounting}
                      className="flex-1 text-[11px] font-semibold py-1.5 rounded-lg bg-slate-700/60 hover:bg-slate-700 text-slate-300 border border-white/5 hover:border-white/10 transition-all flex items-center justify-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isMounting ? (
                        <><RefreshCw size={11} className="animate-spin" /><span>Mounting…</span></>
                      ) : (
                        <><ToggleRight size={12} /><span>Mount Device</span></>
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
      <div className="mt-6 flex items-start space-x-3 bg-amber-500/5 border border-amber-500/15 rounded-xl px-4 py-3">
        <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-300/70 leading-relaxed">
          Mounting operations require the container to be started with <span className="font-mono text-amber-400/90 bg-amber-500/10 px-1 rounded">SYS_ADMIN</span> capability.
          If mounting fails, ensure <span className="font-mono text-amber-400/90 bg-amber-500/10 px-1 rounded">cap_add: [SYS_ADMIN]</span> is set in your <span className="font-mono text-amber-400/90">docker-compose.yml</span>.
        </p>
      </div>
    </div>
  );
}
