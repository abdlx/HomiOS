/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import FileArea from './components/FileArea';
import QuickLookModal from './components/QuickLookModal';
import StorageDashboard from './components/StorageDashboard';
import SambaPanel from './components/SambaPanel';
import { FileItem, ViewMode, SidebarItem, TransferTask, DriveItem } from './types';
import { confirmDialog, toast } from './components/SystemUI';
import { Loader2, CheckCircle, XCircle, PauseCircle, Menu, Home, Folder, Star, HardDrive, ChevronRight, Share2 } from 'lucide-react';
interface AppProps {
  onClose?: () => void;
}

export default function App({ onClose }: AppProps = {}) {
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
  const [showShared, setShowShared] = useState(false);
  const [shareTarget, setShareTarget] = useState<string | undefined>(undefined);
  const [quickLookFile, setQuickLookFile] = useState<FileItem | null>(null);
  const [fileMetadata, setFileMetadata] = useState<Record<string, { tags?: string[], folderColor?: string, isFavorite?: boolean, name?: string }>>({});
  const [transfers, setTransfers] = useState<TransferTask[]>([]);
  const transferFlushRef = useRef<number | null>(null);
  const pendingTransferUpdatesRef = useRef<Record<string, Partial<TransferTask>>>({});
  const [clipboard, setClipboard] = useState<{ action: 'copy' | 'cut', file: FileItem } | null>(null);
  const [sharedPaths, setSharedPaths] = useState<string[]>([]);

  const [isMobile, setIsMobile] = useState(false);
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

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('openfinder:transfers', { detail: transfers }));
  }, [transfers]);

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
      // Parallel fetch files and shared paths
      const [res, sharesRes] = await Promise.all([
        fetch(`/api/files?path=/${apiPath}`),
        fetch('/api/shares')
      ]);

      let shares: any[] = [];
      if (sharesRes.ok) {
        shares = await sharesRes.json();
        setSharedPaths(shares.map((s: any) => s.path));
      }

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const formatted: FileItem[] = data.map((file: any) => ({
          ...(() => {
            const isImage = file.name.match(/\.(jpg|png|jpeg|gif|webp|svg)$/i);
            const isVideo = file.name.match(/\.(mp4|webm|mkv|avi|mov|m4v)$/i);
            const isPdf = file.name.match(/\.pdf$/i);
            return {
              type: file.isDir
                ? 'folder'
                : (isImage
                  ? 'image'
                  : (isVideo
                    ? 'video'
                    : (isPdf
                      ? 'pdf'
                      : (file.name.match(/\.(txt|md|json|csv|log|js|ts|jsx|tsx|css|html)$/i) ? 'text' : 'document')))),
              thumbnailUrl: !file.isDir && (isImage || isVideo)
                ? `/api/thumbnails?variant=grid&path=${encodeURIComponent(file.path || file.name)}`
                : undefined,
            };
          })(),
          id: file.path || file.name,
          name: file.name,
          size: file.isDir ? '--' : `${(file.size / 1024).toFixed(1)} KB`,
          updatedAt: file.modified ? file.modified.split('T')[0] : new Date().toISOString().split('T')[0],
          folderColor: 'blue',
          isShared: file.isDir && shares.some((s: any) => s.path === `/${apiPath}/${file.name}`.replace(/\/\//g, '/')),
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
    setShowStorage(false);
    setShowShared(false);
  };

  const handleNavigateBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setSelectedFileId(null);
      setShowStorage(false);
      setShowShared(false);
    }
  };

  const handleNavigateForward = () => {
    if (historyIndex < pathHistory.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setSelectedFileId(null);
      setShowStorage(false);
      setShowShared(false);
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
    const name = id.split('/').pop() || 'this item';
    const ok = await confirmDialog({
      title: `Delete “${name}”?`,
      message: 'This item will be permanently removed. This action cannot be undone.',
      tone: 'danger',
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    const res = await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/${id}` })
    });
    if (res.ok) {
      if (selectedFileId === id) setSelectedFileId(null);
      loadFiles();
      toast({ message: 'Item deleted', tone: 'success' });
    } else {
      toast({ message: 'Could not delete item', tone: 'danger' });
    }
  };

  const handleShare = (file: FileItem) => {
    setShareTarget(`/${getApiPath()}/${file.name}`.replace(/\/\//g, '/'));
    setShowShared(true);
    setShowStorage(false);
    setActiveSection('shared');
  };

  const handleUploadFiles = async (files: FileList | File[]) => {
    const DIRECT_UPLOAD_MAX_BYTES = 16 * 1024 * 1024;
    const TUS_CHUNK_BYTES = 8 * 1024 * 1024;
    const UPLOAD_CONCURRENCY = 4;
    const DIRECT_UPLOAD_RETRIES = 2;

    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    const apiPath = getApiPath();
    const getRelativeUploadPath = (file: File) => {
      const rawPath = (file as any).relativePath || (file as any).webkitRelativePath || file.name;
      return String(rawPath)
        .replace(/\\/g, '/')
        .split('/')
        .filter((part) => part && part !== '.' && part !== '..')
        .join('/');
    };
    const uploadTargets = fileArray.map((file) => getRelativeUploadPath(file));
    const uploadPaths = uploadTargets.map((target, i) => `/${apiPath}/${target || fileArray[i].name}`.replace(/\/+/g, '/'));

    const newTransfers: TransferTask[] = fileArray.map((f, i) => ({
      id: Math.random().toString(36).substr(2, 9),
      name: uploadTargets[i] || f.name,
      progress: 0,
      status: 'pending',
      type: 'upload'
    }));
    setTransfers(prev => [...prev, ...newTransfers]);

    let TusUpload: any = null;
    try {
      TusUpload = (await import('tus-js-client')).Upload;
    } catch {
      // tus-js-client not installed - direct uploads still work.
    }

    const sleep = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

    const runWithConcurrency = async (count: number, worker: (index: number) => Promise<void>) => {
      let nextIndex = 0;
      const workerCount = Math.min(count, UPLOAD_CONCURRENCY);
      await Promise.all(Array.from({ length: workerCount }, async () => {
        while (nextIndex < count) {
          const index = nextIndex++;
          await worker(index);
        }
      }));
    };

    const directUploadOnce = (file: File, taskId: string, uploadPath: string) => (
      new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/files?path=${encodeURIComponent(uploadPath)}`, true);
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const pct = Math.round((event.loaded / event.total) * 100);
            updateTransferThrottled(taskId, {
              progress: pct,
              bytesUploaded: event.loaded,
              bytesTotal: event.total,
            });
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
            return;
          }
          reject(new Error(xhr.responseText || `Upload failed with HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('Network error while uploading'));
        xhr.onabort = () => reject(new Error('Upload aborted'));
        xhr.send(file);
      })
    );

    const uploadDirect = async (file: File, taskId: string, uploadPath: string) => {
      for (let attempt = 0; attempt <= DIRECT_UPLOAD_RETRIES; attempt++) {
        try {
          await directUploadOnce(file, taskId, uploadPath);
          return;
        } catch (error) {
          if (attempt === DIRECT_UPLOAD_RETRIES) throw error;
          await sleep(600 * (attempt + 1));
        }
      }
    };

    const uploadWithTus = (file: File, taskId: string, uploadPath: string) => (
      new Promise<void>((resolve, reject) => {
        const upload = new TusUpload(file, {
          endpoint: '/api/upload',
          retryDelays: [0, 1000, 3000, 5000, 10000],
          removeFingerprintOnSuccess: true,
          chunkSize: TUS_CHUNK_BYTES,
          metadata: { filename: file.name, filetype: file.type },
          headers: { 'x-target-path': uploadPath.replace(/^\/+/, '') },
          onProgress(bytesUploaded: number, bytesTotal: number) {
            const pct = Math.round((bytesUploaded / bytesTotal) * 100);
            updateTransferThrottled(taskId, { progress: pct, bytesUploaded, bytesTotal });
          },
          onSuccess() {
            resolve();
          },
          onError(error: unknown) {
            reject(error);
          },
        });
        updateTransferThrottled(taskId, { tusUpload: upload }, true);
        upload.start();
      })
    );

    await runWithConcurrency(fileArray.length, async (i) => {
      const file = fileArray[i];
      const taskId = newTransfers[i].id;
      const uploadPath = uploadPaths[i];

      updateTransferThrottled(taskId, { status: 'uploading', progress: 0 }, true);

      try {
        if (TusUpload && file.size > DIRECT_UPLOAD_MAX_BYTES) {
          await uploadWithTus(file, taskId, uploadPath);
        } else {
          await uploadDirect(file, taskId, uploadPath);
        }
        updateTransferThrottled(taskId, {
          progress: 100,
          status: 'completed',
          bytesUploaded: file.size,
          bytesTotal: file.size,
        }, true);
      } catch (error) {
        updateTransferThrottled(taskId, {
          status: 'error',
          description: error instanceof Error ? error.message : 'Upload failed',
        }, true);
      }
    });

    loadFiles();
    return;

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
            removeFingerprintOnSuccess: true,
            chunkSize: 5 * 1024 * 1024, // 5 MB chunks
            metadata: { filename: file.name, filetype: file.type },
            headers: { 'x-target-path': `${apiPath}/${uploadTargets[i] || file.name}` },
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
          const uploadPath = `/${apiPath}/${uploadTargets[i] || file.name}`;
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

  const updateTransferThrottled = (id: string, update: Partial<TransferTask>, immediate = false) => {
    pendingTransferUpdatesRef.current[id] = {
      ...pendingTransferUpdatesRef.current[id],
      ...update,
    };

    const flush = () => {
      const updates = pendingTransferUpdatesRef.current;
      pendingTransferUpdatesRef.current = {};
      transferFlushRef.current = null;
      setTransfers(prev => prev.map(task => updates[task.id] ? { ...task, ...updates[task.id] } : task));
    };

    if (immediate) {
      if (transferFlushRef.current !== null) {
        window.clearTimeout(transferFlushRef.current);
      }
      flush();
      return;
    }

    if (transferFlushRef.current === null) {
      transferFlushRef.current = window.setTimeout(flush, 250);
    }
  };

  const readMoveProgress = async (res: Response, taskId: string) => {
    if (!res.body) {
      throw new Error('Move progress stream is not available');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'progress') {
          updateTransferThrottled(taskId, {
            progress: event.progress ?? 0,
            bytesUploaded: event.bytesMoved,
            bytesTotal: event.totalBytes,
          });
        }
        if (event.type === 'error') {
          updateTransferThrottled(taskId, { status: 'error', description: event.error || 'Move failed' }, true);
          throw new Error(event.error || 'Move failed');
        }
        if (event.type === 'done') {
          updateTransferThrottled(taskId, { progress: 100, status: 'completed' }, true);
        }
      }
    }
  };

  const handlePasteClipboard = async () => {
    if (!clipboard) return;

    if (clipboard.action !== 'cut') {
      toast({ message: `Pasted copy of ${clipboard.file.name}`, tone: 'info' });
      return;
    }

    const apiPath = getApiPath();
    const destinationPath = `/${apiPath}/${clipboard.file.name}`.replace(/\/+/g, '/');
    const sourcePath = `/${clipboard.file.id}`.replace(/\/+/g, '/');

    if (sourcePath === destinationPath) {
      toast({ message: 'Item is already in this folder', tone: 'info' });
      return;
    }

    const taskId = `move-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const task: TransferTask = {
      id: taskId,
      name: clipboard.file.name,
      progress: 0,
      status: 'uploading',
      type: 'move',
      description: 'Moving item',
    };
    setTransfers(prev => [...prev, task]);

    try {
      const res = await fetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath, destinationPath }),
      });

      if (!res.ok) {
        throw new Error(`Move failed with status ${res.status}`);
      }

      await readMoveProgress(res, taskId);
      setClipboard(null);
      if (selectedFileId === clipboard.file.id) setSelectedFileId(null);
      loadFiles();
      toast({ message: `Moved ${clipboard.file.name}`, tone: 'success' });
    } catch (err: any) {
      updateTransferThrottled(taskId, { status: 'error', description: err.message || 'Move failed' }, true);
      toast({ message: 'Move failed', description: err.message || 'Could not move item', tone: 'danger' });
    }
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
        let type: 'folder' | 'image' | 'video' | 'pdf' | 'text' | 'document' = 'document';
        if (!data.name?.includes('.')) type = 'folder';
        else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext || '')) type = 'image';
        else if (['mp4', 'webm', 'mkv', 'avi'].includes(ext || '')) type = 'video';
        else if (ext === 'pdf') type = 'pdf';
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


  return (
    <div
      className="h-full w-full flex flex-col select-none overflow-hidden bg-gray-50 dark:bg-[#161618] font-sans transition-colors duration-300"
      onContextMenu={(e) => e.preventDefault()}
    >
          {/* Main Container */}
          <main className="flex-1 w-full flex overflow-hidden bg-gray-50 dark:bg-[#161618] relative">
            {/* Mobile Sidebar Overlay */}
            {isDrawerOpen && (
              <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsDrawerOpen(false)} />
            )}

            {/* Responsive Sidebar */}
            <Sidebar
              activeSection={activeSection}
              setActiveSection={setActiveSection}
              selectedTag={selectedTag}
              setSelectedTag={(tag) => {
                setSelectedTag(tag);
                setShowStorage(false);
                setShowShared(false);
              }}
              onNavigateHome={handleNavigateHome}
              onNavigateFolder={(folderName) => { pushPath(['Root', folderName]); }}
              onNavigateStorage={() => { setShowStorage(true); setShowShared(false); setActiveSection('storage'); }}
              onNavigateShared={() => { setShowShared(true); setShowStorage(false); setActiveSection('shared'); }}
              starredFolders={starredFolders}
              isMobileDrawer={isDrawerOpen}
              onCloseDrawer={() => {
                if (isMobile && isDrawerOpen) {
                  setIsDrawerOpen(false);
                } else if (onClose) {
                  onClose();
                } else {
                  window.location.href = '/dashboard';
                }
              }}
            />

        {/* Dynamic Body */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-[#161618] w-full md:pt-3 md:pr-3 md:pb-3">
          {/* Mobile hamburger for body */}
          <div className="md:hidden flex items-center p-4 bg-white dark:bg-[#1c1c1e] border-b border-neutral-100 dark:border-white/10">
            <button onClick={() => setIsDrawerOpen(true)} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition mr-3">
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-gray-800 dark:text-white">
              {showStorage ? 'Storage' : showShared ? 'Shared' : 'Files'}
            </h1>
          </div>

          <div className="flex flex-col h-full bg-white dark:bg-[#1c1c1e] md:rounded-[32px] md:border border-neutral-200/50 dark:border-white/10 shadow-sm overflow-hidden transform-gpu">
              {showStorage ? (
                <StorageDashboard onNavigateDrive={(drivePath) => { setShowStorage(false); setActiveSection('root'); pushPath(['Root', drivePath]); }} />
              ) : showShared ? (
                <SambaPanel defaultPath={shareTarget} />
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
                    onShare={handleShare}
                    onPasteClipboard={handlePasteClipboard}
                  />
                </>
              )}
          </div>
        </div>
      </main>

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
        <div className={`fixed right-6 w-80 bg-white dark:bg-[#1f1f22] shadow-[0_8px_30px_rgb(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgb(0,0,0,0.5)] border border-neutral-200 dark:border-white/10 rounded-2xl overflow-hidden z-50 flex flex-col max-h-[400px] ${isMobile ? 'bottom-20 left-6 right-6 w-auto' : 'bottom-6'
          }`}>
          <div className="bg-neutral-50 dark:bg-white/5 px-4 py-2 border-b border-neutral-200 dark:border-white/10 flex justify-between items-center">
            <span className="text-xs font-bold text-neutral-600 dark:text-neutral-300">Transfers ({transfers.filter(t => t.status === 'uploading' || t.status === 'pending').length} active)</span>
            <button
              onClick={() => setTransfers(prev => prev.filter(t => t.status === 'uploading' || t.status === 'paused'))}
              className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
            >
              Clear Finished
            </button>
          </div>
          <div className="overflow-y-auto p-2 space-y-2 flex-1">
            {transfers.map(task => (
              <div key={task.id} className="bg-neutral-50 dark:bg-white/5 border border-neutral-100 dark:border-white/10 p-3 rounded-xl flex items-center space-x-3">
                <div className="flex-shrink-0">
                  {task.status === 'pending' && <Loader2 size={16} className="text-neutral-400" />}
                  {task.status === 'uploading' && <Loader2 size={16} className="text-blue-500 animate-spin" />}
                  {task.status === 'paused' && <PauseCircle size={16} className="text-amber-500" />}
                  {task.status === 'completed' && <CheckCircle size={16} className="text-green-500" />}
                  {task.status === 'error' && <XCircle size={16} className="text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-200 truncate block">{task.name}</span>
                    <span className="text-[10px] text-neutral-400 dark:text-neutral-500 ml-2 flex-shrink-0">{task.progress}%</span>
                  </div>
                  <div className="w-full bg-neutral-200 dark:bg-white/10 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${task.status === 'error' ? 'bg-red-500' : task.status === 'paused' ? 'bg-amber-400' : task.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                  {task.bytesTotal && (
                    <p className="text-[9px] text-neutral-400 mt-0.5 font-mono">
                      {((task.bytesUploaded ?? 0) / 1024 / 1024).toFixed(1)} / {(task.bytesTotal / 1024 / 1024).toFixed(1)} MB
                    </p>
                  )}
                  {task.description && (
                    <p className="text-[9px] text-neutral-400 mt-0.5 truncate">{task.description}</p>
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
                    className="text-[10px] flex-shrink-0 px-2 py-1 rounded-lg border border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
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
