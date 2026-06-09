import React, { useState, useEffect, Suspense, lazy, useRef } from 'react';
import {
  X,
  Download,
  Trash2,
  Calendar,
  Clock,
  Check,
  Tag,
  Edit3,
  Flame,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Rewind,
  FastForward,
  Maximize2
} from 'lucide-react';
import { FileItem } from '../types';

// Monaco loaded lazily to avoid SSR issues in Next.js
const MonacoEditor: any = lazy(() => import('@monaco-editor/react').catch(() => ({ default: () => <div>Editor not available</div> } as any)));

interface QuickLookModalProps {
  file: FileItem;
  onClose: () => void;
  onUpdateFile: (file: FileItem) => void;
  onDelete: (id: string) => void;
}

/** Map file extensions to Monaco language identifiers */
function resolveLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    json: 'json',
    md: 'markdown', markdown: 'markdown',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss',
    yml: 'yaml', yaml: 'yaml',
    sh: 'shell', bash: 'shell',
    py: 'python',
    go: 'go',
    rs: 'rust',
    dockerfile: 'dockerfile',
    xml: 'xml',
    sql: 'sql',
    txt: 'plaintext',
    log: 'plaintext',
    csv: 'plaintext',
    conf: 'ini', ini: 'ini',
  };
  return map[ext] || 'plaintext';
}

const TAGS = ['No Tag', 'Screenshots', 'Writing', 'Invoice', 'Important'];

export default function QuickLookModal({ file, onClose, onUpdateFile, onDelete }: QuickLookModalProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(file.name);
  const [textContent, setTextContent] = useState(file.content || '');
  const [isSaved, setIsSaved] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>(file.tags?.[0] || '');
  const [isLoadingContent, setIsLoadingContent] = useState(file.type === 'text');
  const [monacoAvailable, setMonacoAvailable] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handleZoomIn = () => setZoom(z => Math.min(z + 0.25, 4));
  const handleZoomOut = () => setZoom(z => Math.max(z - 0.25, 0.25));
  const handleRotate = () => setRotation(r => r + 90);
  const handleRewind = () => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); };
  const handleFastForward = () => { if (videoRef.current) videoRef.current.currentTime += 10; };
  const handleReset = () => { setZoom(1); setRotation(0); };

  const fileUrl = `/api/files?path=${encodeURIComponent(file.id)}&raw=true`;
  const language = resolveLanguage(file.name);

  // Try to detect if Monaco loaded
  useEffect(() => {
    import('@monaco-editor/react').then(() => setMonacoAvailable(true)).catch(() => setMonacoAvailable(false));
  }, []);

  useEffect(() => {
    if (file.type === 'text') {
      fetch(fileUrl)
        .then(res => res.text())
        .then(text => { setTextContent(text); setIsLoadingContent(false); })
        .catch(() => { setTextContent('Failed to load file content.'); setIsLoadingContent(false); });
    }
  }, [file.id, file.type]);

  const handleSaveName = () => {
    if (editedName.trim()) {
      onUpdateFile({ ...file, name: editedName.trim() });
      setIsEditingName(false);
    }
  };

  const handleSaveContent = () => {
    onUpdateFile({ ...file, content: textContent, tags: selectedTag && selectedTag !== 'No Tag' ? [selectedTag] : [] });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 overflow-hidden p-6"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Main container */}
      <div className="bg-[#1c1c1e]/80 backdrop-blur-3xl text-slate-100 w-full max-w-5xl h-[85vh] rounded-[24px] shadow-[0_32px_64px_rgba(0,0,0,0.5)] border border-white/10 flex flex-col overflow-hidden transform transition-all">

        {/* ── Title Bar ── */}
        <div className="flex items-center justify-between px-4 py-3 bg-white/5 border-b border-white/10">
          <div className="flex items-center space-x-2 w-1/4">
            {/* macOS traffic lights */}
            <div className="flex space-x-2">
              <button onClick={onClose} className="w-3.5 h-3.5 rounded-full bg-red-500 hover:bg-red-600 shadow-inner flex items-center justify-center group transition-colors">
                <X size={8} className="opacity-0 group-hover:opacity-100 text-red-900" />
              </button>
              <button className="w-3.5 h-3.5 rounded-full bg-amber-500 hover:bg-amber-600 shadow-inner transition-colors"></button>
              <button className="w-3.5 h-3.5 rounded-full bg-green-500 hover:bg-green-600 shadow-inner transition-colors"></button>
            </div>
          </div>

          {/* Editable title */}
          <div className="flex items-center space-x-2 flex-grow justify-center w-2/4">
            {isEditingName ? (
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                  className="bg-black/30 border border-blue-500/50 rounded px-3 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
                <button onClick={handleSaveName} className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] transition-colors">
                  <Check size={12} />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5 cursor-pointer group" onClick={() => setIsEditingName(true)}>
                <h3 className="text-sm font-semibold text-slate-200 truncate max-w-[300px]" title={file.name}>{file.name}</h3>
                <Edit3 size={11} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end w-1/4">
            <span className="text-[10px] font-mono font-semibold text-white/50 bg-white/5 px-2 py-0.5 rounded border border-white/10">
              {language.toUpperCase()}
            </span>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-hidden p-6 flex flex-col space-y-4 relative">

          {/* Media Toolbar */}
          {(file.type === 'image' || file.type === 'video') && (
            <div className="flex items-center justify-center space-x-2 bg-black/40 backdrop-blur-md rounded-xl p-2 border border-white/10 w-max mx-auto mb-2 shadow-lg z-10">
              <button onClick={handleZoomOut} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Zoom Out">
                <ZoomOut size={16} />
              </button>
              <span className="text-xs text-slate-300 font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={handleZoomIn} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Zoom In">
                <ZoomIn size={16} />
              </button>
              
              <div className="w-px h-4 bg-white/10 mx-2" />
              
              {file.type === 'image' && (
                <button onClick={handleRotate} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Rotate">
                  <RotateCw size={16} />
                </button>
              )}

              {file.type === 'video' && (
                <>
                  <button onClick={handleRewind} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Backward 10s">
                    <Rewind size={16} />
                  </button>
                  <button onClick={handleFastForward} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Forward 10s">
                    <FastForward size={16} />
                  </button>
                </>
              )}
              
              <button onClick={handleReset} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors" title="Reset">
                <Maximize2 size={16} />
              </button>
            </div>
          )}

          {/* Image Preview */}
          {file.type === 'image' && (
            <div className="w-full flex-1 flex justify-center items-center rounded-xl bg-black/20 border border-white/5 overflow-hidden p-2 relative">
              <img 
                src={fileUrl} 
                alt={file.name} 
                className="max-h-full max-w-full object-contain rounded-lg transition-transform duration-200" 
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
              />
            </div>
          )}

          {/* Video Preview */}
          {file.type === 'video' && (
            <div className="w-full flex-1 flex justify-center items-center rounded-xl bg-black/20 border border-white/5 overflow-hidden p-2 relative">
              <video 
                ref={videoRef}
                src={fileUrl} 
                controls 
                autoPlay 
                className="max-h-full max-w-full object-contain rounded-lg transition-transform duration-200" 
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
              />
            </div>
          )}

          {/* Text / Code Editor */}
          {(file.type === 'text' || file.type === 'document') && (
            <div className="flex flex-col space-y-3 w-full">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {monacoAvailable ? `Monaco Editor · ${language}` : 'File Content'}
              </label>

              {isLoadingContent ? (
                <div className="w-full h-64 bg-black/30 border border-white/5 rounded-xl flex items-center justify-center text-xs text-slate-600 animate-pulse">
                  Loading…
                </div>
              ) : monacoAvailable ? (
                <Suspense fallback={
                  <div className="w-full h-64 bg-black/30 border border-white/5 rounded-xl flex items-center justify-center text-xs text-slate-600">
                    Loading Monaco…
                  </div>
                }>
                  <div className="w-full h-72 rounded-xl overflow-hidden border border-white/8">
                    <MonacoEditor
                      height="100%"
                      language={language}
                      value={textContent}
                      onChange={(val) => setTextContent(val ?? '')}
                      theme="vs-dark"
                      options={{
                        fontSize: 12,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        readOnly: file.type !== 'text',
                        padding: { top: 12, bottom: 12 },
                        scrollbar: { verticalScrollbarSize: 4 },
                        renderLineHighlight: 'gutter',
                        smoothScrolling: true,
                      }}
                    />
                  </div>
                </Suspense>
              ) : (
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="w-full h-64 bg-black/30 border border-white/8 rounded-xl p-3 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-300 resize-none placeholder-slate-600"
                  placeholder="Empty file…"
                  disabled={file.type !== 'text'}
                />
              )}

              {/* Save row */}
              <div className="flex items-center justify-end">
                <button
                  onClick={handleSaveContent}
                  disabled={file.type !== 'text' || isLoadingContent}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-xs px-6 py-2 rounded-lg shadow transition-all flex items-center space-x-1.5"
                >
                  <Check size={14} />
                  <span>{isSaved ? '✓ Saved!' : 'Save Document'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2 text-xs text-slate-400">
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-2.5 flex items-center space-x-2">
              <Calendar size={13} className="text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-[9px] text-slate-600 uppercase font-semibold">Modified</p>
                <p className="text-[10px] font-medium">{file.updatedAt || '—'}</p>
              </div>
            </div>
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-2.5 flex items-center space-x-2">
              <Clock size={13} className="text-purple-400 flex-shrink-0" />
              <div>
                <p className="text-[9px] text-slate-600 uppercase font-semibold">Size</p>
                <p className="text-[10px] font-mono font-medium">{file.size}</p>
              </div>
            </div>
            <div className="bg-slate-900/60 border border-white/5 rounded-xl p-2.5 flex items-center space-x-2">
              <Flame size={13} className="text-amber-400 animate-pulse flex-shrink-0" />
              <div>
                <p className="text-[9px] text-slate-600 uppercase font-semibold">Access</p>
                <p className="text-[10px] font-medium text-emerald-400">Writeable</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-4 bg-white/5 border-t border-white/10 flex items-center justify-between mt-auto">
          <button
            onClick={() => { if (confirm(`Delete "${file.name}"?`)) { onDelete(file.id); onClose(); } }}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all"
          >
            <Trash2 size={12} />
            <span>Delete</span>
          </button>
          <div className="flex items-center space-x-2">
            <button onClick={onClose} className="text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
              Close
            </button>
            <a
              href={fileUrl}
              download={file.name}
              target="_blank"
              rel="noreferrer"
              className="bg-white/10 hover:bg-white/20 border border-white/10 text-slate-100 px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-sm"
            >
              <Download size={12} />
              <span>Download</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
