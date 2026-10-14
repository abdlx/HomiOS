import React, { useState } from 'react';
import { ArrowUp, ChevronRight, Folder, FolderPlus } from 'lucide-react';
import type { FileItem } from '../../../types';
import { normalizePath, operationUnavailable, parentPath, pathParts, partsPath } from '../lib/files';
import { invalidateDirectories, useDirectory } from '../hooks/useDirectory';
import { useVirtualRows } from '../../../hooks/useVirtualRows';
import { Button, EmptyState, ErrorPanel, IconButton, Sheet, Skeleton } from '../../../components/ui/surfaces';
import { promptDialog } from '../../../components/SystemUI';

export default function DestinationPicker({ action, items, initialPath, onClose, onSelect }: { action: 'copy' | 'move'; items: FileItem[]; initialPath: string; onClose: () => void; onSelect: (path: string) => void }) {
  const [path, setPath] = useState(initialPath);
  const directory = useDirectory(path);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const folders = directory.files.filter(file => file.type === 'folder');
  const rows = useVirtualRows(folders.length, 52);
  const unavailable = operationUnavailable(items, path, action);
  async function createFolder() {
    const name = await promptDialog({ title: 'New destination folder', placeholder: 'Folder name', confirmLabel: 'Create' });
    if (!name?.trim()) return;
    if (/[\\/]/.test(name) || ['.', '..'].includes(name)) { setError('Enter a folder name without slashes.'); return; }
    setCreating(true); setError('');
    try {
      const response = await fetch('/api/files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: normalizePath(path + '/' + name.trim()), isDir: true }) });
      if (!response.ok) throw new Error((await response.json()).error || 'Could not create folder');
      invalidateDirectories(path); setPath(normalizePath(path + '/' + name.trim()));
    } catch (next) { setError(next instanceof Error ? next.message : 'Could not create folder'); }
    finally { setCreating(false); }
  }
  return <Sheet title={`${action === 'move' ? 'Move' : 'Copy'} ${items.length} item${items.length === 1 ? '' : 's'}`} onClose={onClose} wide>
    <p className="px-5 pt-4 text-xs text-neutral-500">Choose a destination. Transfers continue in the background.</p>
    <div className="flex items-center gap-2 border-b border-neutral-200/60 p-3 dark:border-white/10"><IconButton label="Parent destination folder" disabled={path === '/'} onClick={() => setPath(parentPath(path))}><ArrowUp size={17}/></IconButton><nav aria-label="Destination breadcrumbs" className="flex min-w-0 flex-1 items-center overflow-auto text-xs">{pathParts(path).map((part, index, parts) => <React.Fragment key={index}>{index > 0 && <ChevronRight size={13} className="shrink-0"/>}<Button variant="ghost" onClick={() => setPath(partsPath(parts.slice(0, index + 1)))}>{part}</Button></React.Fragment>)}</nav><IconButton label="New destination folder" disabled={directory.loading || !!directory.error || creating} onClick={() => void createFolder()}><FolderPlus size={18}/></IconButton></div>
    {(error || directory.error) && <div className="p-3"><ErrorPanel message={error || directory.error!} onRetry={() => { setError(''); directory.refresh(); }}/></div>}
    <div ref={rows.ref} className="min-h-60 flex-1 overflow-auto p-3" style={{ maxHeight: '50dvh' }}>
      {directory.loading ? <div className="space-y-3 p-2">{[0, 1, 2, 3].map(i => <Skeleton key={i} className="h-10"/>)}</div> : folders.length ? <div style={{ position: 'relative', height: rows.totalHeight }}><div style={{ position: 'absolute', left: 0, right: 0, top: rows.offset }}>{folders.slice(rows.start, rows.end).map(folder => { const disabled = !!operationUnavailable(items, normalizePath(folder.id), action); return <button key={folder.id} disabled={disabled} title={disabled ? 'This folder is part of the selection' : folder.name} onClick={() => setPath(normalizePath(folder.id))} className="flex h-[52px] w-full items-center gap-3 rounded-xl px-3 text-left text-sm hover:bg-neutral-500/10 disabled:opacity-30"><Folder size={22} className="shrink-0 text-sky-400"/><span className="min-w-0 flex-1 truncate">{folder.name}</span><ChevronRight size={16} className="text-neutral-400"/></button>; })}</div></div> : !directory.error && <EmptyState title="No subfolders" description="You can use this folder or create a new one."/>}
    </div>
    <footer className="border-t border-neutral-200/60 p-4 dark:border-white/10">{unavailable && <p className="mb-3 text-xs text-amber-600" role="status">{unavailable}</p>}<div className="flex justify-end gap-2"><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={directory.loading || !!directory.error || !!unavailable} onClick={() => onSelect(path)}>{action === 'move' ? 'Move here' : 'Copy here'}</Button></div></footer>
  </Sheet>;
}
