import React, { useState, useRef } from 'react';
import { 
  FileText, 
  Folder, 
  Image as ImageIcon, 
  Trash2, 
  Eye, 
  Check, 
  Plus, 
  AlertCircle, 
  ChevronRight, 
  Info,
  Sparkles,
  Star,
  Edit3,
  Download,
  Video,
  Archive,
  Code,
  Music,
  File,
  MoreVertical
} from 'lucide-react';
import { FileItem, ViewMode } from '../types';
import ContextMenu from './ContextMenu';

interface FileAreaProps {
  files: FileItem[];
  selectedFileId: string | null;
  setSelectedFileId: (id: string | null) => void;
  onFileDoubleClick: (file: FileItem) => void;
  onDeleteFile: (id: string) => void;
  onRenameFile: (id: string, newName: string) => void;
  onUploadFiles: (files: FileList) => void;
  viewMode: ViewMode;
  currentPath: string[];
  onUpdateMetadata?: (fileId: string, metadata: any) => void;
  clipboardState?: { action: 'copy' | 'cut'; file: FileItem } | null;
  setClipboard?: (state: { action: 'copy' | 'cut'; file: FileItem } | null) => void;
  onAddNewFile?: (name: string, type: 'document' | 'text' | 'image') => void;
  onAddNewFolder?: (name: string, color?: 'blue' | 'orange' | 'green') => void;
}

export default function FileArea({
  files,
  selectedFileId,
  setSelectedFileId,
  onFileDoubleClick,
  onDeleteFile,
  onRenameFile,
  onUploadFiles,
  viewMode,
  currentPath,
  onUpdateMetadata,
  clipboardState,
  setClipboard,
  onAddNewFile,
  onAddNewFolder
}: FileAreaProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  // Gallery active slide index
  const [galleryIndex, setGalleryIndex] = useState(0);

  // Right-click context menu
  const [contextMenu, setContextMenu] = useState<{ file: FileItem | null; x: number; y: number } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, file: FileItem | null) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ file, x: e.clientX, y: e.clientY });
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles && droppedFiles.length > 0) {
      onUploadFiles(droppedFiles);
    }
  };

  const cycleFolderColor = (file: FileItem) => {
    if (!onUpdateMetadata) return;
    const colors = ['blue', 'orange', 'green', 'purple', 'red'];
    const currentIdx = colors.indexOf(file.folderColor || 'blue');
    const nextColor = colors[(currentIdx + 1) % colors.length];
    onUpdateMetadata(file.id, { folderColor: nextColor });
  };

  const toggleTag = (file: FileItem) => {
    if (!onUpdateMetadata) return;
    const currentTags = file.tags || [];
    let newTags = [...currentTags];
    
    if (currentTags.includes('Important')) {
      newTags = newTags.filter((t) => t !== 'Important');
    } else {
      newTags.push('Important');
    }
    onUpdateMetadata(file.id, { tags: newTags });
  };

  const toggleFavorite = (file: FileItem) => {
    if (!onUpdateMetadata || file.type !== 'folder') return;
    onUpdateMetadata(file.id, { 
      isFavorite: !file.isFavorite,
      name: file.name
    });
  };

  // Custom folder rendering with gradients representing the Nextcloud mock styling
  const renderFolderIcon = (color?: string, size: 'sm' | 'md' | 'lg' = 'md') => {
    const dimensions = size === 'sm' ? 'w-8 h-8' : size === 'lg' ? 'w-24 h-24' : 'w-16 h-16';
    if (color === 'orange') {
      return (
        <div className={`relative ${dimensions} flex items-center justify-center filter drop-shadow-md`}>
          <svg viewBox="0 0 64 64" className="w-full h-full text-amber-500 fill-current">
            <path d="M54,16H32.414l-4.707-4.707C27.012,10.598,26.023,10,25,10H10C6.686,10,4,12.686,4,16v32c0,3.314,2.686,6,6,6h44 c3.314,0,6-2.686,6-6V22C60,18.686,57.314,16,54,16z" />
            <path d="M54,19H10c-1.657,0-3,1.343-3,3v26c0,1.657,1.343,3,3,3h44c1.657,0,3-1.343,3-3V22C57,20.343,55.657,19,54,19z" className="text-amber-400 fill-current" />
            <circle cx="26" cy="34" r="2.5" className="text-amber-800/60 fill-current" />
            <circle cx="38" cy="34" r="2.5" className="text-amber-800/60 fill-current" />
            <path d="M28 40 Q32 44 36 40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" fill="none" className="text-amber-800/60" />
          </svg>
        </div>
      );
    }
    return (
      <div className={`relative ${dimensions} flex items-center justify-center filter drop-shadow-md`}>
        <svg viewBox="0 0 64 64" className="w-full h-full text-sky-400 fill-current">
          <path d="M54,16H32.414l-4.707-4.707C27.012,10.598,26.023,10,25,10H10C6.686,10,4,12.686,4,16v32c0,3.314,2.686,6,6,6h44 c3.314,0,6-2.686,6-6V22C60,18.686,57.314,16,54,16z" />
          <path d="M54,19H10c-1.657,0-3,1.343-3,3v26c0,1.657,1.343,3,3,3h44c1.657,0,3-1.343,3-3V22C57,20.343,55.657,19,54,19z" className="text-sky-300 fill-current" />
          <line x1="12" y1="26" x2="52" y2="26" stroke="#0ea5e9" strokeOpacity="0.4" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    );
  };

  // Dynamic file type representation
  const renderFileIcon = (file: FileItem, size: 'sm' | 'md' | 'lg' = 'md') => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const boxClass = size === 'sm' ? 'w-7 h-8 p-0.5 border' : size === 'lg' ? 'w-20 h-24 p-2 border-2' : 'w-14 h-16 p-1 border-2';
    
    let Icon = FileText;
    let color = 'text-neutral-400';
    let label = ext.substring(0, 3).toUpperCase() || 'DOC';

    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) { Icon = Video; color = 'text-purple-500'; label = 'VID'; }
    else if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) { Icon = Archive; color = 'text-amber-600'; label = 'ZIP'; }
    else if (['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'html', 'css', 'json', 'sh'].includes(ext)) { Icon = Code; color = 'text-emerald-500'; label = 'DEV'; }
    else if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) { Icon = Music; color = 'text-pink-500'; label = 'AUD'; }
    else if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) { Icon = ImageIcon; color = 'text-blue-500'; label = 'IMG'; }

    return (
      <div className={`relative ${boxClass} bg-white border-neutral-300 rounded-lg shadow-sm overflow-hidden flex flex-col justify-center items-center hover:border-neutral-400 transition-colors`}>
        <Icon className={`${color} ${size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-10 h-10 mb-2' : 'w-6 h-6 mb-1'}`} />
        <div className={`absolute bottom-0 w-full text-center bg-neutral-100 border-t border-neutral-200 text-[6px] font-bold text-neutral-500 tracking-widest py-0.5 ${size === 'sm' ? 'hidden' : ''}`}>
          {label}
        </div>
        <div className="absolute top-0 right-0 w-3 h-3 bg-neutral-200 border-l border-b border-neutral-300 rounded-bl-md" />
      </div>
    );
  };

  if (files.length === 0) {
    return (
      <div className="flex-1 bg-white p-8 flex flex-col items-center justify-center text-neutral-400 space-y-3 min-h-[400px]"
           onContextMenu={(e) => handleContextMenu(e, null)}>
        <AlertCircle size={40} className="text-neutral-300" />
        <div className="text-center">
          <p className="text-sm font-semibold">No files match filters</p>
          <p className="text-xs text-neutral-400">Add some via the toolbar or drag them in!</p>
        </div>
      </div>
    );
  }

  // Active highlighted file details helper
  const activeFile = files.find(f => f.id === selectedFileId) || files[0];

  // RENDER GRID VIEW (Exactly matching image_cd440d.jpg)
  const renderGrid = () => {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-5 gap-y-7">
        {files.map((file) => {
          const isSelected = selectedFileId === file.id;
          const isNotesFolder = file.name === 'Notes';

          return (
            <div
              key={file.id}
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFileId(file.id);
              }}
              onDoubleClick={() => onFileDoubleClick(file)}
              onContextMenu={(e) => handleContextMenu(e, file)}
              className={`group relative flex flex-col items-center text-center cursor-pointer select-none px-2 py-3 rounded-2xl transition-all duration-200 border ${
                isSelected 
                  ? 'bg-blue-500/10 border-blue-500/15 shadow-[0_4px_12px_rgba(59,130,246,0.06)]' 
                  : 'border-transparent hover:bg-neutral-50/80 hover:border-neutral-200/40'
              }`}
            >
              <button
                onClick={(e) => handleContextMenu(e, file)}
                className="absolute top-1.5 right-1.5 p-1 rounded-full text-neutral-400 hover:bg-black/5 hover:text-neutral-700 opacity-0 group-hover:opacity-100 transition-all z-10 focus:outline-none"
                title="More Actions"
              >
                <MoreVertical size={14} />
              </button>
              <div className={`relative mb-2 flex items-center justify-center transition-transform group-hover:scale-[1.03] ${
                isSelected ? 'scale-[1.02]' : ''
              }`}>
                
                {file.type === 'image' && file.thumbnailUrl ? (
                  <div className={`w-[110px] h-[75px] rounded-lg overflow-hidden border bg-neutral-50 flex items-center justify-center shadow-sm ${
                    isSelected ? 'border-blue-500 shadow-md ring-2 ring-blue-400/25' : 'border-neutral-300/80'
                  }`}>
                    <img 
                      src={file.thumbnailUrl} 
                      alt={file.name}
                      className="w-full h-full object-cover pointer-events-none"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                ) : file.type === 'folder' ? (
                  renderFolderIcon(file.folderColor)
                ) : (
                  renderFileIcon(file)
                )}

                {/* Sub-items count badge */}
                {file.type === 'folder' && (
                  <span className="absolute -top-1.5 -right-1 text-[8px] bg-sky-100 text-sky-800 font-bold px-1.5 py-0.5 rounded-full border border-sky-200 scale-90 opacity-0 group-hover:opacity-100 transition-opacity">
                    {file.size}
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
              </div>

              {/* Title wrapper */}
              <div className="w-full px-1">
                <p 
                  className={`text-[11px] font-bold truncate max-w-full tracking-normal transition-colors ${
                    isSelected ? 'text-blue-600' : 'text-neutral-700'
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
      <div className="w-full border border-neutral-200/60 rounded-xl overflow-hidden bg-white shadow-sm">
        <table className="w-full text-left text-xs text-neutral-600">
          <thead className="bg-neutral-50/70 border-b border-neutral-200/60 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
            <tr>
              <th className="py-2.5 px-4 w-1/2">Name</th>
              <th className="py-2.5 px-3">Kind</th>
              <th className="py-2.5 px-3">Size</th>
              <th className="py-2.5 px-3">Last Modified</th>
              <th className="py-2.5 px-3">Tags</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {files.map((file) => {
              const isSelected = selectedFileId === file.id;
              return (
                <tr
                  key={file.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFileId(file.id);
                  }}
                  onDoubleClick={() => onFileDoubleClick(file)}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  className={`group hover:bg-neutral-50 transition-colors cursor-pointer ${
                    isSelected ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <td className="py-2.5 px-4 flex items-center space-x-2.5 font-medium text-neutral-800">
                    {file.type === 'folder' ? (
                      renderFolderIcon(file.folderColor, 'sm')
                    ) : file.type === 'image' ? (
                      <ImageIcon size={16} className="text-indigo-500" />
                    ) : (
                      <FileText size={16} className="text-neutral-500" />
                    )}
                    <span className="truncate max-w-[200px] sm:max-w-xs">{file.name}</span>
                    {file.name === 'Notes' && (
                      <span className="w-1.5 h-1.5 bg-orange-500 rounded-full inline-block animate-pulse" />
                    )}
                  </td>
                  <td className="py-2.5 px-3 capitalize text-neutral-500">{file.type}</td>
                  <td className="py-2.5 px-3 text-neutral-500 font-mono text-[11px]">{file.size}</td>
                  <td className="py-2.5 px-3 text-neutral-500">{file.updatedAt || 'Recent'}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex space-x-1.5">
                      {file.tags?.map(t => {
                        const bgMap: Record<string, string> = { Red: 'bg-red-100 text-red-600', Orange: 'bg-orange-100 text-orange-600', Yellow: 'bg-yellow-100 text-yellow-600', Green: 'bg-green-100 text-green-600', Blue: 'bg-blue-100 text-blue-600', Purple: 'bg-purple-100 text-purple-600', Gray: 'bg-gray-100 text-gray-600' };
                        return (
                          <span key={t} className={`text-[9px] px-1.5 py-0.5 rounded font-bold border border-neutral-200/40 ${bgMap[t] || 'bg-neutral-100 text-neutral-600'}`}>
                            {t}
                          </span>
                        );
                      }) || <span className="text-neutral-300">-</span>}
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <div className="flex items-center justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => handleContextMenu(e, file)}
                        className="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/50 rounded focus:outline-none transition-colors"
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
      <div className="flex border border-neutral-200/60 rounded-xl overflow-hidden bg-white shadow-sm h-[380px]">
        
        {/* Column 1: Subdirectories list */}
        <div className="w-1/3 border-r border-neutral-200/50 bg-neutral-50/50 p-2.5 overflow-y-auto space-y-1">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 mb-2">Directories</p>
          <button className={`w-full text-left px-2 py-1.5 text-xs rounded-lg flex items-center justify-between font-semibold ${
            currentPath.length === 1 ? 'bg-neutral-200 text-gray-900' : 'text-gray-600 hover:bg-neutral-100'
          }`}>
            <span className="flex items-center space-x-1.5">
              <Folder size={14} className="text-sky-400" />
              <span>Nextcloud (Root)</span>
            </span>
            <ChevronRight size={12} className="text-gray-400" />
          </button>
          
          {/* Active nodes */}
          {files.filter(f => f.type === 'folder').map(fol => (
            <button 
              key={fol.id}
              onClick={() => onFileDoubleClick(fol)}
              className="w-full text-left px-2 py-1.5 text-xs rounded-lg flex items-center justify-between text-gray-600 hover:bg-neutral-100 truncate"
            >
              <span className="flex items-center space-x-1.5">
                <Folder size={14} className={fol.folderColor === 'orange' ? 'text-amber-500' : 'text-sky-400'} />
                <span>{fol.name}</span>
              </span>
              <ChevronRight size={12} className="text-gray-400" />
            </button>
          ))}
        </div>

        {/* Column 2: Files listed inside active folder */}
        <div className="w-1/3 border-r border-neutral-200/50 p-2.5 overflow-y-auto space-y-1">
          <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 mb-2">Files List</p>
          {files.map((file) => {
            const isSelected = selectedFileId === file.id;
            return (
              <button
                key={file.id}
                onClick={() => setSelectedFileId(file.id)}
                onDoubleClick={() => onFileDoubleClick(file)}
                onContextMenu={(e) => handleContextMenu(e, file)}
                className={`w-full text-left px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between font-medium transition-colors ${
                  isSelected ? 'bg-blue-600 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                <span className="flex items-center space-x-1.5 truncate">
                  {file.type === 'folder' ? (
                    <Folder size={13} className={isSelected ? 'text-white' : file.folderColor === 'orange' ? 'text-amber-500' : 'text-sky-400'} />
                  ) : file.type === 'image' ? (
                    <ImageIcon size={13} className={isSelected ? 'text-white' : 'text-indigo-500'} />
                  ) : (
                    <FileText size={13} className={isSelected ? 'text-white' : 'text-neutral-500'} />
                  )}
                  <span className="truncate">{file.name}</span>
                </span>
                {file.type === 'folder' && <ChevronRight size={11} className={isSelected ? 'text-blue-200' : 'text-gray-400'} />}
              </button>
            );
          })}
        </div>

        {/* Column 3: Live Rich Interactive Preview of active selection */}
        <div className="w-1/3 bg-neutral-50/30 p-4 flex flex-col justify-between items-center text-center overflow-y-auto">
          <div className="w-full flex flex-col items-center space-y-3">
            <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider w-full text-left border-b border-neutral-200/55 pb-1">Quick Preview</p>
            
            {activeFile.type === 'image' && activeFile.thumbnailUrl ? (
              <div className="w-40 h-28 rounded-lg overflow-hidden border border-neutral-300 shadow-inner bg-white flex items-center justify-center p-1">
                <img src={activeFile.thumbnailUrl} className="w-full h-full object-cover rounded" alt="Preview"/>
              </div>
            ) : activeFile.type === 'folder' ? (
              renderFolderIcon(activeFile.folderColor, 'lg')
            ) : (
              renderFileIcon(activeFile, 'lg')
            )}

            <div className="space-y-1">
              <h4 className="text-xs font-bold text-neutral-800 break-all">{activeFile.name}</h4>
              <p className="text-[10px] text-neutral-400 capitalize">{activeFile.type}</p>
            </div>

            <div className="w-full bg-white border border-neutral-200/60 rounded-lg p-2.5 text-left text-[10px] space-y-1 text-neutral-500 font-mono shadow-sm">
              <p><span className="text-neutral-400 font-sans font-semibold">Size:</span> {activeFile.size}</p>
              <p><span className="text-neutral-400 font-sans font-semibold">Updated:</span> {activeFile.updatedAt}</p>
              {activeFile.tags && activeFile.tags.length > 0 && (
                <p className="flex items-center space-x-1 font-sans">
                  <span className="text-neutral-400 font-semibold font-sans">Tags:</span>
                  <span className="bg-neutral-100 text-neutral-600 px-1.5 rounded text-[8px] font-semibold">{activeFile.tags[0]}</span>
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
    // Only display images / documents in gallery mode
    const galleryItems = files.filter(f => f.type === 'image' || f.type === 'document');
    if (galleryItems.length === 0) {
      return (
        <div className="text-center p-12 text-sm text-neutral-500 bg-neutral-50 border border-dashed rounded-xl" onContextMenu={(e) => handleContextMenu(e, null)}>
          Gallery mode supports images and document icons. Click view settings or choose root.
        </div>
      );
    }
    
    // Bounds checking
    const safeIndex = galleryIndex >= galleryItems.length ? 0 : galleryIndex;
    const currentItem = galleryItems[safeIndex];

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
            {currentItem.type === 'image' && currentItem.thumbnailUrl ? (
              <img 
                src={currentItem.thumbnailUrl} 
                className="max-h-full max-w-full object-contain rounded-lg shadow-md transition-all group-hover:scale-105 duration-300" 
                alt={currentItem.name} 
              />
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
          {galleryItems.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => setGalleryIndex(idx)}
              className={`w-12 h-9 rounded overflow-hidden border transition-all flex-shrink-0 ${
                idx === safeIndex ? 'border-blue-500 scale-105 ring-2 ring-blue-500/20' : 'border-zinc-700 opacity-60 hover:opacity-100'
              }`}
            >
              {item.type === 'image' && item.thumbnailUrl ? (
                <img src={item.thumbnailUrl} className="w-full h-full object-cover" alt="thumb" />
              ) : (
                <div className="bg-zinc-800 w-full h-full flex items-center justify-center text-zinc-400">
                  <FileText size={12} />
                </div>
              )}
            </button>
          ))}
        </div>

      </div>
    );
  };

  return (
    <div 
      className="flex-1 bg-transparent p-4 md:p-5 overflow-y-auto relative outline-none select-none"
      onContextMenu={(e) => handleContextMenu(e, null)}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={() => setContextMenu(null)}
    >
      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          file={contextMenu.file}
          x={contextMenu.x}
          y={contextMenu.y}
          clipboardState={clipboardState}
          onClose={() => setContextMenu(null)}
          onQuickLook={contextMenu.file ? (f) => onFileDoubleClick(f) : undefined}
          onRename={contextMenu.file ? (f) => {
            const newName = prompt('Enter new name:', f.name);
            if (newName && newName.trim() !== f.name) onRenameFile(f.id, newName.trim());
          } : undefined}
          onFavorite={contextMenu.file ? (f) => onUpdateMetadata?.(f.id, { isFavorite: !f.isFavorite, name: f.name }) : undefined}
          onDelete={contextMenu.file ? (fId) => onDeleteFile(fId) : undefined}
          onCreateFile={() => {
            const name = prompt('Enter file name (e.g. Note.txt):');
            if (name && name.trim()) onAddNewFile?.(name.trim(), 'text');
          }}
          onCreateFolder={() => {
            const name = prompt('Enter folder name:');
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
            if (clipboardState && clipboardState.action === 'cut') {
              alert(`Pasted ${clipboardState.file.name} (Simulation)`);
              setClipboard?.(null);
            } else if (clipboardState) {
              alert(`Copied ${clipboardState.file.name} (Simulation)`);
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



    </div>
  );
}
