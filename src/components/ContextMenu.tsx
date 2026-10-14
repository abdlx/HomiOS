import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Eye, Star, Edit3, Download, Trash2, FolderPlus, FilePlus, Copy, Scissors, ClipboardPaste, Share2, Code2, FileArchive } from 'lucide-react';
import { FileItem } from '../types';
import { FileClipboard } from '../lib/files';

interface ContextMenuProps {
  file: FileItem | null;
  x: number;
  y: number;
  clipboardState?: FileClipboard | null;
  onMoveTo?: () => void;
  onCopyTo?: () => void;
  /** Number of items currently selected (>1 switches the menu to bulk mode). */
  selectionCount?: number;
  onClose: () => void;
  onQuickLook?: (file: FileItem) => void;
  onRename?: (file: FileItem) => void;
  onFavorite?: (file: FileItem) => void;
  onDelete?: (id: string) => void;
  onDeleteSelection?: () => void;
  onCreateFile?: () => void;
  onCreateFolder?: () => void;
  onCopy?: (file: FileItem) => void;
  onCut?: (file: FileItem) => void;
  onPaste?: () => void;
  onTag?: (file: FileItem, tag: string) => void;
  onShare?: (file: FileItem) => void;
  onOpenInCodeServer?: (file: FileItem) => void;
  onZip?: () => void;
  onUnzip?: (file: FileItem) => void;
  onDownloadSelection?: () => void;
}

export default function ContextMenu({
  file, x, y, clipboardState, selectionCount = 0, onClose,
  onQuickLook, onRename, onFavorite, onDelete, onDeleteSelection,
  onCreateFile, onCreateFolder, onCopy, onCut, onPaste, onTag, onShare, onOpenInCodeServer,
  onZip, onUnzip, onDownloadSelection, onMoveTo, onCopyTo
}: ContextMenuProps) {
  const isMulti = selectionCount > 1;
  const isZip = !!file && file.type !== 'folder' && /\.zip$/i.test(file.name);
  const ref = useRef<HTMLDivElement>(null);
  const fileUrl = file ? `/api/files?path=${encodeURIComponent(file.id)}&raw=true` : '';
  const downloadUrl = file ? `/api/files?path=${encodeURIComponent(file.id)}&${file.type === 'folder' ? 'downloadZip=true' : 'raw=true'}` : '';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escape);
    // Prevent browser context menu inside our custom one
    const preventContext = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) e.preventDefault();
    };
    window.addEventListener('contextmenu', preventContext);
    return () => { 
      window.removeEventListener('mousedown', handler); 
      window.removeEventListener('keydown', escape); 
      window.removeEventListener('contextmenu', preventContext);
    };
  }, [onClose]);

  // Keep menu inside viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.max(8, Math.min(y, window.innerHeight - (file ? 540 : 200))),
    left: Math.max(8, Math.min(x, window.innerWidth - 224)),
    zIndex: 9999,
  };

  const Item = ({ icon, label, onClick, danger = false }: {
    icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
  }) => (
    <button
      role="menuitem"
      onClick={(e) => { e.stopPropagation(); onClick(); onClose(); }}
      className={`w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs rounded-lg transition-colors text-left
        ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-300 hover:bg-white/8 hover:text-slate-100'}`}
    >
      <span className="w-3.5 flex-shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="File actions"
      style={style}
      className="ui-enter w-52 max-h-[calc(100dvh-16px)] overflow-auto bg-[#1a2035]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.6)] p-1.5 space-y-0.5 [&_button]:min-h-9 max-md:[&_button]:min-h-11"
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),a[href]')); const index = nodes.indexOf(document.activeElement as HTMLElement); nodes[event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + nodes.length) % nodes.length]?.focus(); } }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {file && isMulti ? (
        <>
          <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 border-b border-white/10 mb-1">
            {selectionCount} items selected
          </div>
          {onZip && <Item icon={<FileArchive size={13} />} label="Compress to ZIP" onClick={() => onZip()} />}
          <Item icon={<Copy size={13}/>} label="Copy" onClick={() => onCopy?.(file)}/>
          <Item icon={<Scissors size={13}/>} label="Cut" onClick={() => onCut?.(file)}/>
          <Item icon={<FolderPlus size={13}/>} label="Move to…" onClick={() => onMoveTo?.()}/>
          <Item icon={<Copy size={13}/>} label="Copy to…" onClick={() => onCopyTo?.()}/>
          {onDownloadSelection && <Item icon={<Download size={13} />} label="Download" onClick={() => onDownloadSelection()} />}
          <div className="border-t border-white/5 my-1" />
          {onDeleteSelection && <Item icon={<Trash2 size={13} />} label={`Delete ${selectionCount} items`} onClick={() => onDeleteSelection()} danger />}
        </>
      ) : file ? (
        <>
          <div className="flex justify-between px-2 py-2 border-b border-white/10 mb-1">
            {['Red', 'Orange', 'Yellow', 'Green', 'Blue', 'Purple', 'Gray'].map(t => {
              const tagColors: Record<string, string> = { Red: '#ef4444', Orange: '#f97316', Yellow: '#eab308', Green: '#22c55e', Blue: '#3b82f6', Purple: '#a855f7', Gray: '#6b7280' };
              const isTagged = file.tags?.includes(t);
              return (
                <button
                  key={t}
                  onClick={(e) => { e.stopPropagation(); onTag?.(file, t); onClose(); }}
                  className={`w-3.5 h-3.5 rounded-full border shadow-sm transition-transform hover:scale-125 ${isTagged ? 'border-white ring-2 ring-white/40' : 'border-black/20'}`}
                  style={{ backgroundColor: tagColors[t] }}
                  title={t}
                />
              );
            })}
          </div>
          <Item icon={<Eye size={13} />} label="Quick Look" onClick={() => onQuickLook?.(file)} />
          {file?.type === 'folder' && (
            <Item icon={<Star size={13} />} label={file.isFavorite ? 'Unstar Folder' : 'Star Folder'} onClick={() => onFavorite?.(file)} />
          )}
          {file?.type === 'folder' && (
            <Item icon={<Share2 size={13} />} label="Share Folder..." onClick={() => onShare?.(file)} />
          )}
          {file?.type === 'folder' && (
            <Item icon={<Code2 size={13} />} label="Open in Code Server" onClick={() => onOpenInCodeServer?.(file)} />
          )}
          <Item icon={<Edit3 size={13} />} label="Rename" onClick={() => onRename?.(file)} />
          <Item icon={<Copy size={13} />} label="Copy" onClick={() => onCopy?.(file)} />
          <Item icon={<Scissors size={13} />} label="Cut" onClick={() => onCut?.(file)} />
          <Item icon={<FolderPlus size={13}/>} label="Move to…" onClick={() => onMoveTo?.()}/>
          <Item icon={<Copy size={13}/>} label="Copy to…" onClick={() => onCopyTo?.()}/>
          {isZip && onUnzip ? (
            <Item icon={<FileArchive size={13} />} label="Extract Here" onClick={() => onUnzip(file)} />
          ) : (
            onZip && <Item icon={<FileArchive size={13} />} label="Compress to ZIP" onClick={() => onZip()} />
          )}
          <a
            href={downloadUrl}
            download={file.type === 'folder' ? `${file.name}.zip` : file.name}
            onClick={onClose}
            className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs rounded-lg text-slate-300 hover:bg-white/8 hover:text-slate-100 transition-colors"
          >
            <Download size={13} className="w-3.5 flex-shrink-0" />
            <span>Download{file.type === 'folder' ? ' as ZIP' : ''}</span>
          </a>
          <div className="border-t border-white/5 my-1" />
          <Item icon={<Trash2 size={13} />} label="Delete" onClick={() => onDelete?.(file.id)} danger />
        </>
      ) : (
        <>
          <Item icon={<FolderPlus size={13} />} label="New Folder" onClick={() => onCreateFolder?.()} />
          <Item icon={<FilePlus size={13} />} label="New File" onClick={() => onCreateFile?.()} />
          <div className="border-t border-white/5 my-1" />
          {clipboardState ? (
            <Item icon={<ClipboardPaste size={13} />} label={`Paste ${clipboardState.items.length} items`} onClick={() => onPaste?.()} />
          ) : (
            <button disabled className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs rounded-lg text-left text-slate-600 cursor-not-allowed">
              <span className="w-3.5 flex-shrink-0"><ClipboardPaste size={13} /></span>
              <span>Paste</span>
            </button>
          )}
        </>
      )}
    </div>,
    document.body
  );
}
