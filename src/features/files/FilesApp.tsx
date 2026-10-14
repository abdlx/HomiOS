/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import Sidebar from '../../components/Sidebar';
import Toolbar from './components/Toolbar';
import FileArea from './components/FileArea';
import QuickLookModal from '../../components/QuickLookModal';
import StorageDashboard from '../../components/StorageDashboard';
import SambaPanel from '../../components/SambaPanel';
import TransferCenter from '../../components/TransferCenter';
import { FileItem, ViewMode, SidebarItem, TransferTask } from '../../types';
import { confirmDialog, promptDialog, toast } from '../../components/SystemUI';
import { Menu } from 'lucide-react';
import { ensureCsrfToken, getCsrfToken } from '../../csrf';
import { useDirectory, invalidateDirectories } from './hooks/useDirectory';
import { useFileNavigation } from './hooks/useFileNavigation';
import { useFileSelection } from './hooks/useFileSelection';
import { useFileOperations } from './hooks/useFileOperations';
import { normalizePath, parentPath } from './lib/files';
import DestinationPicker from './components/DestinationPicker';
import ConflictDialog from './components/ConflictDialog';
import BatchActivity from './components/BatchActivity';
interface AppProps {
  onClose?: () => void;
  isActive?: boolean;
}

export default function App({ onClose, isActive = true }: AppProps = {}) {
  const navigation = useFileNavigation();
  const { currentPath, pathHistory, historyIndex } = navigation;
  const directory = useDirectory(navigation.path, isActive);
  const operations = useFileOperations();
  const { clipboard, setClipboard } = operations;
  const [destinationPicker, setDestinationPicker] = useState<{ action: 'copy' | 'move'; items: FileItem[] } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [shares, setShares] = useState<any[]>([]);
  const currentFiles = useMemo(() => directory.files.map(file => ({ ...file, isShared: shares.some(share => normalizePath(share.path) === normalizePath(file.id)) })), [directory.files, shares]);
  const loadFiles = useCallback(() => invalidateDirectories(navigation.path), [navigation.path]);
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
    if (saved) { try { setFileMetadata(JSON.parse(saved)); } catch {} }

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
    if (!isActive) return;
    const controller = new AbortController();
    fetch('/api/shares', { signal: controller.signal }).then(response => response.ok ? response.json() : []).then(value => { if (!controller.signal.aborted) setShares(Array.isArray(value) ? value : []); }).catch(() => {});
    return () => controller.abort();
  }, [isActive, showShared]);
  useEffect(() => { window.dispatchEvent(new CustomEvent('homios:transfers', { detail: transfers })); }, [transfers]);
  useEffect(() => {
    try { const value = JSON.parse(localStorage.getItem('homios_file_preferences') || '{}'); if (['grid', 'list', 'column', 'gallery'].includes(value.view)) setViewMode(window.innerWidth < 768 && ['column', 'gallery'].includes(value.view) ? 'grid' : value.view); if (['name', 'date', 'size', 'type'].includes(value.sort)) setSortOption(value.sort); } catch {}
  }, []);
  const saveView = (view: ViewMode) => { setViewMode(view); localStorage.setItem('homios_file_preferences', JSON.stringify({ view, sort: sortOption })); };
  const saveSort = (sort: string) => { setSortOption(sort); localStorage.setItem('homios_file_preferences', JSON.stringify({ view: viewMode, sort })); };
  const getApiPath = () => navigation.path.slice(1);
  const pushPath = (parts: string[]) => { navigation.pushPath(parts); clearSelection(); setSearchTerm(''); setSelectedTag(null); setShowStorage(false); setShowShared(false); setActiveSection('root'); };
  const handleNavigateBack = () => { navigation.back(); clearSelection(); setSearchTerm(''); setSelectedTag(null); setShowStorage(false); setShowShared(false); };
  const handleNavigateForward = () => { navigation.forward(); clearSelection(); setSearchTerm(''); setSelectedTag(null); setShowStorage(false); setShowShared(false); };
  const handleFileDoubleClick = (file: FileItem) => { if (file.type === 'folder') pushPath(['Root', ...normalizePath(file.id).split('/').filter(Boolean)]); else setQuickLookFile(file); };
  const handleNavigateHome = () => pushPath(['Root']);

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
    setShareTarget(`/${String(file.id).replace(/\\/g, '/')}`.replace(/\/+/g, '/'));
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
    const csrfToken = await ensureCsrfToken();

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
        xhr.withCredentials = true;
        xhr.open('POST', `/api/files?path=${encodeURIComponent(uploadPath)}`, true);
        const csrf = getCsrfToken() || csrfToken;
        if (csrf) xhr.setRequestHeader('X-HomiOS-CSRF', csrf);
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
          withCredentials: true,
          retryDelays: [0, 1000, 3000, 5000, 10000],
          removeFingerprintOnSuccess: true,
          chunkSize: TUS_CHUNK_BYTES,
          metadata: { filename: file.name, filetype: file.type },
          headers: { 'x-target-path': uploadPath.replace(/^\/+/, ''), 'X-HomiOS-CSRF': getCsrfToken() || csrfToken },
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

  const handlePasteClipboard = () => { void operations.paste(navigation.path); };
  const handleMoveFilesToFolder = (items: FileItem[], folder: FileItem) => { void operations.runBatch('move', items, normalizePath(folder.id)); };

  const handleRenameFile = async (id: string, newName: string) => {
    if (!newName.trim() || /[\\/]/.test(newName) || ['.', '..'].includes(newName)) throw new Error('Enter a name without slashes');
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
      invalidateDirectories(parentPath(id));
    } else { const value = await res.json().catch(() => ({})); throw new Error(value.error || 'Could not rename item'); }
  };

  // Bulk delete: confirm once for the whole set, then delete sequentially.
  const handleDeleteMany = async (ids: string[]) => {
    if (ids.length === 0) return;
    if (ids.length === 1) {
      await handleDeleteFile(ids[0]);
      return;
    }
    const ok = await confirmDialog({
      title: `Delete ${ids.length} items?`,
      message: 'These items will be permanently removed. This action cannot be undone.',
      tone: 'danger',
      confirmLabel: `Delete ${ids.length} items`,
    });
    if (!ok) return;

    let failures = 0;
    for (const id of ids) {
      try {
        const res = await fetch('/api/files', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: `/${id}` }),
        });
        if (!res.ok) failures++;
      } catch {
        failures++;
      }
    }
    clearSelection();
    loadFiles();
    if (failures === 0) {
      toast({ message: `Deleted ${ids.length} items`, tone: 'success' });
    } else {
      toast({ message: `Deleted ${ids.length - failures} of ${ids.length}`, description: `${failures} could not be removed`, tone: 'danger' });
    }
  };

  // Generic NDJSON progress runner for the zip/unzip endpoints, mirroring
  // runFileOperation but for single-endpoint jobs.
  const runProgressJob = async (options: {
    endpoint: string;
    body: Record<string, unknown>;
    name: string;
    verb: string; // "Compressing" / "Extracting"
    doneLabel: string; // "Compressed" / "Extracted"
    type: TransferTask['type'];
  }) => {
    const taskId = `${options.type}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const task: TransferTask = {
      id: taskId,
      name: options.name,
      progress: 0,
      status: 'uploading',
      type: options.type,
      description: `${options.verb} ${options.name}`,
    };
    setTransfers((prev) => [...prev, task]);

    try {
      const res = await fetch(options.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options.body),
      });
      if (!res.ok) throw new Error(`Request failed with status ${res.status}`);
      await readMoveProgress(res, taskId);
      toast({ message: `${options.doneLabel} ${options.name}`, tone: 'success' });
      loadFiles();
      return true;
    } catch (err: any) {
      updateTransferThrottled(taskId, {
        status: 'error',
        error: err?.message || `${options.verb} failed`,
        description: `${options.verb} failed`,
      }, true);
      toast({ message: `Could not ${options.verb.toLowerCase().replace(/ing$/, '')} ${options.name}`, description: err?.message, tone: 'danger' });
      return false;
    }
  };

  // Compress the given items into a single .zip in the current directory.
  const handleZip = async (filesToZip: FileItem[]) => {
    if (filesToZip.length === 0) return;
    const apiPath = getApiPath();
    const suggested = filesToZip.length === 1
      ? `${filesToZip[0].name.replace(/\.[^.]+$/, '') || filesToZip[0].name}.zip`
      : 'Archive.zip';
    const archiveName = await promptDialog({
      title: `Compress ${filesToZip.length} item${filesToZip.length === 1 ? '' : 's'}`,
      placeholder: 'Archive.zip',
      defaultValue: suggested,
      confirmLabel: 'Compress',
    });
    if (!archiveName || !archiveName.trim()) return;

    const sourcePaths = filesToZip.map((f) => `/${f.id}`.replace(/\/+/g, '/'));
    const ok = await runProgressJob({
      endpoint: '/api/files/zip',
      body: { sourcePaths, destinationDir: `/${apiPath}`, archiveName: archiveName.trim() },
      name: archiveName.trim().endsWith('.zip') ? archiveName.trim() : `${archiveName.trim()}.zip`,
      verb: 'Compressing',
      doneLabel: 'Compressed',
      type: 'copy',
    });
    if (ok) clearSelection();
  };

  // Extract a .zip archive into a sibling folder.
  const handleUnzip = async (file: FileItem) => {
    await runProgressJob({
      endpoint: '/api/files/unzip',
      body: { archivePath: `/${file.id}`.replace(/\/+/g, '/'), destinationDir: undefined },
      name: file.name,
      verb: 'Extracting',
      doneLabel: 'Extracted',
      type: 'copy',
    });
    clearSelection();
  };

  // Download several items: trigger the browser download for each in turn.
  const handleDownloadMany = (filesToDownload: FileItem[]) => {
    filesToDownload.forEach((file, i) => {
      const url = `/api/files?path=${encodeURIComponent(file.id)}&${file.type === 'folder' ? 'downloadZip=true' : 'raw=true'}`;
      // Stagger slightly so browsers don't drop concurrent navigations.
      window.setTimeout(() => {
        const a = document.createElement('a');
        a.href = url;
        a.download = file.type === 'folder' ? `${file.name}.zip` : file.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, i * 300);
    });
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

  const processedFiles = useMemo(() => baseFiles
    .map(file => ({
      ...file,
      tags: fileMetadata[file.id]?.tags || file.tags,
      folderColor: (fileMetadata[file.id]?.folderColor as any) || file.folderColor,
      isFavorite: fileMetadata[file.id]?.isFavorite || false
    }))
    .filter((file) => selectedTag ? file.tags?.includes(selectedTag) : true)
    .filter((file) => searchTerm.trim() ? file.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) : true)
    .sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (b.type === 'folder' && a.type !== 'folder') return 1;
      if (sortOption === 'type') return a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
      if (sortOption === 'size') return (b.sizeBytes ?? parseSizeToVal(b.size)) - (a.sizeBytes ?? parseSizeToVal(a.size));
      if (sortOption === 'date') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return a.name.localeCompare(b.name, undefined, { numeric: true });
    }), [currentFiles, fileMetadata, selectedTag, searchTerm, sortOption]);

  // ── Multi-selection ──
  // Finder-style: plain click replaces, Ctrl/Cmd+click toggles, Shift+click
  // extends a contiguous range from the last-clicked anchor over the *visible*
  // ordered list (processedFiles). `selectedFileId` stays the primary/active
  // item (drives QuickLook, the column-view preview, etc.).
  const { selectedIds, selectedFileId, setSelectedFileId, setSelectedIds, handleSelectFile, clearSelection, selectAll: handleSelectAll } = useFileSelection(processedFiles, navigation.path + ':' + (selectedTag || ''));

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
      className="homios-surface text-neutral-700 dark:text-neutral-200 h-full w-full flex flex-col select-none overflow-hidden bg-gray-50 dark:bg-[#161618] font-sans transition-colors duration-300"
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
        <div className="flex-1 flex flex-col h-full overflow-hidden w-full min-w-0">
          {/* Mobile hamburger for body */}
          <div className="md:hidden flex items-center p-4 bg-white dark:bg-[#1c1c1e] border-b border-neutral-100 dark:border-white/10">
            <button onClick={() => setIsDrawerOpen(true)} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition mr-3">
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-gray-800 dark:text-white">
              {showStorage ? 'Storage' : showShared ? 'Shared' : 'Files'}
            </h1>
          </div>

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
                setViewMode={saveView}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                onAddNewFile={handleAddNewFile}
                onAddNewFolder={handleAddNewFolder}
                sortOption={sortOption}
                setSortOption={saveSort}
                onUploadFiles={handleUploadFiles}
                onNavigatePath={pushPath}
                onRefresh={directory.refresh}
                refreshing={directory.refreshing}
                disabled={directory.loading || !!directory.error}
                selectionMode={selectionMode}
                onSelectMode={() => { if (selectionMode) clearSelection(); setSelectionMode(!selectionMode); }}
              />
              <FileArea
                files={processedFiles}
                selectedFileId={selectedFileId}
                setSelectedFileId={setSelectedFileId}
                selectedIds={selectedIds}
                onSelectFile={handleSelectFile}
                onClearSelection={clearSelection}
                onFileDoubleClick={handleFileDoubleClick}
                onDeleteFile={handleDeleteFile}
                onDeleteMany={handleDeleteMany}
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
                onMoveFilesToFolder={handleMoveFilesToFolder}
                onZip={handleZip}
                onUnzip={handleUnzip}
                onDownloadMany={handleDownloadMany}
                onChooseDestination={(action, items) => setDestinationPicker({ action, items })}
                onSetSelection={setSelectedIds}
                onSelectAll={handleSelectAll}
                onNavigatePath={(path) => pushPath(['Root', ...normalizePath(path).split('/').filter(Boolean)])}
                onBack={handleNavigateBack}
                onForward={handleNavigateForward}
                loading={!selectedTag && directory.loading}
                refreshing={!selectedTag && directory.refreshing}
                error={selectedTag ? undefined : directory.error}
                onRetry={directory.refresh}
                searchTerm={searchTerm}
                selectionMode={selectionMode}
                onSelectionMode={setSelectionMode}
              />
              <BatchActivity items={operations.submissions} onClear={operations.clearFinished} onRetry={item => void operations.runBatch(item.action, [item.item], item.destination)}/>

            </>
          )}
        </div>
      </main>

      {isActive && destinationPicker && <DestinationPicker {...destinationPicker} initialPath={navigation.path} onClose={() => setDestinationPicker(null)} onSelect={path => { const value = destinationPicker; setDestinationPicker(null); void operations.runBatch(value.action, value.items, path); }}/>} 
      {isActive && operations.conflict && <ConflictDialog key={operations.conflict.name} request={operations.conflict} onResolve={operations.resolveConflict}/>}
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
          if (task?.serverJobId) {
            void fetch(`/api/jobs/${encodeURIComponent(task.serverJobId)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'cancel' }),
            });
          }
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
