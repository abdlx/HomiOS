import { useState, useEffect } from 'react';
import { Trash2, Plus, Lock } from 'lucide-react';

export default function ShareManager() {
  const [shares, setShares] = useState<any[]>([]);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    loadShares();
  }, []);

  const loadShares = async () => {
    const res = await fetch('/api/shares');
    if (res.ok) {
      const data = await res.json();
      setShares(data);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this share?')) return;

    await fetch('/api/shares', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });

    loadShares();
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      <div className="sticky top-0 bg-white border-b p-4">
        <h2 className="text-lg font-semibold">SMB Shares</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {shares.map((share) => (
          <div key={share.id} className="bg-white rounded-lg p-4 border">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900">{share.name}</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">{share.path}</p>
                <p className="text-sm text-blue-600 font-mono mt-2">
                  \\\\192.168.x.x\\{share.name}
                </p>
              </div>
              {share.read_only ? (
                <Lock className="w-4 h-4 text-amber-500" />
              ) : null}
            </div>

            <button
              onClick={() => handleDelete(share.id)}
              className="mt-3 w-full py-2 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 cursor-pointer"
            >
              Delete Share
            </button>
          </div>
        ))}
      </div>

      <div className="sticky bottom-0 bg-white border-t p-4">
        <button
          onClick={() => setShowModal(true)}
          className="w-full py-3 bg-green-600 text-white rounded-lg font-semibold flex items-center justify-center gap-2 hover:bg-green-700 cursor-pointer"
        >
          <Plus className="w-5 h-5" />
          New Share
        </button>
      </div>

      {showModal && (
        <CreateShareModal
          onClose={() => setShowModal(false)}
          onCreate={() => {
            loadShares();
            setShowModal(false);
          }}
        />
      )}
    </div>
  );
}

function CreateShareModal({ onClose, onCreate }: { onClose: () => void, onCreate: () => void }) {
  const [name, setName] = useState('');
  const [path, setPath] = useState('/app/drives');
  const [readOnly, setReadOnly] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setLoading(true);
    const res = await fetch('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, path, readOnly })
    });

    if (res.ok) {
      onCreate();
    } else {
      alert('Failed to create share');
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end justify-center sm:items-center z-50">
      <div className="bg-white w-full sm:w-96 rounded-t-lg sm:rounded-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold">Create Share</h2>

        <div>
          <label className="text-sm font-medium block mb-2">Share Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Documents"
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="text-sm font-medium block mb-2">Path</label>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm">Read-only</span>
        </label>

        <div className="flex gap-2 pt-4">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-slate-100 rounded-lg font-medium cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={loading || !name.trim()}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50 cursor-pointer"
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
