import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Folder,
  Image as ImageIcon,
  Eye,
  Plus,
  AlertCircle,
  ChevronRight,
  Video,
  Archive,
  Code,
  Music,
  MoreVertical,
  Share2,
  Check,
  FileArchive,
  Download,
  Trash2,
  X
} from 'lucide-react';
import { FileItem, ViewMode } from '../types';
import ContextMenu from './ContextMenu';
import { promptDialog, toast } from './SystemUI';
import LazyMediaThumbnail from './LazyMediaThumbnail';

interface FileAreaProps {
  files: FileItem[];
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  /** Multi-selection set. When omitted, FileArea falls back to single-select. */
  selectedIds?: Set<string>;
  onSelectFile?: (file: FileItem, modifiers?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => void;
  onClearSelection?: () => void;
  onFileDoubleClick: (file: FileItem) => void;
  onDeleteFile: (id: string) => void;
  onDeleteMany?: (ids: string[]) => void;
  onRenameFile: (id: string, newName: string) => void;
  onUploadFiles: (files: FileList | File[]) => void;
  viewMode: ViewMode;
  currentPath: string[];
  onUpdateMetadata?: (fileId: string, metadata: any) => void;
  clipboardState?: { action: 'copy' | 'cut'; file: FileItem } | null;
  setClipboard?: (state: { action: 'copy' | 'cut'; file: FileItem } | null) => void;
  onAddNewFile?: (name: string, type: 'document' | 'text' | 'image') => void;
  onAddNewFolder?: (name: string, color?: 'blue' | 'orange' | 'green') => void;
  onShare?: (file: FileItem) => void;
  onPasteClipboard?: () => void;
  onMoveFileToFolder?: (file: FileItem, targetFolder: FileItem) => void;
  onZip?: (files: FileItem[]) => void;
  onUnzip?: (file: FileItem) => void;
  onDownloadMany?: (files: FileItem[]) => void;
}

export default function FileArea({
  files,
  selectedFileId,
  setSelectedFileId,
  selectedIds: selectedIdsProp,
  onSelectFile: onSelectFileProp,
  onClearSelection: onClearSelectionProp,
  onFileDoubleClick,
  onDeleteFile,
  onDeleteMany,
  onRenameFile,
  onUploadFiles,
  viewMode,
  currentPath,
  onUpdateMetadata,
  clipboardState,
  setClipboard,
  onAddNewFile,
  onAddNewFolder,
  onShare,
  onPasteClipboard,
  onMoveFileToFolder,
  onZip,
  onUnzip,
  onDownloadMany
}: FileAreaProps) {
  // Single-select fallback so consumers that don't manage a multi-selection set
  // (e.g. the read-only Photos view) keep working unchanged.
  const selectedIds = selectedIdsProp ?? new Set(selectedFileId ? [selectedFileId] : []);
  const onSelectFile = onSelectFileProp ?? ((file: FileItem) => setSelectedFileId(file.id));
  const onClearSelection = onClearSelectionProp ?? (() => setSelectedFileId(null));

  const PAGE_SIZE = 120;
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Gallery active slide index
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ file: FileItem | null; x: number; y: number } | null>(null);
  const [draggingFileId, setDraggingFileId] = useState<string | null>(null);
  const [dropFolderId, setDropFolderId] = useState<string | null>(null);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [files.length, viewMode, currentPath.join('/')]);

  useEffect(() => {
    if (visibleCount >= files.length) return;
    const target = loadMoreRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleCount((count) => Math.min(count + PAGE_SIZE, files.length));
        }
      },
      { root: containerRef.current, rootMargin: '900px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [files.length, visibleCount]);

  const visibleFiles = files.slice(0, visibleCount);

  const handleContextMenu = (e: React.MouseEvent, file: FileItem | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ file, x: e.clientX, y: e.clientY });
  };

  const openFolderInCodeServer = (file: FileItem) => {
    const relativePath = file.id.replace(/\\/g, '/').replace(/^\/+/, '');
    const folderPath = relativePath.startsWith('home/') ? `/${relativePath}` : `/home/${relativePath}`;
    const url = new URL('/code/', window.location.origin);
    url.searchParams.set('folder', folderPath);
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  };

  // Drag and Drop simulation handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const readDirectoryEntries = (reader: any): Promise<any[]> => (
    new Promise((resolve, reject) => {
      const entries: any[] = [];
      const readBatch = () => {
        reader.readEntries((batch: any[]) => {
          if (batch.length === 0) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readBatch();
        }, reject);
      };
      readBatch();
    })
  );

  const fileFromEntry = (entry: any): Promise<File> => (
    new Promise((resolve, reject) => entry.file(resolve, reject))
  );

  const collectDroppedEntryFiles = async (entry: any): Promise<File[]> => {
    if (!entry) return [];

    if (entry.isFile) {
      const file = fileFromEntry(entry);
      return file.then((f) => {
        const relativePath = String(entry.fullPath || f.name).replace(/^\/+/, '');
        Object.defineProperty(f, 'relativePath', { value: relativePath, configurable: true });
        return [f];
      });
    }

    if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = await readDirectoryEntries(reader);
      const nested = await Promise.all(entries.map(collectDroppedEntryFiles));
      return nested.flat();
    }

    return [];
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const items = Array.from(e.dataTransfer.items || []);
    const entries = items
      .map((item: any) => typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null)
      .filter(Boolean);

    if (entries.length > 0) {
      const droppedFiles = (await Promise.all(entries.map(collectDroppedEntryFiles))).flat();
      if (droppedFiles.length > 0) {
        onUploadFiles(droppedFiles);
      }
      return;
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileDragStart = (e: React.DragEvent, file: FileItem) => {
    setDraggingFileId(file.id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/homios-file-id', file.id);
  };

  const handleFolderDragOver = (e: React.DragEvent, folder: FileItem) => {
    if (folder.type !== 'folder') return;
    const draggedId = draggingFileId || e.dataTransfer.getData('application/homios-file-id');
    if (!draggedId || draggedId === folder.id) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropFolderId(folder.id);
  };

  const handleFolderDrop = (e: React.DragEvent, folder: FileItem) => {
    if (folder.type !== 'folder') return;
    const draggedId = draggingFileId || e.dataTransfer.getData('application/homios-file-id');
    const draggedFile = files.find((item) => item.id === draggedId);
    if (!draggedFile || draggedFile.id === folder.id) return;
    e.preventDefault();
    e.stopPropagation();
    setDropFolderId(null);
    setDraggingFileId(null);
    onMoveFileToFolder?.(draggedFile, folder);
  };

  const getFolderItemCount = (file: FileItem) => {
    if (typeof file.itemCount === 'number') return file.itemCount;
    const parsed = parseInt(file.size, 10);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const getFolderItemLabel = (file: FileItem) => {
    const count = getFolderItemCount(file);
    if (count === null) return file.size && file.size !== '--' ? file.size : 'Unknown';
    return `${count} item${count === 1 ? '' : 's'}`;
  };

  // ── Icon system ──
  // Every item type (folder, file, thumbnail) renders into the same fixed-height
  // stage in grid view, so a row of mixed types keeps its labels on one baseline.
  const ICON_PX: Record<'sm' | 'md' | 'lg', number> = { sm: 18, md: 68, lg: 92 };

  // Flat, two-tone folder that scales cleanly and reads in both themes.
  const FOLDER_COLORS: Record<string, { from: string; to: string; tab: string }> = {
    blue:   { from: '#38bdf8', to: '#2563eb', tab: '#7dd3fc' },
    orange: { from: '#fbbf24', to: '#f59e0b', tab: '#fcd34d' },
    green:  { from: '#34d399', to: '#059669', tab: '#6ee7b7' },
    purple: { from: '#c084fc', to: '#7c3aed', tab: '#d8b4fe' },
    red:    { from: '#fb7185', to: '#e11d48', tab: '#fda4af' },
  };

  const renderFolderIcon = (color?: string, size: 'sm' | 'md' | 'lg' = 'md') => {
    const px = ICON_PX[size];
    const c = FOLDER_COLORS[color || 'blue'] || FOLDER_COLORS.blue;
    const u = `fld-${color || 'blue'}-${size}`;
    // Two overlapping layers — a lighter back panel + tab behind a gradient front
    // pocket — give the folder real depth instead of a single flat shape.
    return (
      <svg width={px} height={px} viewBox="0 0 64 64" fill="none" className="drop-shadow-[0_4px_7px_rgba(0,0,0,0.2)]">
        <defs>
          <linearGradient id={`${u}-b`} x1="32" y1="25" x2="32" y2="49" gradientUnits="userSpaceOnUse">
            <stop stopColor={c.from} />
            <stop offset="1" stopColor={c.to} />
          </linearGradient>
        </defs>
        {/* back panel + tab (lighter tone, peeks above) */}
        <path d="M7 17a5 5 0 0 1 5-5h9.4a4 4 0 0 1 2.83 1.17L26.8 16a4 4 0 0 0 2.83 1.17H52a5 5 0 0 1 5 5v20a5 5 0 0 1-5 5H12a5 5 0 0 1-5-5z" fill={c.tab} />
        {/* front pocket (main gradient) */}
        <path d="M6 26a4 4 0 0 1 4-4h44a4 4 0 0 1 4 4v15a5 5 0 0 1-5 5H11a5 5 0 0 1-5-5z" fill={`url(#${u}-b)`} />
        {/* front top-edge highlight */}
        <path d="M10.5 24.5h43" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  };

  // Rounded document chip, tinted by file category — no skeuomorphic folded corner,
  // and theme-aware (the old card was hardcoded bg-white and vanished in dark mode).
  type FileKind = { Icon: typeof FileText; grad: string; fg: string; pill: string };
  const FILE_KINDS: Record<string, FileKind> = {
    video:   { Icon: Video, grad: 'from-purple-50 to-purple-100 dark:from-purple-500/25 dark:to-purple-500/10', fg: 'text-purple-500 dark:text-purple-300', pill: 'bg-purple-500/15 text-purple-600 dark:text-purple-200' },
    pdf:     { Icon: FileText, grad: 'from-red-50 to-red-100 dark:from-red-500/25 dark:to-red-500/10', fg: 'text-red-500 dark:text-red-300', pill: 'bg-red-500/15 text-red-600 dark:text-red-200' },
    archive: { Icon: Archive, grad: 'from-amber-50 to-amber-100 dark:from-amber-500/25 dark:to-amber-500/10', fg: 'text-amber-600 dark:text-amber-300', pill: 'bg-amber-500/15 text-amber-700 dark:text-amber-200' },
    code:    { Icon: Code, grad: 'from-emerald-50 to-emerald-100 dark:from-emerald-500/25 dark:to-emerald-500/10', fg: 'text-emerald-500 dark:text-emerald-300', pill: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-200' },
    audio:   { Icon: Music, grad: 'from-pink-50 to-pink-100 dark:from-pink-500/25 dark:to-pink-500/10', fg: 'text-pink-500 dark:text-pink-300', pill: 'bg-pink-500/15 text-pink-600 dark:text-pink-200' },
    image:   { Icon: ImageIcon, grad: 'from-sky-50 to-sky-100 dark:from-sky-500/25 dark:to-sky-500/10', fg: 'text-sky-500 dark:text-sky-300', pill: 'bg-sky-500/15 text-sky-600 dark:text-sky-200' },
    doc:     { Icon: FileText, grad: 'from-slate-50 to-slate-100 dark:from-white/15 dark:to-white/5', fg: 'text-slate-400 dark:text-slate-300', pill: 'bg-slate-400/15 text-slate-500 dark:text-slate-300' },
  };

  const classifyFile = (ext: string): keyof typeof FILE_KINDS => {
    if (['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v'].includes(ext)) return 'video';
    if (ext === 'pdf') return 'pdf';
    if (['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz'].includes(ext)) return 'archive';
    if (['js', 'jsx', 'cjs', 'mjs', 'ts', 'tsx', 'cts', 'mts', 'py', 'go', 'rs', 'java', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'rb', 'html', 'htm', 'css', 'scss', 'json', 'jsonc', 'xml', 'yml', 'yaml', 'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd', 'sql'].includes(ext)) return 'code';
    if (['mp3', 'wav', 'flac', 'ogg', 'm4a'].includes(ext)) return 'audio';
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'heic'].includes(ext)) return 'image';
    return 'doc';
  };

  const renderFileIcon = (file: FileItem, size: 'sm' | 'md' | 'lg' = 'md') => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const { Icon, grad, fg, pill } = FILE_KINDS[classifyFile(ext)];
    const label = ext ? ext.toUpperCase().slice(0, 4) : '';

    const box = size === 'sm' ? 'w-[18px] h-[18px] rounded-md' : size === 'lg' ? 'w-[74px] h-[90px] rounded-2xl' : 'w-[54px] h-[66px] rounded-xl';
    const iconSize = size === 'sm' ? 12 : size === 'lg' ? 33 : 25;

    return (
      <div className={`relative ${box} bg-gradient-to-b ${grad} ${fg} flex items-center justify-center border border-black/[0.05] dark:border-white/10 shadow-[0_2px_6px_rgba(15,23,42,0.1)] overflow-hidden`}>
        {/* top gloss adds depth to the flat chip */}
        <div className="absolute inset-x-0 top-0 h-2/5 bg-gradient-to-b from-white/60 to-transparent dark:from-white/10 pointer-events-none" />
        <Icon
          size={iconSize}
          strokeWidth={1.75}
          className={`relative drop-shadow-[0_1px_1px_rgba(0,0,0,0.08)] ${size === 'lg' ? '-mt-3' : size === 'md' ? '-mt-1.5' : ''}`}
        />
        {size !== 'sm' && label && (
          <span className="absolute inset-x-0 bottom-0 pb-1.5 flex justify-center">
            <span className={`px-1.5 rounded-full text-[7.5px] font-bold tracking-wider ${pill}`}>{label}</span>
          </span>
        )}
      </div>
    );
  };

  if (files.length === 0) {
    return (
      <div className="flex-1 bg-white dark:bg-transparent p-8 flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 space-y-3 min-h-[400px]"
           onContextMenu={(e) => handleContextMenu(e, null)}>
        <AlertCircle size={40} className="text-neutral-300 dark:text-neutral-600" />
        <div className="text-center">
          <p className="text-sm font-semibold">No files match filters</p>
          <p className="text-xs text-neutral-400 dark:text-neutral-500">Add some via the toolbar or drag them in!</p>
        </div>
      </div>
    );
  }

  // Active highlighted file details helper
  const activeFile = files.find(f => f.id === selectedFileId) || files[0];

  // RENDER GRID VIEW (Exactly matching image_cd440d.jpg)
  const renderGrid = () => {
    return (
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-3 gap-y-4 sm:gap-x-4 sm:gap-y-5">
        {visibleFiles.map((file) => {
          const isSelected = selectedIds.has(file.id);
          const isActive = selectedFileId === file.id;

          return (
            <div
              key={file.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelectFile(file, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey });
              }}
              onDoubleClick={() => onFileDoubleClick(file)}
              onContextMenu={(e) => {
                // Right-clicking an unselected item selects it first so the
                // menu's bulk actions operate on a sensible set.
                if (!selectedIds.has(file.id)) onSelectFile(file);
                handleContextMenu(e, file);
              }}
              draggable
              onDragStart={(e) => handleFileDragStart(e, file)}
              onDragEnd={() => { setDraggingFileId(null); setDropFolderId(null); }}
              onDragOver={(e) => handleFolderDragOver(e, file)}
              onDragLeave={() => { if (dropFolderId === file.id) setDropFolderId(null); }}
              onDrop={(e) => handleFolderDrop(e, file)}
              className={`group relative flex flex-col items-center text-center cursor-pointer select-none px-2 py-3 rounded-2xl transition-all duration-200 border ${
                dropFolderId === file.id
                  ? 'bg-emerald-500/12 border-emerald-400/50 ring-2 ring-emerald-400/20'
                  : isSelected
                  ? `bg-blue-500/10 dark:bg-blue-500/15 border-blue-500/25 dark:border-blue-400/30 shadow-[0_4px_12px_rgba(59,130,246,0.06)] ${isActive ? 'ring-2 ring-blue-400/40' : ''}`
                  : 'border-transparent hover:bg-neutral-50/80 dark:hover:bg-white/5 hover:border-neutral-200/40 dark:hover:border-white/10'
              }`}
            >
              {/* Selection checkbox — visible on hover or when selected. */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectFile(file, { ctrlKey: true });
                }}
                className={`absolute top-1.5 left-1.5 w-4 h-4 rounded-md border flex items-center justify-center z-10 transition-all focus:outline-none ${
                  isSelected
                    ? 'bg-blue-600 border-blue-600 text-white opacity-100'
                    : 'bg-white/80 dark:bg-black/40 border-neutral-300 dark:border-white/30 text-transparent opacity-0 group-hover:opacity-100'
                }`}
                title={isSelected ? 'Deselect' : 'Select'}
              >
                <Check size={11} strokeWidth={3} />
              </button>
              <button
                onClick={(e) => handleContextMenu(e, file)}
                className="absolute top-1.5 right-1.5 p-1 rounded-full text-neutral-400 hover:bg-black/5 dark:hover:bg-white/10 hover:text-neutral-700 dark:hover:text-neutral-200 opacity-0 group-hover:opacity-100 transition-all z-10 focus:outline-none"
                title="More Actions"
              >
                <MoreVertical size={14} />
              </button>
              <div className={`relative mb-2.5 h-[92px] w-full flex items-center justify-center transition-transform group-hover:scale-[1.04] ${
                isSelected ? 'scale-[1.02]' : ''
              }`}>

                {file.type === 'folder' && file.thumbnailUrl ? (
                  <LazyMediaThumbnail
                    src={file.thumbnailUrl}
                    alt={file.name}
                    type="image"
                    className={`w-[112px] h-[84px] rounded-xl border shadow-sm ${
                    isSelected ? 'border-blue-500 shadow-md ring-2 ring-blue-400/25' : 'border-neutral-300/80 dark:border-white/10'
                  }`}
                    mediaClassName="w-full h-full object-cover pointer-events-none"
                  >
                    <div className="absolute inset-x-0 bottom-0 px-2 py-1 bg-black/55 text-white text-[10px] font-bold text-left truncate">
                      {getFolderItemLabel(file)}
                    </div>
                  </LazyMediaThumbnail>
                ) : (file.type === 'image' || file.type === 'video') && file.thumbnailUrl ? (
                  <div className={`w-[112px] h-[84px] rounded-xl overflow-hidden border bg-neutral-50 dark:bg-white/5 flex items-center justify-center shadow-sm ${
                    isSelected ? 'border-blue-500 shadow-md ring-2 ring-blue-400/25' : 'border-neutral-300/80 dark:border-white/10'
                  }`}>
                    <LazyMediaThumbnail
                      src={file.thumbnailUrl}
                      alt={file.name}
                      type={file.type}
                      className="w-full h-full"
                      mediaClassName="w-full h-full object-cover pointer-events-none"
                    >
                      {file.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/15">
                          <div className="w-8 h-8 rounded-full bg-black/55 text-white flex items-center justify-center">
                            <Video size={16} fill="currentColor" />
                          </div>
                        </div>
                      )}
                    </LazyMediaThumbnail>
                  </div>
                ) : file.type === 'folder' ? (
                  renderFolderIcon(file.folderColor)
                ) : (
                  renderFileIcon(file)
                )}

                {/* Sub-items count badge */}
                {file.type === 'folder' && (
                  <span
                    className="absolute -top-1.5 -right-1 min-w-5 text-center text-[8px] bg-sky-100 text-sky-800 font-bold px-1.5 py-0.5 rounded-full border border-sky-200 shadow-sm scale-90 opacity-0 group-hover:opacity-100 transition-opacity"
                    title={getFolderItemLabel(file)}
                  >
                    {getFolderItemCount(file) ?? '--'}
                  </span>
                )}

                {/* Tags count badges inside corners */}
                {file.tags && file.tags.length > 0 && (
                  <div className="absolute -top-1 -right-1 flex space-x-0.5">
                    {file.tags.map(t => {
                        const tagColorMap: Record<string, string> = {
                          'Screenshots': '#3b82f6',
                          'Writing': '#a855f7',
                          'Invoice': '#22c55e',
                          'Important': '#ef4444',
                          'Red': '#ef4444',
                          'Orange': '#f97316',
                          'Yellow': '#eab308',
                          'Green': '#22c55e',
                          'Blue': '#3b82f6',
                          'Purple': '#a855f7',
                          'Gray': '#6b7280'
                        };
                      return (
                        <span 
                          key={t}
                          className="w-2.5 h-2.5 rounded-full border border-white"
                          style={{ backgroundColor: tagColorMap[t] || '#94a3b8' }}
                          title={`Tagged: ${t}`}
                        />
                      );
                    })}
                  </div>
                )}

                {/* Shared badge overlay */}
                {file.isShared && (
                  <div className="absolute -bottom-1 -right-1 bg-blue-100 text-blue-600 rounded-full p-1 border border-blue-200 shadow-sm" title="Shared Folder">
                    <Share2 size={10} strokeWidth={3} />
                  </div>
                )}
              </div>

              {/* Title wrapper */}
              <div className="w-full px-0.5">
                <p
                  className={`text-[12px] leading-snug font-medium truncate max-w-full transition-colors ${
                    isSelected ? 'text-blue-600 dark:text-blue-300' : 'text-neutral-700 dark:text-neutral-200'
                  }`}
                  title={file.name}
                >
                  {file.name}
                </p>
              </div>

              {/* Contextual Visual Accent Status Dot beneath selected folder/custom folders */}
              {file.hasStatusDot && (
                <div className="mt-1.5 flex justify-center">
                  <span 
                    className="w-1.5 h-1.5 rounded-full shadow-[0_0_5px_currentColor] animate-pulse" 
                    style={{ 
                      backgroundColor: file.statusDotColor === 'orange' ? '#f97316' : '#22c55e',
                      color: file.statusDotColor === 'orange' ? '#f97316' : '#22c55e'
                    }}
                    title="Active Priority Accent" 
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // RENDER STREAMLINED LIST VIEW
  const renderList = () => {
    return (
      <div className="w-full border border-neutral-200/60 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-[#1f1f22] shadow-sm">
        <table className="w-full text-left text-xs text-neutral-600 dark:text-neutral-300">
          <thead className="bg-neutral-50/70 dark:bg-white/5 border-b border-neutral-200/60 dark:border-white/10 text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
            <tr>
              <th className="py-2.5 pl-4 pr-1 w-8">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={visibleFiles.length > 0 && visibleFiles.every((f) => selectedIds.has(f.id))}
                  ref={(el) => {
                    if (el) el.indeterminate = visibleFiles.some((f) => selectedIds.has(f.id)) && !visibleFiles.every((f) => selectedIds.has(f.id));
                  }}
                  onChange={(e) => {
                    e.stopPropagation();
                    const allSelected = visibleFiles.every((f) => selectedIds.has(f.id));
                    if (allSelected) onClearSelection();
                    else visibleFiles.forEach((f) => { if (!selectedIds.has(f.id)) onSelectFile(f, { ctrlKey: true }); });
                  }}
                  className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                />
              </th>
              <th className="py-2.5 px-4 w-full sm:w-1/2">Name</th>
              <th className="py-2.5 px-3 hidden sm:table-cell">Kind</th>
              <th className="py-2.5 px-3 hidden sm:table-cell">Size / Items</th>
              <th className="py-2.5 px-3 hidden md:table-cell">Last Modified</th>
              <th className="py-2.5 px-3 hidden lg:table-cell">Tags</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100 dark:divide-white/5">
            {visibleFiles.map((file) => {
              const isSelected = selectedIds.has(file.id);
              return (
                <tr
                  key={file.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectFile(file, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey });
                  }}
                  onDoubleClick={() => onFileDoubleClick(file)}
                  onContextMenu={(e) => {
                    if (!selectedIds.has(file.id)) onSelectFile(file);
                    handleContextMenu(e, file);
                  }}
                  className={`group hover:bg-neutral-50 dark:hover:bg-white/5 transition-colors cursor-pointer ${
                    isSelected ? 'bg-blue-50/50 dark:bg-blue-500/10' : ''
                  }`}
                >
                  <td className="py-2.5 pl-4 pr-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      aria-label={`Select ${file.name}`}
                      checked={isSelected}
                      onChange={() => onSelectFile(file, { ctrlKey: true })}
                      className="w-3.5 h-3.5 rounded accent-blue-600 cursor-pointer"
                    />
                  </td>
                  <td className="py-2.5 px-4 flex items-center space-x-2.5 font-medium text-neutral-800 dark:text-neutral-200">
                    {file.type === 'folder' ? (
                      renderFolderIcon(file.folderColor, 'sm')
                    ) : file.type === 'image' ? (
                      <ImageIcon size={16} className="text-indigo-500" />
                    ) : (
                      <FileText size={16} className="text-neutral-500 dark:text-neutral-400" />
                    )}
                    <span className="truncate max-w-[200px] sm:max-w-xs">{file.name}</span>
                    {file.isShared && (
                      <span title="Shared Folder" className="ml-1.5 flex-shrink-0 flex items-center">
                        <Share2 size={12} className="text-blue-500" strokeWidth={3} />
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 capitalize text-neutral-500 dark:text-neutral-400 hidden sm:table-cell">{file.type}</td>
                  <td className="py-2.5 px-3 text-neutral-500 dark:text-neutral-400 font-mono text-[11px] hidden sm:table-cell">
                    {file.type === 'folder' ? getFolderItemLabel(file) : file.size}
                  </td>
                  <td className="py-2.5 px-3 text-neutral-500 dark:text-neutral-400 hidden md:table-cell">{file.updatedAt || 'Recent'}</td>
                  <td className="py-2.5 px-3 hidden lg:table-cell">
                    <div className="flex space-x-1.5">
                      {file.tags?.map(t => {
                        const bgMap: Record<string, string> = { Red: 'bg-red-100 text-red-600', Orange: 'bg-orange-100 text-orange-600', Yellow: 'bg-yellow-100 text-yellow-600', Green: 'bg-green-100 text-green-600', Blue: 'bg-blue-100 text-blue-600', Purple: 'bg-purple-100 text-purple-600', Gray: 'bg-gray-100 text-gray-600' };
                        return (
                          <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded font-bold border border-neutral-200/40 ${bgMap[t] || 'bg-neutral-100 text-neutral-600'}`}>
                            {t}
                          </span>
                        );
                      }) || <span className="text-neutral-300 dark:text-neutral-600">-</span>}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleContextMenu(e, file)}
                        className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-white/10 rounded focus:outline-none transition-colors"
                        title="More Actions"
                      >
                        <MoreVertical size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // RENDER THREE-COLUMN MAC OS VIEW LAYOUT
  const renderColumn = () => {
    return (
      <div className="flex border border-neutral-200/60 dark:border-white/10 rounded-xl overflow-hidden bg-white dark:bg-[#1f1f22] shadow-sm h-[380px]">

        {/* Column 1: Subdirectories list */}
        <div className="w-1/3 border-r border-neutral-200/50 dark:border-white/10 bg-neutral-50/50 dark:bg-white/[0.02] p-2.5 overflow-y-auto space-y-1">
          <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-2 mb-2">Directories</p>
          <button className={`w-full text-left px-2 py-1.5 text-xs rounded-lg flex items-center justify-between font-semibold ${
            currentPath.length === 1 ? 'bg-neutral-200 dark:bg-white/10 text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300 hover:bg-neutral-100 dark:hover:bg-white/5'
          }`}>
            <span className="flex items-center space-x-1.5">
              <Folder size={14} className="text-sky-400" />
              <span>Nextcloud (Root)</span>
            </span>
            <ChevronRight size={12} className="text-gray-400 dark:text-gray-500" />
          </button>

          {/* Active nodes */}
          {files.filter(f => f.type === 'folder').map(fol => (
            <button
              key={fol.id}
              onClick={() => onFileDoubleClick(fol)}
              className="w-full text-left px-2 py-1.5 text-xs rounded-lg flex items-center justify-between text-gray-600 dark:text-gray-300 hover:bg-neutral-100 dark:hover:bg-white/5 truncate"
            >
              <span className="flex items-center space-x-1.5">
                <Folder size={14} className={fol.folderColor === 'orange' ? 'text-amber-500' : 'text-sky-400'} />
                <span>{fol.name}</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="text-[10px] font-semibold text-neutral-400 dark:text-neutral-500">{getFolderItemCount(fol) ?? '--'}</span>
                <ChevronRight size={12} className="text-gray-400 dark:text-gray-500" />
              </span>
            </button>
          ))}
        </div>

        {/* Column 2: Files listed inside active folder */}
        <div className="w-1/3 border-r border-neutral-200/50 dark:border-white/10 p-2.5 overflow-y-auto space-y-1">
          <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider px-2 mb-2">Files List</p>
          {visibleFiles.map((file) => {
            const isSelected = selectedFileId === file.id;
            return (
              <button
                key={file.id}
                onClick={(e) => onSelectFile(file, { ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey })}
                onDoubleClick={() => onFileDoubleClick(file)}
                onContextMenu={(e) => {
                  if (!selectedIds.has(file.id)) onSelectFile(file);
                  handleContextMenu(e, file);
                }}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between font-medium transition-colors ${
                  isSelected ? 'bg-blue-600 text-white' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5'
                }`}
              >
                <span className="flex items-center space-x-1.5 truncate">
                  {file.type === 'folder' ? (
                    <Folder size={13} className={isSelected ? 'text-white' : file.folderColor === 'orange' ? 'text-amber-500' : 'text-sky-400'} />
                  ) : file.type === 'image' ? (
                    <ImageIcon size={13} className={isSelected ? 'text-white' : 'text-indigo-500'} />
                  ) : (
                    <FileText size={13} className={isSelected ? 'text-white' : 'text-neutral-500 dark:text-neutral-400'} />
                  )}
                  <span className="truncate">{file.name}</span>
                </span>
                {file.type === 'folder' && <ChevronRight size={11} className={isSelected ? 'text-blue-200' : 'text-gray-400 dark:text-gray-500'} />}
              </button>
            );
          })}
        </div>

        {/* Column 3: Live Rich Interactive Preview of active selection */}
        <div className="w-1/3 bg-neutral-50/30 dark:bg-white/[0.02] p-4 flex flex-col justify-between items-center text-center overflow-y-auto">
          <div className="w-full flex flex-col items-center space-y-3">
            <p className="text-[10px] font-bold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider w-full text-left border-b border-neutral-200/55 dark:border-white/10 pb-1">Quick Preview</p>

            {activeFile.type === 'folder' && activeFile.thumbnailUrl ? (
              <div className="w-40 h-28 rounded-lg overflow-hidden border border-neutral-300 dark:border-white/10 shadow-inner bg-white dark:bg-white/5 flex items-center justify-center">
                <img src={activeFile.thumbnailUrl} className="w-full h-full object-cover" alt="Preview"/>
              </div>
            ) : (activeFile.type === 'image' || activeFile.type === 'video') && activeFile.thumbnailUrl ? (
              <div className="w-40 h-28 rounded-lg overflow-hidden border border-neutral-300 dark:border-white/10 shadow-inner bg-white dark:bg-white/5 flex items-center justify-center p-1">
                {activeFile.type === 'video' ? (
                  <video src={activeFile.thumbnailUrl} className="w-full h-full object-cover rounded" muted preload="metadata" />
                ) : (
                  <img src={activeFile.thumbnailUrl} className="w-full h-full object-cover rounded" alt="Preview"/>
                )}
              </div>
            ) : activeFile.type === 'folder' ? (
              renderFolderIcon(activeFile.folderColor, 'lg')
            ) : (
              renderFileIcon(activeFile, 'lg')
            )}

            <div className="space-y-1">
              <h4 className="text-xs font-bold text-neutral-800 dark:text-neutral-100 break-all">{activeFile.name}</h4>
              <p className="text-[10px] text-neutral-400 dark:text-neutral-500 capitalize">{activeFile.type}</p>
            </div>

            <div className="w-full bg-white dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 rounded-lg p-2.5 text-left text-[10px] space-y-1 text-neutral-500 dark:text-neutral-400 font-mono shadow-sm">
              <p>
                <span className="text-neutral-400 dark:text-neutral-500 font-sans font-semibold">
                  {activeFile.type === 'folder' ? 'Items:' : 'Size:'}
                </span>{' '}
                {activeFile.type === 'folder' ? getFolderItemLabel(activeFile) : activeFile.size}
              </p>
              <p><span className="text-neutral-400 dark:text-neutral-500 font-sans font-semibold">Updated:</span> {activeFile.updatedAt}</p>
              {activeFile.tags && activeFile.tags.length > 0 && (
                <p className="flex items-center space-x-1 font-sans">
                  <span className="text-neutral-400 dark:text-neutral-500 font-semibold font-sans">Tags:</span>
                  <span className="bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 px-1.5 rounded text-[8px] font-semibold">{activeFile.tags[0]}</span>
                </p>
              )}
            </div>
          </div>

          <button 
            onClick={() => onFileDoubleClick(activeFile)}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs py-1.5 rounded-lg transition-colors flex items-center justify-center space-x-1 cursor-pointer mt-4 shadow-sm"
          >
            <Eye size={12} />
            <span>Open Quick Look</span>
          </button>
        </div>

      </div>
    );
  };

  // RENDER IMMERSIVE PROJECTION SLIDER GALLERY VIEW
  const renderGallery = () => {
    // Only display media / documents in gallery mode
    const galleryItems = files.filter(f => f.type === 'image' || f.type === 'video' || f.type === 'document');
    if (galleryItems.length === 0) {
      return (
        <div className="text-center p-12 text-sm text-neutral-500 dark:text-neutral-400 bg-neutral-50 dark:bg-white/5 border border-dashed border-neutral-200 dark:border-white/10 rounded-xl" onContextMenu={(e) => handleContextMenu(e, null)}>
          Gallery mode supports images and document icons. Click view settings or choose root.
        </div>
      );
    }
    
    // Bounds checking
    const safeIndex = galleryIndex >= galleryItems.length ? 0 : galleryIndex;
    const currentItem = galleryItems[safeIndex];
    const thumbnailStart = Math.max(0, safeIndex - 80);
    const thumbnailItems = galleryItems.slice(thumbnailStart, Math.min(galleryItems.length, safeIndex + 81));

    const prevSlide = () => {
      setGalleryIndex(prev => (prev === 0 ? galleryItems.length - 1 : prev - 1));
    };

    const nextSlide = () => {
      setGalleryIndex(prev => (prev === galleryItems.length - 1 ? 0 : prev + 1));
    };

    return (
      <div className="flex flex-col items-center bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-7 relative text-white shadow-xl min-h-[380px]" onContextMenu={(e) => handleContextMenu(e, null)}>
        {/* Slidy header */}
        <div className="absolute top-4 left-4 text-[10px] text-zinc-500 font-mono">
          Gallery: {safeIndex + 1} / {galleryItems.length}
        </div>

        {/* Big centered photo preview aspect box */}
        <div className="flex-1 w-full flex items-center justify-between gap-4 py-3">
          <button 
            onClick={prevSlide}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full transition-all cursor-pointer shadow-md text-zinc-300"
          >
            &larr;
          </button>

          <div 
            onClick={() => onFileDoubleClick(currentItem)}
            onContextMenu={(e) => handleContextMenu(e, currentItem)}
            className="relative max-w-md w-full h-56 bg-zinc-800 rounded-xl overflow-hidden flex items-center justify-center border border-zinc-700 p-2 shadow-inner group cursor-pointer"
          >
            {(currentItem.type === 'image' || currentItem.type === 'video') && currentItem.thumbnailUrl ? (
              currentItem.type === 'video' ? (
                <video 
                  src={currentItem.thumbnailUrl} 
                  className="max-h-full max-w-full object-contain rounded-lg shadow-md transition-all group-hover:scale-105 duration-300" 
                  muted
                  preload="metadata"
                />
              ) : (
                <img 
                  src={currentItem.thumbnailUrl} 
                  className="max-h-full max-w-full object-contain rounded-lg shadow-md transition-all group-hover:scale-105 duration-300" 
                  alt={currentItem.name} 
                />
              )
            ) : (
              <div className="scale-125">
                {renderFileIcon(currentItem, 'lg')}
              </div>
            )}
            
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <span className="bg-white/90 text-zinc-900 text-[10px] font-bold px-3 py-1.5 rounded-full shadow flex items-center space-x-1">
                <Eye size={12} />
                <span>Quick Look</span>
              </span>
            </div>
          </div>

          <button 
            onClick={nextSlide}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full transition-all cursor-pointer shadow-md text-zinc-300"
          >
            &rarr;
          </button>
        </div>

        {/* Meta label section */}
        <div className="mt-4 text-center">
          <h4 className="text-xs font-bold text-white mb-0.5">{currentItem.name}</h4>
          <span className="text-[10px] text-zinc-500 font-mono">{currentItem.size} &bull; {currentItem.updatedAt}</span>
        </div>

        {/* Slider thumbnails strip */}
        <div className="flex items-center space-x-2 mt-4 overflow-x-auto max-w-full py-1">
          {thumbnailItems.map((item, offset) => {
            const idx = thumbnailStart + offset;
            return (
            <button
              key={item.id}
              onClick={() => setGalleryIndex(idx)}
              className={`w-12 h-9 rounded overflow-hidden border transition-all flex-shrink-0 ${
                idx === safeIndex ? 'border-blue-500 scale-105 ring-2 ring-blue-500/20' : 'border-zinc-700 opacity-60 hover:opacity-100'
              }`}
            >
              {(item.type === 'image' || item.type === 'video') && item.thumbnailUrl ? (
                <LazyMediaThumbnail
                  src={item.thumbnailUrl}
                  alt={item.name}
                  type={item.type}
                  className="w-full h-full"
                  mediaClassName="w-full h-full object-cover"
                  rootMargin="300px"
                />
              ) : (
                <div className="bg-zinc-800 w-full h-full flex items-center justify-center text-zinc-400">
                  <FileText size={12} />
                </div>
              )}
            </button>
          );
          })}
        </div>

      </div>
    );
  };

  return (
    <div 
      ref={containerRef}
      className="flex-1 bg-transparent p-4 md:p-5 overflow-y-auto relative outline-none select-none"
      onContextMenu={(e) => handleContextMenu(e, null)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => { setContextMenu(null); onClearSelection(); }}
    >
      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          file={contextMenu.file}
          x={contextMenu.x}
          y={contextMenu.y}
          clipboardState={clipboardState}
          selectionCount={contextMenu.file ? (selectedIds.has(contextMenu.file.id) ? selectedIds.size : 1) : 0}
          onZip={onZip ? () => {
            const target = contextMenu.file && selectedIds.has(contextMenu.file.id)
              ? files.filter((f) => selectedIds.has(f.id))
              : contextMenu.file ? [contextMenu.file] : [];
            if (target.length) onZip(target);
          } : undefined}
          onUnzip={onUnzip}
          onDownloadSelection={onDownloadMany ? () => {
            const target = files.filter((f) => selectedIds.has(f.id));
            if (target.length) onDownloadMany(target);
          } : undefined}
          onDeleteSelection={() => {
            const ids = Array.from(selectedIds);
            if (onDeleteMany) onDeleteMany(ids);
            else ids.forEach((id) => onDeleteFile(id));
          }}
          onClose={() => setContextMenu(null)}
          onQuickLook={contextMenu.file ? (f) => onFileDoubleClick(f) : undefined}
          onRename={contextMenu.file ? async (f) => {
            const newName = await promptDialog({ title: 'Rename', placeholder: 'New name', defaultValue: f.name, confirmLabel: 'Rename' });
            if (newName && newName.trim() !== f.name) onRenameFile(f.id, newName.trim());
          } : undefined}
          onFavorite={contextMenu.file ? (f) => onUpdateMetadata?.(f.id, { isFavorite: !f.isFavorite, name: f.name }) : undefined}
          onDelete={contextMenu.file ? (fId) => onDeleteFile(fId) : undefined}
          onShare={onShare}
          onOpenInCodeServer={contextMenu.file?.type === 'folder' ? openFolderInCodeServer : undefined}
          onCreateFile={async () => {
            const name = await promptDialog({ title: 'New File', placeholder: 'e.g. Note.txt', confirmLabel: 'Create' });
            if (name && name.trim()) onAddNewFile?.(name.trim(), 'text');
          }}
          onCreateFolder={async () => {
            const name = await promptDialog({ title: 'New Folder', placeholder: 'Folder name', confirmLabel: 'Create' });
            if (name && name.trim()) onAddNewFolder?.(name.trim());
          }}
          onTag={contextMenu.file ? (f, tag) => {
            const currentTags = f.tags || [];
            let newTags = [...currentTags];
            if (newTags.includes(tag)) {
              newTags = newTags.filter(t => t !== tag);
            } else {
              newTags.push(tag);
            }
            onUpdateMetadata?.(f.id, { tags: newTags });
          } : undefined}
          onCopy={contextMenu.file ? (f) => setClipboard?.({ action: 'copy', file: f }) : undefined}
          onCut={contextMenu.file ? (f) => setClipboard?.({ action: 'cut', file: f }) : undefined}
          onPaste={() => {
            if (onPasteClipboard) {
              onPasteClipboard();
            } else if (clipboardState) {
              toast({ message: `Pasted copy of ${clipboardState.file.name}`, tone: 'success' });
            }
          }}
        />
      )}
      {/* Drag Mask */}
      {isDragging && (
        <div className="absolute inset-0 bg-blue-600/15 backdrop-blur-sm z-30 flex flex-col items-center justify-center border-4 border-dashed border-blue-500 rounded-2xl m-3 transition-all">
          <div className="p-4 bg-white rounded-full shadow-lg text-blue-600 mb-2 animate-bounce">
            <Plus size={32} />
          </div>
          <span className="text-sm font-bold text-blue-700 bg-white/90 backdrop-blur-md px-4 py-2 rounded-full shadow-md">
            Drop your files here to import directly!
          </span>
        </div>
      )}

      {/* Conditionally render selected View Modes */}
      {viewMode === 'grid' && renderGrid()}
      {viewMode === 'list' && renderList()}
      {viewMode === 'column' && renderColumn()}
      {viewMode === 'gallery' && renderGallery()}

      {visibleCount < files.length && (
        <div ref={loadMoreRef} className="h-16 flex items-center justify-center text-xs text-neutral-400 dark:text-neutral-500">
          Loading more items...
        </div>
      )}

      {/* Floating selection action bar */}
      {selectedIds.size > 0 && (() => {
        const selected = files.filter((f) => selectedIds.has(f.id));
        const singleZip = selected.length === 1 && /\.zip$/i.test(selected[0].name) && selected[0].type !== 'folder';
        return (
          <div
            className="sticky bottom-3 z-20 mx-auto mt-4 flex w-fit max-w-full items-center gap-1 rounded-full border border-neutral-200/70 bg-white/90 px-2 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-[#26262a]/90"
            onClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); }}
          >
            <span className="px-2.5 text-xs font-semibold text-neutral-700 dark:text-neutral-200 whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <div className="mx-0.5 h-5 w-px bg-neutral-200 dark:bg-white/10" />

            {onZip && (
              <button
                onClick={() => onZip(selected)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/10 transition-colors"
                title="Compress selection to a .zip"
              >
                <FileArchive size={14} /> Zip
              </button>
            )}

            {singleZip && onUnzip && (
              <button
                onClick={() => onUnzip(selected[0])}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/10 transition-colors"
                title="Extract archive"
              >
                <FileArchive size={14} /> Extract
              </button>
            )}

            {onDownloadMany && (
              <button
                onClick={() => onDownloadMany(selected)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-white/10 transition-colors"
                title="Download selection"
              >
                <Download size={14} /> Download
              </button>
            )}

            <button
              onClick={() => (onDeleteMany ? onDeleteMany(Array.from(selectedIds)) : selected.forEach((f) => onDeleteFile(f.id)))}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 transition-colors"
              title="Delete selection"
            >
              <Trash2 size={14} /> Delete
            </button>

            <div className="mx-0.5 h-5 w-px bg-neutral-200 dark:bg-white/10" />
            <button
              onClick={() => onClearSelection()}
              className="flex items-center justify-center rounded-full p-1.5 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/10 transition-colors"
              title="Clear selection"
            >
              <X size={15} />
            </button>
          </div>
        );
      })()}

    </div>
  );
}
