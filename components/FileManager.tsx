import { useState, useEffect } from 'react';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';

export default function FileManager() {
  const [files, setFiles] = useState<any[]>([]);
  const [currentPath, setCurrentPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    loadFiles();
  }, [currentPath]);

  const loadFiles = async () => {
    setLoading(true);
    const res = await fetch(`/api/files?path=${currentPath}`);
    if (res.ok) {
      const data = await res.json();
      setFiles(data);
    }
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', `${currentPath}/${file.name}`);

    const res = await fetch('/api/files', {
      method: 'POST',
      body: formData
    });

    if (res.ok) {
      loadFiles();
    }
    setUploading(false);
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete ${name}?`)) return;

    await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${currentPath}/${name}` })
    });

    loadFiles();
  };

  const handleNavigate = (name: string) => {
    setCurrentPath(`${currentPath}/${name}`.replace(/\/+/g, '/'));
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {currentPath && (
            <button
              onClick={() => setCurrentPath(currentPath.substring(0, currentPath.lastIndexOf('/')))}
              className="text-blue-600 text-sm font-medium"
            >
              ← Back
            </button>
          )}
          <h1 className="text-lg font-semibold">
            {currentPath || 'Files'}
          </h1>
        </div>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <p className="text-center text-slate-500 py-8">Loading...</p>
        ) : files.length === 0 ? (
          <p className="text-center text-slate-500 py-8">No files</p>
        ) : (
          files.map((file) => (
            <div
              key={file.path}
              className="flex items-center gap-3 p-3 bg-white rounded hover:bg-slate-50 active:bg-slate-100 cursor-pointer"
              onClick={() => file.isDir && handleNavigate(file.name)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-slate-500">
                  {file.isDir ? 'Folder' : `${(file.size / 1024).toFixed(1)} KB`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {file.isDir && <ChevronRight className="w-4 h-4 text-slate-400" />}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(file.name);
                  }}
                  className="p-2 hover:bg-red-50 rounded"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload button */}
      <div className="sticky bottom-0 bg-white border-t p-4">
        <label className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 text-white rounded-lg font-medium cursor-pointer hover:bg-blue-700 disabled:opacity-50">
          {uploading ? 'Uploading...' : (
            <>
              <Plus className="w-5 h-5" />
              Upload File
            </>
          )}
          <input
            type="file"
            onChange={handleUpload}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}
