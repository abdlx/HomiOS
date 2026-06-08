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
import { FileItem, ViewMode, SidebarItem, TransferTask, DriveItem } from './types';
import { Loader2, CheckCircle, XCircle, PauseCircle, Menu, Home, Folder, Star, HardDrive } from 'lucide-react';
import MobileHomeScreen from './components/MobileHomeScreen';

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
  const [clipboard, setClipboard] = useState<{ action: 'copy' | 'cut', file: FileItem } | null>(null);

  const [isMobile, setIsMobile] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'files' | 'favorites' | 'storage'>('home');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState<SidebarItem[]>([]);
  const [drives, setDrives] = useState<DriveItem[]>([]);
  const [serverIp, setServerIp] = useState<string>('Connecting...');

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile && (viewMode === 'column' || viewMode === 'gallery')) {
        setViewMode('grid');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    const saved = localStorage.getItem('fileMetadata');
    if (saved) setFileMetadata(JSON.parse(saved));

    if (typeof window !== 'undefined') {
      setServerIp(window.location.hostname);
    }

    fetch('/api/system/shortcuts')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setShortcuts(data);
      })
      .catch(err => console.error('Error fetching shortcuts:', err));

    fetch('/api/drives/available')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setDrives(data);
      })
      .catch(err => console.error('Error fetching drives:', err));

    return () => window.removeEventListener('resize', checkMobile);
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
      if (selectedTag) {
        // Navigate to the absolute path of the global tagged folder
        pushPath(['Root', ...file.id.split('/')]);
        setSelectedTag(null);
      } else {
        pushPath([...currentPath, file.name]);
      }
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

  const getGlobalTaggedFiles = (tag: string): FileItem[] => {
    return Object.entries(fileMetadata)
      .filter(([id, data]) => data.tags?.includes(tag))
      .map(([id, data]) => {
        const ext = data.name?.split('.').pop()?.toLowerCase();
        let type: 'folder' | 'image' | 'video' | 'text' | 'document' = 'document';
        if (!data.name?.includes('.')) type = 'folder';
        else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) type = 'image';
        else if (['mp4', 'webm', 'mkv', 'avi'].includes(ext || '')) type = 'video';
        else if (['txt', 'md', 'json', 'csv', 'log', 'js', 'ts', 'jsx', 'tsx', 'css', 'html'].includes(ext || '')) type = 'text';

        return {
          id, // id is full relative path in the file metadata
          name: data.name || id.split('/').pop() || id,
          type,
          size: '--',
          updatedAt: 'Tagged',
          tags: data.tags,
          folderColor: data.folderColor as any || 'blue',
          isFavorite: data.isFavorite || false,
        };
      });
  };

  const baseFiles = selectedTag ? getGlobalTaggedFiles(selectedTag) : currentFiles;

  const processedFiles = baseFiles
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

  const renderFavoritesTab = () => {
    return (
      <div className="flex-1 bg-neutral-50 p-5 overflow-y-auto space-y-6">
        <div>
          <h3 className="text-xs font-extrabold text-neutral-500 uppercase tracking-wider mb-3 px-1">Starred Folders</h3>
          {starredFolders.length === 0 ? (
            <div className="bg-white border border-neutral-100 rounded-2xl p-6 text-center text-xs text-neutral-400">
              No starred folders yet. Star folders in the file list context menu to see them here.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {starredFolders.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedTag(null);
                    setActiveSection(item.id);
                    if (item.path) {
                      pushPath(['Root', item.path]);
                    } else {
                      pushPath(['Root', item.label]);
                    }
                    setActiveTab('files');
                  }}
                  className="flex items-center space-x-3 p-3 bg-white border border-neutral-100 rounded-2xl shadow-sm hover:shadow-md transition-all text-left active:scale-95 cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-600">
                    <Star size={16} fill="currentColor" />
                  </div>
                  <span className="text-xs font-bold text-neutral-700 truncate flex-1">{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <h3 className="text-xs font-extrabold text-neutral-500 uppercase tracking-wider mb-3 px-1">Filter by Tags</h3>
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'Red', color: 'bg-red-500' },
              { id: 'Orange', color: 'bg-orange-500' },
              { id: 'Yellow', color: 'bg-yellow-500' },
              { id: 'Green', color: 'bg-green-500' },
              { id: 'Blue', color: 'bg-blue-500' },
              { id: 'Purple', color: 'bg-purple-500' },
              { id: 'Gray', color: 'bg-gray-500' },
            ].map((tag) => {
              const isActive = selectedTag === tag.id;
              return (
                <button
                  key={tag.id}
                  onClick={() => {
                    if (selectedTag === tag.id) {
                      setSelectedTag(null);
                    } else {
                      setSelectedTag(tag.id);
                      setActiveSection('root');
                    }
                    setActiveTab('files');
                  }}
                  className={`flex items-center space-x-2.5 p-3 bg-white border border-neutral-100 rounded-2xl shadow-sm transition-all text-left active:scale-95 cursor-pointer ${
                    isActive ? 'ring-2 ring-blue-500/25 bg-blue-50/10 font-bold' : ''
                  }`}
                >
                  <span className={`w-3 h-3 rounded-full shadow-sm ${tag.color}`} />
                  <span className="text-xs font-bold text-neutral-700">{tag.id}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div 
      className="h-screen w-full flex flex-col select-none overflow-hidden bg-gray-50 font-sans"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Mobile Top Header */}
      {isMobile && (
        <header className="h-14 bg-white border-b border-neutral-200/60 px-4 flex items-center justify-between sticky top-0 z-30 select-none shadow-sm">
          <div className="flex items-center space-x-3">
            <button 
              onClick={() => setIsDrawerOpen(true)}
              className="p-1.5 rounded-xl text-neutral-600 hover:bg-neutral-100 active:scale-95 transition-all cursor-pointer"
            >
              <Menu size={20} className="stroke-[2.5]" />
            </button>
            <span className="font-extrabold text-base bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent tracking-tight">
              OpenFinder
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <div className="text-[10px] font-bold text-neutral-400 bg-neutral-100 border border-neutral-200/50 px-2 py-0.5 rounded-full">
              Mobile App Mode
            </div>
          </div>
        </header>
      )}

      {/* Main Container */}
      <main className="flex-1 w-full flex overflow-hidden bg-gray-50">
        {/* Desktop Sidebar (hidden on mobile) */}
        {!isMobile && (
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
        )}

        {/* Dynamic Body */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50">
          {isMobile ? (
            // Mobile Tab-driven views
            <>
              {activeTab === 'home' && (
                <MobileHomeScreen
                  drives={drives}
                  shortcuts={shortcuts}
                  recentFiles={currentFiles}
                  onNavigateShortcut={(shortcutPath) => {
                    setSelectedTag(null);
                    pushPath(['Root', shortcutPath]);
                    setActiveTab('files');
                  }}
                  onNavigateStorage={() => setActiveTab('storage')}
                  onNavigateTab={(tab) => {
                    setActiveTab(tab);
                    if (tab === 'files') setShowStorage(false);
                  }}
                  onOpenFile={(file) => setQuickLookFile(file)}
                  serverIp={serverIp}
                />
              )}

              {activeTab === 'files' && (
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
                    clipboardState={clipboard}
                    setClipboard={setClipboard}
                    onAddNewFile={handleAddNewFile}
                    onAddNewFolder={handleAddNewFolder}
                  />
                </>
              )}

              {activeTab === 'favorites' && renderFavoritesTab()}

              {activeTab === 'storage' && (
                <StorageDashboard 
                  onNavigateDrive={(drivePath) => { 
                    setActiveTab('files'); 
                    setShowStorage(false); 
                    pushPath(['Root', drivePath]); 
                  }} 
                />
              )}
            </>
          ) : (
            // Desktop conditional views
            <>
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
                    clipboardState={clipboard}
                    setClipboard={setClipboard}
                    onAddNewFile={handleAddNewFile}
                    onAddNewFolder={handleAddNewFolder}
                  />
                </>
              )}
            </>
          )}
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      {isMobile && (
        <nav className="fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-lg border-t border-neutral-200/50 shadow-[0_-2px_10px_rgba(0,0,0,0.03)] flex items-center justify-around px-4 z-40 select-none pb-safe">
          <button
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1.5 transition-colors cursor-pointer ${
              activeTab === 'home' ? 'text-blue-600 font-bold' : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            <Home size={18} className="stroke-[2.2] mb-0.5" />
            <span className="text-[10px]">Home</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('files');
              setShowStorage(false);
            }}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1.5 transition-colors cursor-pointer ${
              activeTab === 'files' ? 'text-blue-600 font-bold' : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            <Folder size={18} className="stroke-[2.2] mb-0.5" />
            <span className="text-[10px]">Files</span>
          </button>

          <button
            onClick={() => setActiveTab('favorites')}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1.5 transition-colors cursor-pointer ${
              activeTab === 'favorites' ? 'text-blue-600 font-bold' : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            <Star size={18} className="stroke-[2.2] mb-0.5" />
            <span className="text-[10px]">Favorites</span>
          </button>

          <button
            onClick={() => setActiveTab('storage')}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1.5 transition-colors cursor-pointer ${
              activeTab === 'storage' ? 'text-blue-600 font-bold' : 'text-neutral-400 hover:text-neutral-600'
            }`}
          >
            <HardDrive size={18} className="stroke-[2.2] mb-0.5" />
            <span className="text-[10px]">Drives</span>
          </button>
        </nav>
      )}

      {/* Slide-out Mobile Drawer */}
      {isMobile && isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-black/45 backdrop-blur-sm transition-opacity duration-300"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="relative flex flex-col w-[280px] h-full max-w-sm bg-white shadow-2xl animate-in slide-in-from-left duration-300">
            <Sidebar
              activeSection={activeSection}
              setActiveSection={(section) => {
                setActiveSection(section);
                if (section === 'storage') {
                  setActiveTab('storage');
                } else {
                  setActiveTab('files');
                }
              }}
              selectedTag={selectedTag}
              setSelectedTag={(tag) => {
                setSelectedTag(tag);
                setActiveTab('files');
              }}
              onNavigateHome={handleNavigateHome}
              onNavigateFolder={(folderPath) => {
                pushPath(['Root', folderPath]);
                setActiveTab('files');
              }}
              onNavigateStorage={() => {
                setShowStorage(true);
                setActiveSection('storage');
                setActiveTab('storage');
              }}
              starredFolders={starredFolders}
              isMobileDrawer={true}
              onCloseDrawer={() => setIsDrawerOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Modal and Panel overlays */}
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
        <div className={`fixed right-6 w-80 bg-white shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-neutral-200 rounded-2xl overflow-hidden z-50 flex flex-col max-h-[400px] ${
          isMobile ? 'bottom-20 left-6 right-6 w-auto' : 'bottom-6'
        }`}>
          <div className="bg-neutral-50 px-4 py-2 border-b border-neutral-200 flex justify-between items-center">
            <span className="text-xs font-bold text-neutral-600">Transfers ({transfers.filter(t => t.status === 'uploading').length} active)</span>
            <button 
              onClick={() => setTransfers(prev => prev.filter(t => t.status === 'uploading' || t.status === 'paused'))}
              className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
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
                    className="text-[10px] flex-shrink-0 px-2 py-1 rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100 transition-colors cursor-pointer"
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
