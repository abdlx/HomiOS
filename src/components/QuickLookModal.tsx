import React, { useState, useEffect, Suspense, lazy } from 'react';
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
      className="fixed inset-0 bg-black/70 backdrop-blur-xl flex items-center justify-center p-4 z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Main container */}
      <div className="bg-[#111827]/95 backdrop-blur-2xl text-slate-100 rounded-2xl w-full max-w-2xl border border-white/8 shadow-[0_32px_80px_rgba(0,0,0,0.7)] overflow-hidden flex flex-col max-h-[88vh]">

        {/* ── Title Bar ── */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950/40 border-b border-white/5">
          <div className="flex items-center space-x-2">
            <span className="text-[10px] font-mono font-semibold text-slate-500 bg-slate-800/80 px-2 py-0.5 rounded border border-white/5">
              {language.toUpperCase()}
            </span>
          </div>

          {/* Editable title */}
          <div className="flex items-center space-x-2 flex-grow justify-center max-w-[280px]">
            {isEditingName ? (
              <div className="flex items-center space-x-1">
                <input
                  type="text"
                  value={editedName}
                  onChange={(e) => setEditedName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                  className="bg-slate-800 border border-blue-500/50 rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
                <button onClick={handleSaveName} className="p-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] transition-colors">
                  <Check size={11} />
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <h3 className="text-xs font-bold text-slate-200 truncate max-w-[210px]" title={file.name}>{file.name}</h3>
                <button onClick={() => setIsEditingName(true)} className="p-1 text-slate-600 hover:text-slate-300 transition-colors">
                  <Edit3 size={11} />
                </button>
              </div>
            )}
          </div>

          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-slate-700/50 transition-all">
            <X size={15} />
          </button>
        </div>

        {/* ── Content ── */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col space-y-4">

          {/* Image Preview */}
          {file.type === 'image' && (
            <div className="w-full flex justify-center items-center rounded-xl bg-black/40 border border-white/5 overflow-hidden min-h-[200px] max-h-[440px] p-2">
              <img src={fileUrl} alt={file.name} className="max-h-[430px] max-w-full object-contain rounded-lg" />
            </div>
          )}

          {/* Video Preview */}
          {file.type === 'video' && (
            <div className="w-full flex justify-center items-center rounded-xl bg-black/40 border border-white/5 overflow-hidden min-h-[200px] max-h-[440px]">
              <video src={fileUrl} controls autoPlay className="max-h-[430px] max-w-full object-contain rounded-lg" />
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

              {/* Tag & Save row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Tag size={12} className="text-slate-500" />
                  <select
                    value={selectedTag}
                    onChange={(e) => setSelectedTag(e.target.value)}
                    className="bg-slate-800/80 border border-white/8 rounded-lg px-2.5 py-1 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                  >
                    {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <button
                  onClick={handleSaveContent}
                  disabled={file.type !== 'text' || isLoadingContent}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-xs px-4 py-1.5 rounded-lg shadow transition-all flex items-center space-x-1.5"
                >
                  <Check size={12} />
                  <span>{isSaved ? '✓ Saved!' : 'Save'}</span>
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
        <div className="px-5 py-3 bg-slate-950/40 border-t border-white/5 flex items-center justify-between">
          <button
            onClick={() => { if (confirm(`Delete "${file.name}"?`)) { onDelete(file.id); onClose(); } }}
            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all"
          >
            <Trash2 size={12} />
            <span>Delete</span>
          </button>
          <div className="flex items-center space-x-2">
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 px-3 py-1.5 rounded-lg text-xs transition-colors">
              Close
            </button>
            <a
              href={fileUrl}
              download={file.name}
              target="_blank"
              rel="noreferrer"
              className="bg-white/8 hover:bg-white/12 border border-white/10 text-slate-200 px-4 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all"
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
