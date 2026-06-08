import React, { useEffect, useRef } from 'react';
import { Eye, Star, Edit3, Download, Trash2, Folder } from 'lucide-react';
import { FileItem } from '../types';

interface ContextMenuProps {
  file: FileItem;
  x: number;
  y: number;
  onClose: () => void;
  onQuickLook: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onFavorite: (file: FileItem) => void;
  onDelete: (id: string) => void;
}

export default function ContextMenu({
  file, x, y, onClose,
  onQuickLook, onRename, onFavorite, onDelete,
}: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const fileUrl = `/api/files?path=${encodeURIComponent(file.id)}&raw=true`;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('mousedown', handler); window.removeEventListener('keydown', escape); };
  }, [onClose]);

  // Keep menu inside viewport
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 240),
    left: Math.min(x, window.innerWidth - 200),
    zIndex: 9999,
  };

  const Item = ({ icon, label, onClick, danger = false }: {
    icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean;
  }) => (
    <button
      onClick={() => { onClick(); onClose(); }}
      className={`w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs rounded-lg transition-colors text-left
        ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-slate-300 hover:bg-white/8 hover:text-slate-100'}`}
    >
      <span className="w-3.5 flex-shrink-0">{icon}</span>
      <span>{label}</span>
    </button>
  );

  return (
    <div
      ref={ref}
      style={style}
      className="w-48 bg-[#1a2035]/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-[0_16px_48px_rgba(0,0,0,0.6)] p-1.5 space-y-0.5"
    >
      <Item icon={<Eye size={13} />} label="Quick Look" onClick={() => onQuickLook(file)} />
      {file.type === 'folder' && (
        <Item icon={<Star size={13} />} label={file.isFavorite ? 'Unstar Folder' : 'Star Folder'} onClick={() => onFavorite(file)} />
      )}
      <Item icon={<Edit3 size={13} />} label="Rename" onClick={() => onRename(file)} />
      {file.type !== 'folder' && (
        <a
          href={fileUrl}
          download={file.name}
          onClick={onClose}
          className="w-full flex items-center space-x-2.5 px-3 py-1.5 text-xs rounded-lg text-slate-300 hover:bg-white/8 hover:text-slate-100 transition-colors"
        >
          <Download size={13} className="w-3.5 flex-shrink-0" />
          <span>Download</span>
        </a>
      )}
      <div className="border-t border-white/5 my-1" />
      <Item icon={<Trash2 size={13} />} label="Delete" onClick={() => onDelete(file.id)} danger />
    </div>
  );
}
