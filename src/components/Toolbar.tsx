import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronLeft, ChevronRight, Columns, FolderPlus, Image, LayoutGrid, LayoutList, Plus, RefreshCw, Search, Upload, CheckSquare, Home } from 'lucide-react';
import type { ViewMode } from '../types';
import { partsPath, pathParts } from '../lib/files';
import { promptDialog } from './SystemUI';
import { Button, IconButton } from './ui/surfaces';

interface ToolbarProps {
  currentPath: string[]; onNavigateBack: () => void; onNavigateForward: () => void;
  canNavigateBack: boolean; canNavigateForward: boolean; viewMode: ViewMode; setViewMode: (mode: ViewMode) => void;
  searchTerm: string; setSearchTerm: (term: string) => void;
  onAddNewFile: (name: string, type: 'document' | 'text' | 'image') => void; onAddNewFolder: (name: string) => void;
  sortOption: string; setSortOption: (option: string) => void; onUploadFiles?: (files: FileList | File[]) => void;
  onNavigatePath?: (path: string[]) => void; onRefresh?: () => void; refreshing?: boolean; disabled?: boolean;
  onSelectMode?: () => void; selectionMode?: boolean;
}
export default function Toolbar(props: ToolbarProps) {
  const { currentPath, viewMode, setViewMode, searchTerm, setSearchTerm } = props;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(partsPath(currentPath));
  const pathRef = useRef<HTMLInputElement>(null);
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef<HTMLDivElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const folderUploadRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(partsPath(currentPath)); setEditing(false); }, [currentPath.join('/')]);
  useEffect(() => { if (editing) { pathRef.current?.focus(); pathRef.current?.select(); } }, [editing]);
  useEffect(() => {
    const edit = () => { if (!pathRef.current?.closest('[inert]')) setEditing(true); };
    window.addEventListener('homios:edit-path', edit);
    return () => window.removeEventListener('homios:edit-path', edit);
  }, []);
  useEffect(() => {
    if (!addOpen) return;
    const close = (event: PointerEvent) => { if (!addRef.current?.contains(event.target as Node)) setAddOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') setAddOpen(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', key); };
  }, [addOpen]);
  async function create(folder: boolean) {
    setAddOpen(false);
    const name = await promptDialog({ title: folder ? 'New folder' : 'New text file', placeholder: folder ? 'Folder name' : 'Note.txt', confirmLabel: 'Create' });
    if (name?.trim()) { if (folder) props.onAddNewFolder(name.trim()); else props.onAddNewFile(name.trim(), 'text'); }
  }
  return <div className="flex shrink-0 flex-col gap-3 border-b border-neutral-200/60 px-4 py-3 dark:border-white/[.06] md:px-6">
    <div className="flex min-w-0 items-center gap-1">
      <IconButton label="Back (Alt+Left)" onClick={props.onNavigateBack} disabled={!props.canNavigateBack}><ChevronLeft size={18}/></IconButton>
      <IconButton label="Forward (Alt+Right)" onClick={props.onNavigateForward} disabled={!props.canNavigateForward}><ChevronRight size={18}/></IconButton>
      <IconButton label="Parent folder (Alt+Up)" onClick={() => props.onNavigatePath?.(currentPath.slice(0, -1))} disabled={currentPath.length <= 1}><ArrowUp size={17}/></IconButton>
      <div className="min-w-0 flex-1">
        <form hidden={!editing} onSubmit={event => { event.preventDefault(); if (!draft.split(/[\\/]/).some(part => part === '..' || part === '.')) props.onNavigatePath?.(pathParts(draft)); setEditing(false); }}>
          <input ref={pathRef} aria-label="Folder path" value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} onBlur={() => setEditing(false)} className="w-full rounded-xl border border-blue-500 bg-transparent px-3 py-2 font-mono text-xs outline-none"/>
        </form>
        {!editing && <nav aria-label="Folder breadcrumbs" className="flex items-center overflow-x-auto whitespace-nowrap text-xs">
          {currentPath.map((part, index) => <React.Fragment key={index}>{index > 0 && <ChevronRight size={13} className="shrink-0 text-neutral-400"/>}<button onClick={() => props.onNavigatePath?.(currentPath.slice(0, index + 1))} onDoubleClick={() => setEditing(true)} className={`min-h-9 shrink-0 rounded-lg px-2 hover:bg-black/5 dark:hover:bg-white/5 ${index === currentPath.length - 1 ? 'font-semibold' : 'text-neutral-500'}`}>{index === 0 ? <Home size={15} aria-label="Root"/> : part}</button></React.Fragment>)}
          <button aria-label="Edit folder path" title="Edit path (Ctrl/Cmd+L)" onClick={() => setEditing(true)} className="min-h-9 px-2 text-neutral-400">/</button>
        </nav>}
      </div>
      <IconButton label="Refresh folder" onClick={props.onRefresh} disabled={props.refreshing}><RefreshCw size={16} className={props.refreshing ? 'animate-spin' : ''}/></IconButton>
      <div className="relative" ref={addRef}><IconButton label="Create or upload" aria-expanded={addOpen} disabled={props.disabled} onClick={() => setAddOpen(value => !value)}><Plus size={19}/></IconButton>
        {addOpen && <div role="menu" aria-label="Create or upload" className="ui-enter absolute right-0 top-full z-40 mt-2 w-52 rounded-2xl border border-neutral-200 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-[#252528]" onKeyDown={event => { if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button')); const index = buttons.indexOf(document.activeElement as HTMLButtonElement); buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length]?.focus(); } }}>
          <Button role="menuitem" className="w-full !justify-start" variant="ghost" onClick={() => void create(true)}><FolderPlus size={16}/>New folder</Button>
          <Button role="menuitem" className="w-full !justify-start" variant="ghost" onClick={() => void create(false)}><Plus size={16}/>New text file</Button>
          <Button role="menuitem" className="w-full !justify-start" variant="ghost" onClick={() => { uploadRef.current?.click(); setAddOpen(false); }}><Upload size={16}/>Upload files</Button>
          <Button role="menuitem" className="w-full !justify-start" variant="ghost" onClick={() => { folderUploadRef.current?.click(); setAddOpen(false); }}><Upload size={16}/>Upload folder</Button>
        </div>}
      </div>
      <input ref={uploadRef} type="file" multiple hidden onChange={event => { if (event.target.files) props.onUploadFiles?.(event.target.files); event.target.value = ''; }}/>
      <input ref={folderUploadRef} type="file" multiple hidden {...{ webkitdirectory: '' } as any} onChange={event => { if (event.target.files) props.onUploadFiles?.(event.target.files); event.target.value = ''; }}/>
    </div>
    <div className="flex items-center gap-2">
      <div className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"/><input type="search" aria-label="Search this folder" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search this folder" className="min-h-9 w-full rounded-xl border border-neutral-200/70 bg-white/60 py-2 pl-9 pr-3 text-xs dark:border-white/10 dark:bg-white/[.04]"/></div>
      <select aria-label="Sort files" value={props.sortOption} onChange={event => props.setSortOption(event.target.value)} className="min-h-9 max-w-28 rounded-xl border border-neutral-200/70 bg-transparent px-2 text-xs dark:border-white/10"><option value="name">Name</option><option value="date">Modified</option><option value="size">Size</option><option value="type">Type</option></select>
      <div className="flex rounded-xl bg-neutral-200/40 p-0.5 dark:bg-white/5" role="group" aria-label="File view">{([{ id: 'grid', icon: LayoutGrid }, { id: 'list', icon: LayoutList }, { id: 'column', icon: Columns }, { id: 'gallery', icon: Image }] as const).map(({ id, icon: Icon }) => <IconButton key={id} label={`${id} view`} aria-pressed={viewMode === id} className={`${id === 'column' || id === 'gallery' ? 'hidden md:inline-flex' : ''} ${viewMode === id ? '!bg-white shadow-sm dark:!bg-white/10' : ''}`} onClick={() => setViewMode(id)}><Icon size={15}/></IconButton>)}</div>
      <IconButton label={props.selectionMode ? 'Finish selecting' : 'Select files'} aria-pressed={props.selectionMode} onClick={props.onSelectMode}><CheckSquare size={17}/></IconButton>
    </div>
  </div>;
}
