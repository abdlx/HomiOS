import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function DriveSetup() {
  const [drives, setDrives] = useState<{path: string, label: string}[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [photoSources, setPhotoSources] = useState<string[]>([]);
  const [performanceProfile, setPerformanceProfile] = useState<'beautiful' | 'balanced' | 'server_saver'>('balanced');
  const [backupDestination, setBackupDestination] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    // Fetch available drives
    fetch('/api/drives/available').then(r => r.json()).then(setDrives);
  }, []);

  const handleComplete = async () => {
    setLoading(true);
    const res = await fetch('/api/setup/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ drives: selected, photoSources, performanceProfile, backupDestination })
    });

    if (res.ok) {
      router.push('/dashboard');
    }
    setLoading(false);
  };

  return (
    <div className="h-screen flex flex-col bg-gradient-to-b from-slate-900 to-slate-800 p-6">
      <div className="flex-1 flex flex-col max-w-sm mx-auto w-full">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white">Select Drives</h1>
          <p className="text-slate-400 mt-2">Choose which mounted drives to manage</p>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto mb-6">
          <div className="bg-slate-700 rounded-lg p-4 mb-4">
            <label className="block text-sm font-semibold text-white mb-2">Resource Profile</label>
            <select
              value={performanceProfile}
              onChange={(e) => setPerformanceProfile(e.target.value as any)}
              className="w-full rounded-lg bg-slate-800 text-white border border-slate-600 px-3 py-2"
            >
              <option value="beautiful">Beautiful</option>
              <option value="balanced">Balanced</option>
              <option value="server_saver">Server Saver</option>
            </select>
          </div>

          {drives.map((drive) => (
            <div key={drive.path} className="p-4 bg-slate-700 rounded-lg hover:bg-slate-600">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(drive.path)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected([...selected, drive.path]);
                    } else {
                      setSelected(selected.filter(p => p !== drive.path));
                    }
                  }}
                  className="w-5 h-5 rounded"
                />
                <div>
                  <p className="text-white font-medium">{drive.label}</p>
                  <p className="text-slate-400 text-sm font-mono">{drive.path}</p>
                </div>
              </label>
              <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={photoSources.includes(drive.path)}
                  onChange={(e) => {
                    if (e.target.checked) setPhotoSources([...photoSources, drive.path]);
                    else setPhotoSources(photoSources.filter(p => p !== drive.path));
                  }}
                />
                Use as Photos source
              </label>
            </div>
          ))}

          <div className="bg-slate-700 rounded-lg p-4">
            <label className="block text-sm font-semibold text-white mb-2">Optional Local Backup Destination</label>
            <input
              value={backupDestination}
              onChange={(e) => setBackupDestination(e.target.value)}
              placeholder="/mnt/backup or D:\\Backups"
              className="w-full rounded-lg bg-slate-800 text-white border border-slate-600 px-3 py-2"
            />
          </div>
        </div>

        <button
          onClick={handleComplete}
          disabled={loading || selected.length === 0}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Complete Setup'}
        </button>
      </div>
    </div>
  );
}
