import React, { useState, useEffect } from 'react';
import { 
  X, 
  Download, 
  Trash2, 
  Calendar, 
  FileText, 
  Clock, 
  Check, 
  Tag, 
  Edit3, 
  Eye,
  Settings,
  Flame,
  FileCode
} from 'lucide-react';
import { FileItem } from '../types';

interface QuickLookModalProps {
  file: FileItem;
  onClose: () => void;
  onUpdateFile: (file: FileItem) => void;
  onDelete: (id: string) => void;
}

export default function QuickLookModal({
  file,
  onClose,
  onUpdateFile,
  onDelete
}: QuickLookModalProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(file.name);
  const [textContent, setTextContent] = useState(file.content || '');
  const [isSaved, setIsSaved] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>(file.tags?.[0] || '');
  const [isLoadingContent, setIsLoadingContent] = useState(file.type === 'text');

  const fileUrl = `/api/files?path=${encodeURIComponent(file.id)}&raw=true`;

  useEffect(() => {
    if (file.type === 'text') {
      fetch(fileUrl)
        .then(res => res.text())
        .then(text => {
          setTextContent(text);
          setIsLoadingContent(false);
        })
        .catch(err => {
          console.error(err);
          setTextContent('Failed to load file content.');
          setIsLoadingContent(false);
        });
    }
  }, [file.id, file.type]);

  const handleSaveName = () => {
    if (editedName.trim()) {
      onUpdateFile({
        ...file,
        name: editedName.trim(),
      });
      setIsEditingName(false);
    }
  };

  const handleSaveContent = () => {
    onUpdateFile({
      ...file,
      content: textContent,
      tags: selectedTag ? [selectedTag] : []
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // Mock download prompt helper
  const handleDownload = () => {
    const defaultData = file.content || `Mock binaries for file: ${file.name}`;
    const enc = new Blob([defaultData], { type: 'text/plain' });
    const url = URL.createObjectURL(enc);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-neutral-950/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
      
      {/* Container window */}
      <div className="bg-[#1e1e1e] text-[#f5f5f7] rounded-2xl w-full max-w-2xl border border-neutral-800 shadow-[0_24px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between max-h-[85vh]">
        
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#2a2a2a]/60 border-b border-zinc-800">
          <div className="flex items-center space-x-2">
            <span className="text-[11px] font-mono font-semibold text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded">
              File Viewer
            </span>
          </div>

          {/* Header Title with quick rename */}
          <div className="flex items-center space-x-2 flex-grow justify-center max-w-[280px]">
            {isEditingName ? (
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
                <button 
                  onClick={handleSaveName}
                  className="p-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] cursor-pointer"
                >
                  <Check size={11} />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1">
                <h3 className="text-xs font-bold truncate max-w-[220px]" title={file.name}>
                  {file.name}
                </h3>
                <button 
                  onClick={() => setIsEditingName(true)}
                  className="p-1 text-neutral-400 hover:text-white cursor-pointer"
                  title="Rename"
                >
                  <Edit3 size={11} />
                </button>
              </div>
            )}
          </div>

          <button 
            onClick={onClose}
            className="p-1 text-neutral-400 hover:text-white rounded-md bg-[#2d2d2d] hover:bg-[#3d3d3d] transition-colors cursor-pointer"
            title="Esc"
          >
            <X size={15} />
          </button>
        </div>

        {/* Core Live Preview Block */}
        <div className="flex-1 overflow-y-auto p-5 md:p-6 flex flex-col items-center">
          
          {file.type === 'image' ? (
            /* Image Preview */
            <div className="w-full relative flex justify-center items-center rounded-xl bg-[#121212] p-1 border border-zinc-800 shadow-inner overflow-hidden min-h-[200px] max-h-[450px]">
              <img
                src={fileUrl}
                alt={file.name}
                className="max-h-[440px] max-w-full object-contain rounded-lg"
              />
            </div>
          ) : file.type === 'video' ? (
            /* Video Preview */
            <div className="w-full relative flex justify-center items-center rounded-xl bg-[#121212] p-1 border border-zinc-800 shadow-inner overflow-hidden min-h-[200px] max-h-[450px]">
              <video
                src={fileUrl}
                controls
                autoPlay
                className="max-h-[440px] max-w-full object-contain rounded-lg"
              />
            </div>
          ) : (
            /* Document Editor or Text Log */
            <div className="w-full flex flex-col space-y-4">
              {/* Text note field details */}
              <div className="flex flex-col space-y-1">
                <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider block">
                  File Content
                </label>
                {isLoadingContent ? (
                  <div className="w-full h-64 bg-[#121212] border border-neutral-800 rounded-xl p-3 flex items-center justify-center text-xs text-neutral-500">
                    Loading file content...
                  </div>
                ) : (
                  <textarea
                    value={textContent}
                    onChange={(e) => setTextContent(e.target.value)}
                    className="w-full h-64 bg-[#121212] border border-neutral-800 rounded-xl p-3 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 text-neutral-300 resize-none"
                    placeholder="Empty file..."
                    disabled={file.type !== 'text'}
                  />
                )}
              </div>

              {/* Tag Assignment Dropdown */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-neutral-400 font-bold uppercase tracking-wider">Assign Tag:</span>
                  <select
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="bg-neutral-800 border border-neutral-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    <option value="">No Tag</option>
                    <option value="Screenshots">Screenshots</option>
                    <option value="Writing">Writing</option>
                    <option value="Invoice">Invoice</option>
                    <option value="Important">Important</option>
                  </select>
                </div>

                <button
                  onClick={handleSaveContent}
                  disabled={file.type !== 'text' || isLoadingContent}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-neutral-700 text-white font-semibold text-xs px-4 py-1.5 rounded-lg shadow transition-all flex items-center space-x-1.5 cursor-pointer"
                >
                  <Check size={13} />
                  <span>{isSaved ? 'Saved!' : 'Save Content'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick Stats Panel */}
          <div className="grid grid-cols-3 gap-2.5 w-full mt-6 text-xs text-neutral-400">
            <div className="bg-neutral-900 border border-neutral-800/60 rounded-xl p-2.5 flex items-center space-x-2">
              <Calendar size={14} className="text-blue-400" />
              <div>
                <p className="text-[9px] text-neutral-500 uppercase font-semibold">Date Created</p>
                <p className="text-[10px] font-medium">{file.updatedAt || '2026-06-08'}</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800/60 rounded-xl p-2.5 flex items-center space-x-2">
              <Clock size={14} className="text-purple-400" />
              <div>
                <p className="text-[9px] text-neutral-500 uppercase font-semibold">Capacity Size</p>
                <p className="text-[10px] font-medium font-mono">{file.size}</p>
              </div>
            </div>

            <div className="bg-neutral-900 border border-neutral-800/60 rounded-xl p-2.5 flex items-center space-x-2">
              <Flame size={14} className="text-amber-500 animate-pulse" />
              <div>
                <p className="text-[9px] text-neutral-500 uppercase font-semibold">Permitted Sync</p>
                <p className="text-[10px] font-medium text-emerald-400 font-semibold">Writeable</p>
              </div>
            </div>
          </div>

        </div>

        {/* Footer actions for the previewer */}
        <div className="px-5 py-3.5 bg-[#252525]/60 border-t border-zinc-800 flex justify-between items-center">
          <button
            onClick={() => {
              if (confirm(`Confirm permanent deletion of ${file.name}?`)) {
                onDelete(file.id);
                onClose();
              }
            }}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer"
          >
            <Trash2 size={13} />
            <span>Delete File</span>
          </button>

          <div className="flex space-x-2">
            <button
              onClick={onClose}
              className="text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
            >
              Close
            </button>
            <a
              href={fileUrl}
              download={file.name}
              target="_blank"
              rel="noreferrer"
              className="bg-white/10 hover:bg-white/15 text-white active:scale-95 px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all cursor-pointer border border-white/10"
              title="Download file"
            >
              <Download size={13} />
              <span>Download</span>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
