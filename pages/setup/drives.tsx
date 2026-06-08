import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export default function DriveSetup() {
  const [drives, setDrives] = useState<{path: string, label: string}[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
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
      body: JSON.stringify({ drives: selected })
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
          {drives.map((drive) => (
            <label key={drive.path} className="flex items-center gap-3 p-4 bg-slate-700 rounded-lg cursor-pointer hover:bg-slate-600">
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
          ))}
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
