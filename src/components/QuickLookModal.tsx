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
      className="fixed inset-0 bg-[#0f172a]/95 backdrop-blur-2xl flex items-center justify-center z-[100] overflow-hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Main container */}
      <div className="w-full h-full flex flex-col text-slate-100 bg-transparent">

        {/* ── Title Bar ── */}
        <div className="flex items-center justify-between px-6 py-4 z-10">
          <div className="flex items-center space-x-3 w-1/3">
             <button onClick={onClose} className="p-2.5 text-slate-400 hover:text-white bg-slate-800/40 hover:bg-slate-700/60 rounded-full transition-all backdrop-blur-md border border-white/5 shadow-sm">
                <X size={18} />
             </button>
             <span className="text-[10px] font-mono font-bold tracking-wider text-slate-400 bg-slate-800/40 px-3 py-1.5 rounded-full border border-white/5 backdrop-blur-md shadow-sm">
                {language.toUpperCase()}
             </span>
          </div>

          {/* Editable title */}
          <div className="flex items-center space-x-2 justify-center w-1/3">
            {isEditingName ? (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                  className="bg-slate-900/50 border border-blue-500/50 rounded-lg px-3 py-1 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 backdrop-blur-md w-64 text-center"
                  autoFocus
                />
                <button onClick={handleSaveName} className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
                  <Check size={14} />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-2 cursor-pointer group" onClick={() => setIsEditingName(true)}>
                <h3 className="text-sm font-semibold text-white truncate max-w-[400px] drop-shadow-md">{file.name}</h3>
                <Edit3 size={12} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </div>

          <div className="flex items-center justify-end space-x-3 w-1/3">
            <button
              onClick={() => { if (confirm(`Delete "${file.name}"?`)) { onDelete(file.id); onClose(); } }}
              className="text-red-400 hover:text-white hover:bg-red-500 p-2.5 rounded-full transition-all bg-slate-800/40 border border-white/5 backdrop-blur-md shadow-sm"
              title="Delete"
            >
              <Trash2 size={16} />
            </button>
            <a
              href={fileUrl}
              download={file.name}
              className="text-white bg-blue-600/90 hover:bg-blue-500 p-2.5 rounded-full transition-all border border-blue-400/20 shadow-[0_0_15px_rgba(37,99,235,0.3)] backdrop-blur-md"
              title="Download"
            >
              <Download size={16} />
            </a>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-hidden relative flex flex-col p-6">

          {/* Image Preview */}
          {file.type === 'image' && (
            <div className="absolute inset-0 flex justify-center items-center p-12 overflow-hidden pointer-events-none">
              <img 
                src={fileUrl} 
                alt={file.name} 
                className="max-h-full max-w-full object-contain drop-shadow-2xl transition-transform duration-300 ease-out pointer-events-auto" 
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
              />
            </div>
          )}

          {/* Video Preview */}
          {file.type === 'video' && (
            <div className="absolute inset-0 flex justify-center items-center p-12 overflow-hidden pointer-events-none">
              <video 
                ref={videoRef}
                src={fileUrl} 
                controls 
                autoPlay 
                className="max-h-full max-w-full drop-shadow-2xl transition-transform duration-300 ease-out rounded-lg pointer-events-auto" 
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
              />
            </div>
          )}

          {/* Media Toolbar Floating */}
          {(file.type === 'image' || file.type === 'video') && (
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center justify-center space-x-2 bg-slate-900/80 backdrop-blur-2xl rounded-full px-4 py-2 border border-white/10 shadow-2xl z-20 pointer-events-auto">
              <button onClick={handleZoomOut} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Zoom Out">
                <ZoomOut size={16} />
              </button>
              <span className="text-xs text-slate-300 font-mono w-12 text-center font-medium">{Math.round(zoom * 100)}%</span>
              <button onClick={handleZoomIn} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Zoom In">
                <ZoomIn size={16} />
              </button>
              
              <div className="w-px h-5 bg-white/10 mx-2" />
              
              {file.type === 'image' && (
                <button onClick={handleRotate} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Rotate">
                  <RotateCw size={16} />
                </button>
              )}

              {file.type === 'video' && (
                <>
                  <button onClick={handleRewind} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Backward 10s">
                    <Rewind size={16} />
                  </button>
                  <button onClick={handleFastForward} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Forward 10s">
                    <FastForward size={16} />
                  </button>
                </>
              )}
              
              <button onClick={handleReset} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors" title="Reset">
                <Maximize2 size={16} />
              </button>
            </div>
          )}

          {/* Text / Code Editor */}
          {(file.type === 'text' || file.type === 'document') && (
            <div className="flex flex-col space-y-4 w-full max-w-5xl mx-auto h-full pb-8">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider pl-1">
                {monacoAvailable ? `Monaco Editor · ${language}` : 'File Content'}
              </label>

              {isLoadingContent ? (
                <div className="w-full flex-1 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-center text-xs text-slate-500 animate-pulse backdrop-blur-md">
                  Loading…
                </div>
              ) : monacoAvailable ? (
                <Suspense fallback={
                  <div className="w-full flex-1 bg-black/40 border border-white/5 rounded-2xl flex items-center justify-center text-xs text-slate-500 backdrop-blur-md">
                    Loading Monaco…
                  </div>
                }>
                  <div className="w-full flex-1 rounded-2xl overflow-hidden border border-white/10 shadow-2xl backdrop-blur-md bg-black/40">
                    <MonacoEditor
                      height="100%"
                      language={language}
                      value={textContent}
                      onChange={(val: any) => setTextContent(val ?? '')}
                      theme="vs-dark"
                      options={{
                        fontSize: 13,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        lineNumbers: 'on',
                        wordWrap: 'on',
                        readOnly: file.type !== 'text',
                        padding: { top: 16, bottom: 16 },
                        scrollbar: { verticalScrollbarSize: 8 },
                        renderLineHighlight: 'gutter',
                        smoothScrolling: true,
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    />
                  </div>
                </Suspense>
              ) : (
                <textarea
                  value={textContent}
                  onChange={(e) => setTextContent(e.target.value)}
                  className="w-full flex-1 bg-black/40 border border-white/10 rounded-2xl p-5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-200 resize-none placeholder-slate-600 shadow-2xl backdrop-blur-md"
                  placeholder="Empty file…"
                  disabled={file.type !== 'text'}
                />
              )}

              {/* Save row & Stats */}
              <div className="flex items-center justify-between mt-4">
                <div className="flex space-x-3 text-xs text-slate-400">
                  <div className="bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-xl px-4 py-2 flex items-center space-x-2">
                    <Calendar size={14} className="text-blue-400" />
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase font-semibold">Modified</p>
                      <p className="text-[11px] font-medium text-slate-300">{file.updatedAt || '—'}</p>
                    </div>
                  </div>
                  <div className="bg-slate-900/60 backdrop-blur-md border border-white/5 rounded-xl px-4 py-2 flex items-center space-x-2">
                    <Clock size={14} className="text-purple-400" />
                    <div>
                      <p className="text-[9px] text-slate-500 uppercase font-semibold">Size</p>
                      <p className="text-[11px] font-mono font-medium text-slate-300">{file.size}</p>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleSaveContent}
                  disabled={file.type !== 'text' || isLoadingContent}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm px-6 py-2.5 rounded-xl shadow-lg shadow-emerald-900/20 transition-all flex items-center space-x-2"
                >
                  <Check size={16} />
                  <span>{isSaved ? 'Saved!' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
