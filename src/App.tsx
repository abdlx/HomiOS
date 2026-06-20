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
import TransferCenter from './components/TransferCenter';
import { FileItem, ViewMode, SidebarItem, TransferTask } from './types';
import { confirmDialog, toast } from './components/SystemUI';
import { Menu } from 'lucide-react';
interface AppProps {
  onClose?: () => void;
}

export default function App({ onClose }: AppProps = {}) {
  const [currentFiles, setCurrentFiles] = useState<FileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<string[][]>([['Root']]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const currentPath = pathHistory[historyIndex];
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

  const [isMobile, setIsMobile] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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
                      : (file.name.match(/\.(txt|md|markdown|json|jsonc|csv|log|js|jsx|cjs|mjs|ts|tsx|cts|mts|css|scss|sass|less|html|htm|xml|yml|yaml|toml|ini|conf|env|sh|bash|zsh|ps1|bat|cmd|py|go|rs|java|c|h|cpp|hpp|cs|php|rb|sql)$/i) ? 'text' : 'document')))),
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
      title: `Delete "${name}"?`,
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

  const notifyTransfer = async (title: string, message: string, tone: 'success' | 'danger' | 'info' = 'info', sourceId?: string) => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, message, tone, sourceType: 'transfer', sourceId }),
      });
    } catch {
      // Notification center updates must not block file work.
    }
  };

  const runFileOperation = async (options: {
    action: 'move' | 'copy';
    file: FileItem;
    sourcePath: string;
    destinationPath: string;
  }) => {
    const taskId = `${options.action}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const controller = new AbortController();
    const task: TransferTask = {
      id: taskId,
      name: options.file.name,
      progress: 0,
      status: 'uploading',
      type: options.action,
      description: `${options.action === 'copy' ? 'Copying' : 'Moving'} item`,
      sourcePath: options.sourcePath,
      destinationPath: options.destinationPath,
      cancellable: true,
      retryable: true,
      controller,
      retry: () => runFileOperation(options),
    };

    setTransfers(prev => [...prev, task]);

    try {
      const res = await fetch(`/api/files/${options.action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePath: options.sourcePath, destinationPath: options.destinationPath }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`${options.action} failed with status ${res.status}`);

      await readMoveProgress(res, taskId);
      await notifyTransfer(
        options.action === 'copy' ? 'Copy completed' : 'Move completed',
        options.file.name,
        'success',
        taskId
      );
      toast({ message: `${options.action === 'copy' ? 'Copied' : 'Moved'} ${options.file.name}`, tone: 'success' });
      return true;
    } catch (err: any) {
      const aborted = err?.name === 'AbortError';
      updateTransferThrottled(taskId, {
        status: 'error',
        error: aborted ? 'Cancelled' : err.message || `${options.action} failed`,
        description: aborted ? 'Cancelled' : `${options.action} failed`,
      }, true);
      await notifyTransfer(
        aborted ? 'Transfer cancelled' : `${options.action === 'copy' ? 'Copy' : 'Move'} failed`,
        `${options.file.name}${aborted ? '' : `: ${err.message || 'Unknown error'}`}`,
        'danger',
        taskId
      );
      toast({ message: aborted ? 'Transfer cancelled' : `${options.action === 'copy' ? 'Copy' : 'Move'} failed`, description: aborted ? undefined : err.message, tone: 'danger' });
      return false;
    }
  };

  const handlePasteClipboard = async () => {
    if (!clipboard) return;

    const apiPath = getApiPath();
    const destinationPath = `/${apiPath}/${clipboard.file.name}`.replace(/\/+/g, '/');
    const sourcePath = `/${clipboard.file.id}`.replace(/\/+/g, '/');

    if (sourcePath === destinationPath) {
      toast({ message: 'Item is already in this folder', tone: 'info' });
      return;
    }

    const ok = await runFileOperation({
      action: clipboard.action === 'cut' ? 'move' : 'copy',
      file: clipboard.file,
      sourcePath,
      destinationPath,
    });
    if (ok) {
      setClipboard(null);
      if (selectedFileId === clipboard.file.id) setSelectedFileId(null);
      loadFiles();
    }
  };

  const handleMoveFileToFolder = async (file: FileItem, targetFolder: FileItem) => {
    if (file.id === targetFolder.id || targetFolder.type !== 'folder') return;
    const sourcePath = `/${file.id}`.replace(/\/+/g, '/');
    const destinationPath = `/${targetFolder.id}/${file.name}`.replace(/\/+/g, '/');
    const ok = await runFileOperation({ action: 'move', file, sourcePath, destinationPath });
    if (ok) {
      if (selectedFileId === file.id) setSelectedFileId(null);
      loadFiles();
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
        else if (['txt', 'md', 'markdown', 'json', 'jsonc', 'csv', 'log', 'js', 'jsx', 'cjs', 'mjs', 'ts', 'tsx', 'cts', 'mts', 'css', 'scss', 'sass', 'less', 'html', 'htm', 'xml', 'yml', 'yaml', 'toml', 'ini', 'conf', 'env', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'py', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'rb', 'sql'].includes(ext || '')) type = 'text';

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
                    onMoveFileToFolder={handleMoveFileToFolder}
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
      <TransferCenter
        transfers={transfers}
        isMobile={isMobile}
        onClearFinished={() => setTransfers(prev => prev.filter(t => t.status === 'uploading' || t.status === 'paused' || t.status === 'pending'))}
        onCancel={(id) => {
          const task = transfers.find((item) => item.id === id);
          task?.controller?.abort();
          task?.tusUpload?.abort?.();
          setTransfers(prev => prev.map(t => t.id === id ? { ...t, status: 'error', error: 'Cancelled', description: 'Cancelled' } : t));
        }}
        onRetry={(task) => task.retry?.()}
        onTogglePause={(task) => {
          if (task.status === 'uploading') {
            task.tusUpload?.abort?.();
            setTransfers(prev => prev.map(t => t.id === task.id ? { ...t, status: 'paused' } : t));
          } else {
            task.tusUpload?.start?.();
            setTransfers(prev => prev.map(t => t.id === task.id ? { ...t, status: 'uploading' } : t));
          }
        }}
      />
    </div>
  );
}
