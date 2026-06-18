import React, { useState, useEffect, Suspense, lazy, useRef } from 'react';
import {
  X,
  Download,
  Trash2,
  Calendar,
  Clock,
  Check,
  Edit3,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  Info,
  Image as ImageIcon,
  Video,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Rewind,
  FastForward,
  RotateCcw,
} from 'lucide-react';
import { FileItem } from '../types';

const MonacoEditor: any = lazy(() => import('@monaco-editor/react').catch(() => ({ default: () => <div>Editor not available</div> } as any)));

interface QuickLookModalProps {
  file: FileItem;
  onClose: () => void;
  onUpdateFile: (file: FileItem) => void;
  onDelete: (id: string) => void;
  files?: FileItem[];
  currentIndex?: number;
  onSelectFile?: (file: FileItem) => void;
}

type FitMode = 'fit' | 'fill' | 'actual';

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
    xml: 'xml',
    sql: 'sql',
    txt: 'plaintext',
    log: 'plaintext',
    csv: 'plaintext',
    conf: 'ini', ini: 'ini',
  };
  return map[ext] || 'plaintext';
}

function mediaUrl(file: FileItem) {
  return `/api/files?path=${encodeURIComponent(file.id)}&raw=true`;
}

export default function QuickLookModal({
  file,
  onClose,
  onUpdateFile,
  onDelete,
  files = [file],
  currentIndex = 0,
  onSelectFile,
}: QuickLookModalProps) {
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(file.name);
  const [textContent, setTextContent] = useState(file.content || '');
  const [isSaved, setIsSaved] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>(file.tags?.[0] || '');
  const [isLoadingContent, setIsLoadingContent] = useState(file.type === 'text');
  const [monacoAvailable, setMonacoAvailable] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitMode, setFitMode] = useState<FitMode>('fit');
  const [showInfo, setShowInfo] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);

  const fileUrl = mediaUrl(file);
  const language = resolveLanguage(file.name);
  const mediaFiles = files.filter((item) => item.type === 'image' || item.type === 'video');
  const safeIndex = currentIndex >= 0 ? currentIndex : mediaFiles.findIndex((item) => item.id === file.id);
  const canNavigate = mediaFiles.length > 1 && safeIndex >= 0;

  useEffect(() => {
    import('@monaco-editor/react').then(() => setMonacoAvailable(true)).catch(() => setMonacoAvailable(false));
  }, []);

  useEffect(() => {
    setEditedName(file.name);
    setTextContent(file.content || '');
    setSelectedTag(file.tags?.[0] || '');
    setIsEditingName(false);
    setIsSaved(false);
    setZoom(1);
    setRotation(0);
    setFitMode('fit');
    setIsPlaying(false);
    setIsLoadingContent(file.type === 'text');

    if (file.type === 'text') {
      fetch(fileUrl)
        .then(res => res.text())
        .then(text => { setTextContent(text); setIsLoadingContent(false); })
        .catch(() => { setTextContent('Failed to load file content.'); setIsLoadingContent(false); });
    }
  }, [file.id, file.name, file.type, file.content, file.tags, fileUrl]);

  const goToIndex = (index: number) => {
    if (!canNavigate || !onSelectFile) return;
    const next = mediaFiles[(index + mediaFiles.length) % mediaFiles.length];
    if (next) onSelectFile(next);
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goToIndex(safeIndex - 1);
      if (e.key === 'ArrowRight') goToIndex(safeIndex + 1);
      if (e.key === ' ' && file.type === 'video') {
        e.preventDefault();
        toggleVideoPlayback();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, safeIndex, mediaFiles, file.type]);

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

  const toggleVideoPlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const skipVideo = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, video.currentTime + seconds);
  };

  const changePlaybackRate = () => {
    const rates = [0.5, 1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (videoRef.current) videoRef.current.playbackRate = next;
  };

  const enterFullscreen = () => {
    viewerRef.current?.requestFullscreen?.();
  };

  const resetView = () => {
    setZoom(1);
    setRotation(0);
    setFitMode('fit');
  };

  const isMedia = file.type === 'image' || file.type === 'video';
  const fitClass = fitMode === 'fill' ? 'object-cover w-full h-full' : fitMode === 'actual' ? 'max-w-none max-h-none' : 'object-contain max-w-full max-h-full';

  return (
    <div
      className="fixed inset-0 bg-neutral-950 text-slate-100 flex flex-col z-[100] overflow-hidden"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <header className="h-14 flex items-center justify-between px-4 border-b border-white/10 bg-neutral-950/95">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors" title="Close">
            <X size={18} />
          </button>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide bg-white/10 text-slate-300">
            {file.type === 'video' ? <Video size={12} /> : file.type === 'image' ? <ImageIcon size={12} /> : null}
            {file.type === 'text' ? language : file.type}
          </span>
        </div>

        <div className="flex items-center gap-2 min-w-0 max-w-[45vw]">
          {isEditingName ? (
            <>
              <input
                type="text"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); }}
                className="bg-white/10 border border-blue-400/50 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-400 w-64 max-w-[40vw] text-center"
                autoFocus
              />
              <button onClick={handleSaveName} className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors" title="Save Name">
                <Check size={14} />
              </button>
            </>
          ) : (
            <button className="flex items-center gap-2 min-w-0 group" onClick={() => setIsEditingName(true)} title="Rename">
              <span className="text-sm font-semibold text-white truncate">{file.name}</span>
              <Edit3 size={13} className="text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isMedia && (
            <button onClick={() => setShowInfo(prev => !prev)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors" title="Info">
              <Info size={17} />
            </button>
          )}
          <button onClick={() => { onDelete(file.id); onClose(); }} className="p-2 rounded-lg text-red-400 hover:text-white hover:bg-red-500 transition-colors" title="Delete">
            <Trash2 size={17} />
          </button>
          <a href={fileUrl} download={file.name} className="p-2 rounded-lg text-slate-200 bg-blue-600 hover:bg-blue-500 transition-colors" title="Download">
            <Download size={17} />
          </a>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <main ref={viewerRef} className="relative flex-1 min-w-0 bg-neutral-950 overflow-hidden">
          {canNavigate && (
            <>
              <button onClick={() => goToIndex(safeIndex - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/45 hover:bg-black/70 text-white border border-white/10 transition-colors" title="Previous">
                <ChevronLeft size={24} />
              </button>
              <button onClick={() => goToIndex(safeIndex + 1)} className="absolute right-4 top-1/2 -translate-y-1/2 z-20 p-3 rounded-full bg-black/45 hover:bg-black/70 text-white border border-white/10 transition-colors" title="Next">
                <ChevronRight size={24} />
              </button>
            </>
          )}

          {file.type === 'image' && (
            <div className="absolute inset-0 flex items-center justify-center overflow-auto p-8">
              <img
                src={fileUrl}
                alt={file.name}
                className={`${fitClass} select-none transition-transform duration-200`}
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                draggable={false}
              />
            </div>
          )}

          {file.type === 'video' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <video
                ref={videoRef}
                src={fileUrl}
                className={`${fitClass} transition-transform duration-200`}
                style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onVolumeChange={(e) => setIsMuted((e.currentTarget as HTMLVideoElement).muted)}
                onRateChange={(e) => setPlaybackRate((e.currentTarget as HTMLVideoElement).playbackRate)}
              />
            </div>
          )}

          {(file.type === 'text' || file.type === 'document') && (
            <div className="h-full p-5 flex flex-col gap-4">
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {monacoAvailable ? `Monaco Editor - ${language}` : 'File Content'}
              </label>

              {isLoadingContent ? (
                <div className="flex-1 bg-black/40 border border-white/10 rounded-xl flex items-center justify-center text-xs text-slate-500 animate-pulse">
                  Loading...
                </div>
              ) : monacoAvailable ? (
                <Suspense fallback={<div className="flex-1 bg-black/40 border border-white/10 rounded-xl flex items-center justify-center text-xs text-slate-500">Loading Monaco...</div>}>
                  <div className="flex-1 rounded-xl overflow-hidden border border-white/10 bg-black/40">
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
                  className="flex-1 bg-black/40 border border-white/10 rounded-xl p-5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-200 resize-none"
                  disabled={file.type !== 'text'}
                />
              )}

              <div className="flex items-center justify-end">
                <button
                  onClick={handleSaveContent}
                  disabled={file.type !== 'text' || isLoadingContent}
                  className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white font-semibold text-sm px-5 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <Check size={16} />
                  <span>{isSaved ? 'Saved' : 'Save Changes'}</span>
                </button>
              </div>
            </div>
          )}

          {isMedia && (
            <div className="absolute left-1/2 -translate-x-1/2 bottom-5 z-30 flex items-center gap-1 rounded-xl bg-neutral-900/90 border border-white/10 shadow-2xl px-2 py-2 backdrop-blur">
              {file.type === 'video' && (
                <>
                  <button onClick={toggleVideoPlayback} className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title={isPlaying ? 'Pause' : 'Play'}>
                    {isPlaying ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button onClick={() => skipVideo(-10)} className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title="Back 10s">
                    <Rewind size={16} />
                  </button>
                  <button onClick={() => skipVideo(10)} className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title="Forward 10s">
                    <FastForward size={16} />
                  </button>
                  <button onClick={toggleMute} className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title={isMuted ? 'Unmute' : 'Mute'}>
                    {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                  </button>
                  <button onClick={changePlaybackRate} className="px-2 h-8 rounded-lg text-xs font-bold text-slate-300 hover:bg-white/10 hover:text-white" title="Playback Speed">
                    {playbackRate}x
                  </button>
                  <div className="w-px h-5 bg-white/10 mx-1" />
                </>
              )}

              <button onClick={() => setZoom(z => Math.max(0.25, z - 0.25))} className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title="Zoom Out">
                <ZoomOut size={16} />
              </button>
              <span className="w-12 text-center text-xs font-mono text-slate-300">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(5, z + 0.25))} className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title="Zoom In">
                <ZoomIn size={16} />
              </button>
              <button onClick={() => setRotation(r => r - 90)} className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title="Rotate Left">
                <RotateCcw size={16} />
              </button>
              <button onClick={() => setRotation(r => r + 90)} className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title="Rotate Right">
                <RotateCw size={16} />
              </button>

              <div className="w-px h-5 bg-white/10 mx-1" />
              {(['fit', 'fill', 'actual'] as FitMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFitMode(mode)}
                  className={`px-2 h-8 rounded-lg text-xs font-bold capitalize ${fitMode === mode ? 'bg-white text-neutral-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}
                  title={mode}
                >
                  {mode}
                </button>
              ))}
              <button onClick={resetView} className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title="Reset View">
                <Maximize2 size={16} />
              </button>
              <button onClick={enterFullscreen} className="p-2 rounded-lg text-slate-300 hover:bg-white/10 hover:text-white" title="Fullscreen">
                <Maximize2 size={16} />
              </button>
            </div>
          )}
        </main>

        {isMedia && showInfo && (
          <aside className="hidden lg:flex w-80 shrink-0 border-l border-white/10 bg-neutral-900 flex-col">
            <div className="p-4 border-b border-white/10">
              <h3 className="text-sm font-semibold text-white truncate">{file.name}</h3>
              <p className="text-xs text-slate-500 mt-1 truncate">{file.folderPath || file.id}</p>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-2"><Calendar size={14} /> Modified</span>
                <span className="text-slate-200 text-right">{file.updatedAt || '-'}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500 flex items-center gap-2"><Clock size={14} /> Size</span>
                <span className="text-slate-200 font-mono text-right">{file.size}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">Type</span>
                <span className="text-slate-200 capitalize">{file.type}</span>
              </div>
              {file.folderName && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Folder</span>
                  <span className="text-slate-200 truncate text-right">{file.folderName}</span>
                </div>
              )}
              {canNavigate && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-slate-500">Position</span>
                  <span className="text-slate-200">{safeIndex + 1} of {mediaFiles.length}</span>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {isMedia && mediaFiles.length > 1 && (
        <div className="h-24 border-t border-white/10 bg-neutral-950 px-4 py-3 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {mediaFiles.map((item, index) => (
              <button
                key={item.id}
                onClick={() => onSelectFile?.(item)}
                className={`relative w-24 h-16 rounded-md overflow-hidden border transition-all ${item.id === file.id ? 'border-blue-400 ring-2 ring-blue-500/30' : 'border-white/10 opacity-65 hover:opacity-100'}`}
                title={item.name}
              >
                {item.type === 'video' ? (
                  <>
                    <video src={mediaUrl(item)} className="w-full h-full object-cover" muted preload="metadata" />
                    <span className="absolute inset-0 flex items-center justify-center text-white bg-black/20">
                      <Video size={16} />
                    </span>
                  </>
                ) : (
                  <img src={mediaUrl(item)} alt={item.name} className="w-full h-full object-cover" />
                )}
                <span className="absolute left-1 bottom-1 text-[9px] font-bold px-1 rounded bg-black/60 text-white">{index + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
