/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import FileArea from './components/FileArea';
import QuickLookModal from './components/QuickLookModal';
import StorageDashboard from './components/StorageDashboard';
import { FileItem, ViewMode, SidebarItem, TransferTask } from './types';
import { Loader2, CheckCircle, XCircle, PauseCircle } from 'lucide-react';

export default function App() {
  const [currentFiles, setCurrentFiles] = useState<FileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<string[][]>([['Root']]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const currentPath = pathHistory[historyIndex];
  const [loading, setLoading] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOption, setSortOption] = useState<string>('name');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('nextcloud');
  const [showStorage, setShowStorage] = useState(false);
  const [quickLookFile, setQuickLookFile] = useState<FileItem | null>(null);
  const [fileMetadata, setFileMetadata] = useState<Record<string, { tags?: string[], folderColor?: string, isFavorite?: boolean, name?: string }>>({});
  const [transfers, setTransfers] = useState<TransferTask[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('fileMetadata');
    if (saved) setFileMetadata(JSON.parse(saved));
  }, []);

  const updateFileMetadata = (fileId: string, updates: any) => {
    setFileMetadata((prev) => {
      const newMeta = { ...prev, [fileId]: { ...prev[fileId], ...updates } };
      localStorage.setItem('fileMetadata', JSON.stringify(newMeta));
      return newMeta;
    });
  };

  useEffect(() => {
    loadFiles();
  }, [currentPath]);

  const getApiPath = () => {
    if (currentPath.length === 0) return '';
    if (currentPath[0] === 'Home' || currentPath[0] === 'Root') {
      return currentPath.slice(1).join('/');
    }
    return currentPath.join('/');
  };

  const loadFiles = async () => {
    setLoading(true);
    const apiPath = getApiPath();
    try {
      const res = await fetch(`/api/files?path=/${apiPath}`);
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const formatted: FileItem[] = data.map((file: any) => ({
          id: file.path || file.name,
          name: file.name,
          type: file.isDir 
            ? 'folder' 
            : (file.name.match(/\.(jpg|png|jpeg|gif|webp|svg)$/i) 
              ? 'image' 
              : (file.name.match(/\.(mp4|webm|mkv|avi)$/i)
                ? 'video'
                : (file.name.match(/\.(txt|md|json|csv|log|js|ts|jsx|tsx|css|html)$/i) ? 'text' : 'document'))),
          size: file.isDir ? '--' : `${(file.size / 1024).toFixed(1)} KB`,
          updatedAt: file.modified ? file.modified.split('T')[0] : new Date().toISOString().split('T')[0],
          folderColor: 'blue',
        }));
        setCurrentFiles(formatted);
      } else {
        setCurrentFiles([]);
      }
    } catch (e) {
      console.error(e);
      setCurrentFiles([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && selectedFileId) {
        const item = currentFiles.find(f => f.id === selectedFileId);
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (item) setQuickLookFile(item);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFileId, currentFiles]);

  const pushPath = (newPath: string[]) => {
    const newHistory = pathHistory.slice(0, historyIndex + 1);
    newHistory.push(newPath);
    setPathHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setSelectedFileId(null);
  };

  const handleNavigateBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setSelectedFileId(null);
    }
  };

  const handleNavigateForward = () => {
    if (historyIndex < pathHistory.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setSelectedFileId(null);
    }
  };

  const handleFileDoubleClick = (file: FileItem) => {
    if (file.type === 'folder') {
      pushPath([...currentPath, file.name]);
    } else {
      setQuickLookFile(file);
    }
  };

  const handleNavigateHome = () => {
    pushPath(['Root']);
  };

  const handleAddNewFile = async (name: string, type: 'document' | 'text' | 'image' = 'text') => {
    const apiPath = getApiPath();
    const fullName = name.includes('.') ? name : `${name}.txt`;
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/${apiPath}/${fullName}`, content: `# ${fullName}\n\nCreated from UI!` })
    });
    if (res.ok) loadFiles();
  };

  const handleAddNewFolder = async (name: string) => {
    const apiPath = getApiPath();
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/${apiPath}/${name}`, isDir: true })
    });
    if (res.ok) loadFiles();
  };

  const handleUpdateFile = async (updated: FileItem) => {
    const apiPath = getApiPath();
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/${apiPath}/${updated.name}`, content: updated.content || '' })
    });
    if (res.ok) loadFiles();
    setQuickLookFile(null);
  };

  const handleDeleteFile = async (id: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    const res = await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/${id}` })
    });
    if (res.ok) {
      if (selectedFileId === id) setSelectedFileId(null);
      loadFiles();
    }
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    const apiPath = getApiPath();

    const newTransfers: TransferTask[] = fileArray.map(f => ({
      id: Math.random().toString(36).substr(2, 9),
      name: f.name,
      progress: 0,
      status: 'uploading',
      type: 'upload'
    }));
    setTransfers(prev => [...prev, ...newTransfers]);

    // Try TUS first, fall back to plain XHR
    let tusAvailable = false;
    try {
      const { Upload } = await import('tus-js-client');
      tusAvailable = true;
      await Promise.all(fileArray.map((file, i) =>
        new Promise<void>(resolve => {
          const taskId = newTransfers[i].id;
          const upload = new Upload(file, {
            endpoint: '/api/upload',
            retryDelays: [0, 1000, 3000, 5000],
            chunkSize: 5 * 1024 * 1024, // 5 MB chunks
            metadata: { filename: file.name, filetype: file.type },
            headers: { 'x-target-path': `${apiPath}/${file.name}` },
            onProgress(bytesUploaded, bytesTotal) {
              const pct = Math.round((bytesUploaded / bytesTotal) * 100);
              setTransfers(prev => prev.map(t => t.id === taskId ? { ...t, progress: pct, bytesUploaded, bytesTotal } : t));
            },
            onSuccess() {
              setTransfers(prev => prev.map(t => t.id === taskId ? { ...t, progress: 100, status: 'completed' } : t));
              resolve();
            },
            onError() {
              setTransfers(prev => prev.map(t => t.id === taskId ? { ...t, status: 'error' } : t));
              resolve();
            },
          });
          setTransfers(prev => prev.map(t => t.id === taskId ? { ...t, tusUpload: upload } : t));
          upload.start();
        })
      ));
    } catch {
      // tus-js-client not installed — use plain XHR
    }

    if (!tusAvailable) {
      await Promise.all(fileArray.map((file, i) =>
        new Promise<void>(resolve => {
          const taskId = newTransfers[i].id;
          const uploadPath = `/${apiPath}/${file.name}`;
          const xhr = new XMLHttpRequest();
          xhr.open('POST', `/api/files?path=${encodeURIComponent(uploadPath)}`, true);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const pct = Math.round((event.loaded / event.total) * 100);
              setTransfers(prev => prev.map(t => t.id === taskId ? { ...t, progress: pct } : t));
            }
          };
          xhr.onload = () => {
            const ok = xhr.status >= 200 && xhr.status < 300;
            setTransfers(prev => prev.map(t => t.id === taskId ? { ...t, progress: 100, status: ok ? 'completed' : 'error' } : t));
            resolve();
          };
          xhr.onerror = () => { setTransfers(prev => prev.map(t => t.id === taskId ? { ...t, status: 'error' } : t)); resolve(); };
          xhr.send(file);
        })
      ));
    }
    loadFiles();
  };

  const handleUploadSimulate = async (payload: { name: string; type: 'document' | 'image' }) => {
    handleAddNewFile(payload.name, payload.type);
  };

  const handleRenameFile = async (id: string, newName: string) => {
    const dir = id.substring(0, id.lastIndexOf('/'));
    const newPath = dir ? `/${dir}/${newName}` : `/${newName}`;
    const res = await fetch('/api/files', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/${id}`, newPath })
    });
    if (res.ok) {
      setFileMetadata(prev => {
        if (!prev[id]) return prev;
        const newMeta = { ...prev };
        newMeta[newPath.slice(1)] = newMeta[id]; // Transfer metadata
        delete newMeta[id];
        localStorage.setItem('fileMetadata', JSON.stringify(newMeta));
        return newMeta;
      });
      loadFiles();
    }
  };

  const parseSizeToVal = (sizeStr: string): number => {
    const stripped = sizeStr.toLowerCase().trim();
    if (stripped.includes('--')) return 0;
    const num = parseFloat(stripped);
    if (isNaN(num)) return 0;
    if (stripped.includes('mb')) return num * 1024 * 1024;
    if (stripped.includes('kb')) return num * 1024;
    return num;
  };

  const processedFiles = currentFiles
    .map(file => ({
      ...file,
      tags: fileMetadata[file.id]?.tags || file.tags,
      folderColor: (fileMetadata[file.id]?.folderColor as any) || file.folderColor,
      isFavorite: fileMetadata[file.id]?.isFavorite || false
    }))
    .filter((file) => selectedTag ? file.tags?.includes(selectedTag) : true)
    .filter((file) => searchTerm.trim() ? file.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) : true)
    .sort((a, b) => {
      if (sortOption === 'size') return parseSizeToVal(b.size) - parseSizeToVal(a.size);
      if (sortOption === 'date') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return a.name.localeCompare(b.name);
    });

  const starredFolders: SidebarItem[] = Object.entries(fileMetadata)
    .filter(([id, meta]) => meta.isFavorite)
    .map(([id, meta]) => ({
      id,
      label: meta.name || id.split('/').pop() || 'Unknown',
      icon: 'Star',
      path: id,
      isFavorite: true
    }));

  return (
    <div className="h-screen w-full flex flex-col select-none overflow-hidden bg-white">
      <main className="flex-1 w-full flex overflow-hidden bg-white">
        <Sidebar
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          selectedTag={selectedTag}
          setSelectedTag={setSelectedTag}
          onNavigateHome={handleNavigateHome}
          onNavigateFolder={(folderName) => { pushPath(['Root', folderName]); }}
          onNavigateStorage={() => { setShowStorage(true); setActiveSection('storage'); }}
          starredFolders={starredFolders}
        />
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
          {showStorage ? (
            <StorageDashboard onNavigateDrive={(drivePath) => { setShowStorage(false); setActiveSection('root'); pushPath(['Root', drivePath]); }} />
          ) : (
            <>
              <Toolbar
                currentPath={currentPath}
                onNavigateBack={handleNavigateBack}
                onNavigateForward={handleNavigateForward}
                canNavigateBack={historyIndex > 0}
                canNavigateForward={historyIndex < pathHistory.length - 1}
                viewMode={viewMode}
                setViewMode={setViewMode}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onAddNewFile={handleAddNewFile}
                onAddNewFolder={handleAddNewFolder}
                sortOption={sortOption}
                setSortOption={setSortOption}
              />
              <FileArea
                files={processedFiles}
                selectedFileId={selectedFileId}
                setSelectedFileId={setSelectedFileId}
                onFileDoubleClick={handleFileDoubleClick}
                onDeleteFile={handleDeleteFile}
                onRenameFile={handleRenameFile}
                onUploadFiles={handleUploadFiles}
                viewMode={viewMode}
                currentPath={currentPath}
                onUpdateMetadata={updateFileMetadata}
              />
            </>
          )}
        </div>
      </main>
      {quickLookFile && (
        <QuickLookModal
          file={quickLookFile}
          onClose={() => setQuickLookFile(null)}
          onUpdateFile={handleUpdateFile}
          onDelete={handleDeleteFile}
        />
      )}

      {/* Floating Transfers Panel */}
      {transfers.length > 0 && (
        <div className="fixed bottom-6 right-6 w-80 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-neutral-200 rounded-2xl overflow-hidden z-50 flex flex-col max-h-[400px]">
          <div className="bg-neutral-50 px-4 py-2 border-b border-neutral-200 flex justify-between items-center">
            <span className="text-xs font-bold text-neutral-600">Transfers ({transfers.filter(t => t.status === 'uploading').length} active)</span>
            <button 
              onClick={() => setTransfers(prev => prev.filter(t => t.status === 'uploading' || t.status === 'paused'))}
              className="text-[10px] text-blue-600 hover:underline font-semibold"
            >
              Clear Finished
            </button>
          </div>
          <div className="overflow-y-auto p-2 space-y-2 flex-1">
            {transfers.map(task => (
              <div key={task.id} className="bg-neutral-50 border border-neutral-100 p-3 rounded-xl flex items-center space-x-3">
                <div className="flex-shrink-0">
                  {task.status === 'uploading' && <Loader2 size={16} className="text-blue-500 animate-spin" />}
                  {task.status === 'paused' && <PauseCircle size={16} className="text-amber-500" />}
                  {task.status === 'completed' && <CheckCircle size={16} className="text-green-500" />}
                  {task.status === 'error' && <XCircle size={16} className="text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-neutral-700 truncate block">{task.name}</span>
                    <span className="text-[10px] text-neutral-400 ml-2 flex-shrink-0">{task.progress}%</span>
                  </div>
                  <div className="w-full bg-neutral-200 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-300 ${
                        task.status === 'error' ? 'bg-red-500' : task.status === 'paused' ? 'bg-amber-400' : task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  {task.bytesTotal && (
                    <p className="text-[9px] text-neutral-400 mt-0.5 font-mono">
                      {((task.bytesUploaded ?? 0) / 1024 / 1024).toFixed(1)} / {(task.bytesTotal / 1024 / 1024).toFixed(1)} MB
                    </p>
                  )}
                </div>
                {/* Pause / Resume for TUS uploads */}
                {task.tusUpload && (task.status === 'uploading' || task.status === 'paused') && (
                  <button
                    onClick={() => {
                      if (task.status === 'uploading') {
                        task.tusUpload.abort();
                        setTransfers(prev => prev.map(t => t.id === task.id ? { ...t, status: 'paused' } : t));
                      } else {
                        task.tusUpload.start();
                        setTransfers(prev => prev.map(t => t.id === task.id ? { ...t, status: 'uploading' } : t));
                      }
                    }}
                    className="text-[10px] flex-shrink-0 px-2 py-1 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100 transition-colors"
                  >
                    {task.status === 'uploading' ? '⏸' : '▶'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
