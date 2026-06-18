import React, { useState, useEffect, useRef } from 'react';
import Toolbar from './Toolbar';
import FileArea from './FileArea';
import QuickLookModal from './QuickLookModal';
import { FileItem, ViewMode } from '../types';
import { toast } from './SystemUI';
import { Folder, Image as ImageIcon, Menu, X } from 'lucide-react';

interface PhotosAppProps {
  onClose?: () => void;
  isActive?: boolean;
}

const PHOTOS_SOURCES_KEY = 'openfinder_photos_sources';
const PHOTOS_RESULT_LIMIT = 1500;

function readPhotoSources(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved = localStorage.getItem(PHOTOS_SOURCES_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed.filter((source): source is string => typeof source === 'string' && source.trim().length > 0) : [];
  } catch {
    return [];
  }
}

export default function PhotosApp({ onClose, isActive = true }: PhotosAppProps = {}) {
  const [currentFiles, setCurrentFiles] = useState<FileItem[]>([]);
  const [mediaFolders, setMediaFolders] = useState<FileItem[]>([]);
  const [configuredSources, setConfiguredSources] = useState<string[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOption, setSortOption] = useState<string>('date');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [quickLookFile, setQuickLookFile] = useState<FileItem | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('all-photos');
  const hasLoadedRef = useRef(false);
  const loadControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile && (viewMode === 'column' || viewMode === 'gallery')) {
        setViewMode('grid');
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [viewMode]);

  useEffect(() => {
    const sources = readPhotoSources();
    setConfiguredSources(sources);
    if (isActive) {
      hasLoadedRef.current = true;
      loadPhotos(sources);
    }

    const handleSourcesChanged = () => {
      const nextSources = readPhotoSources();
      setConfiguredSources(nextSources);
      setActiveSection('all-photos');
      setSelectedFileId(null);
      if (isActive) {
        hasLoadedRef.current = true;
        loadPhotos(nextSources);
      } else {
        hasLoadedRef.current = false;
      }
    };

    window.addEventListener('storage', handleSourcesChanged);
    window.addEventListener('openfinder:photos-sources-changed', handleSourcesChanged);
    return () => {
      window.removeEventListener('storage', handleSourcesChanged);
      window.removeEventListener('openfinder:photos-sources-changed', handleSourcesChanged);
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive || hasLoadedRef.current) return;
    const sources = readPhotoSources();
    setConfiguredSources(sources);
    hasLoadedRef.current = true;
    loadPhotos(sources);
  }, [isActive]);

  useEffect(() => {
    if (isActive) return;
    loadControllerRef.current?.abort();
    setLoading(false);
  }, [isActive]);

  useEffect(() => {
    return () => loadControllerRef.current?.abort();
  }, []);

  const loadPhotos = async (sources = configuredSources) => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(PHOTOS_RESULT_LIMIT) });
      if (sources.length > 0) params.set('sources', JSON.stringify(sources));
      const res = await fetch(`/api/photos?${params.toString()}`, { signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        if (controller.signal.aborted) return;
        const media = Array.isArray(data) ? data : data.media || [];
        const folders = Array.isArray(data) ? [] : data.folders || [];
        const formatted: FileItem[] = media.map((file: any) => ({
          id: file.id,
          name: file.name,
          type: file.type === 'video' ? 'video' : 'image',
          size: `${(file.size / 1024).toFixed(1)} KB`,
          updatedAt: file.modified ? file.modified.split('T')[0] : new Date().toISOString().split('T')[0],
          folderColor: 'blue',
          thumbnailUrl: `/api/files?raw=true&path=${encodeURIComponent(file.path)}`,
          folderPath: file.folderPath,
          folderName: file.folderName,
        } as FileItem & { folderPath?: string; folderName?: string }));
        const formattedFolders: FileItem[] = folders.map((folder: any) => ({
          id: folder.id,
          name: folder.name,
          type: 'folder',
          size: `${folder.mediaCount || folder.size || 0} items`,
          updatedAt: folder.modified ? folder.modified.split('T')[0] : new Date().toISOString().split('T')[0],
          folderColor: 'blue',
          thumbnailUrl: folder.coverPath ? `/api/files?raw=true&path=${encodeURIComponent(folder.coverPath)}` : undefined,
          mediaCount: folder.mediaCount || folder.size || 0,
          imageCount: folder.imageCount || 0,
          videoCount: folder.videoCount || 0,
        } as FileItem & { mediaCount?: number; imageCount?: number; videoCount?: number }));
        setCurrentFiles(formatted);
        setMediaFolders(formattedFolders);
        if (!Array.isArray(data) && data.truncated) {
          toast({
            message: formatted.length > 0 ? 'Large library scan limited' : 'Photos scan reached the time limit',
            description: formatted.length > 0
              ? 'Showing the media found so far. Narrow the selected Photos sources in Settings for faster scans.'
              : 'Choose a smaller drive or folder in Settings > Storage > Photos Library Sources.',
            tone: formatted.length > 0 ? 'info' : 'warning',
          });
        }
      } else {
        if (controller.signal.aborted) return;
        setCurrentFiles([]);
        setMediaFolders([]);
        toast({ message: 'Failed to load photos', tone: 'danger' });
      }
    } catch (e) {
      if ((e as any)?.name === 'AbortError') return;
      console.error(e);
      setCurrentFiles([]);
      setMediaFolders([]);
      toast({ message: 'Error loading photos', tone: 'danger' });
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (loadControllerRef.current === controller) loadControllerRef.current = null;
    }
  };

  const selectSection = (section: string) => {
    setActiveSection(section);
    setSelectedFileId(null);
    if (isMobile) setIsDrawerOpen(false);
  };

  const handleFileDoubleClick = (file: FileItem) => {
    if (file.type === 'folder') {
      selectSection(`folder:${file.id}`);
      return;
    }
    setQuickLookFile(file);
  };

  const handleReadOnlyUpdate = () => {
    toast({ message: "Cannot edit from global photos view yet.", tone: "warning" });
  };

  const handleReadOnlyDelete = () => {
    toast({ message: "Cannot delete from global photos view yet.", tone: "warning" });
  };

  const activeFolder = activeSection.startsWith('folder:')
    ? mediaFolders.find((folder) => folder.id === activeSection.slice('folder:'.length))
    : null;

  const visibleMedia = activeFolder
    ? currentFiles.filter((file) => file.folderPath === activeFolder.id)
    : currentFiles;

  const sectionTitle = activeFolder
    ? activeFolder.name
    : 'All Photos';

  const handleCloseSidebar = () => {
    if (isMobile && isDrawerOpen) {
      setIsDrawerOpen(false);
    } else {
      onClose?.();
    }
  };

  const processedFiles = visibleMedia
    .filter((file) => searchTerm.trim() ? file.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) : true)
    .sort((a, b) => {
      if (sortOption === 'size') return parseFloat(b.size) - parseFloat(a.size);
      if (sortOption === 'name') return a.name.localeCompare(b.name);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

  const quickLookFiles = processedFiles.filter((file) => file.type !== 'folder');
  const quickLookIndex = quickLookFile ? quickLookFiles.findIndex((file) => file.id === quickLookFile.id) : -1;

  return (
    <div
      className="h-full w-full flex flex-col select-none overflow-hidden bg-gray-50 dark:bg-[#161618] font-sans transition-colors duration-300"
      onContextMenu={(e) => e.preventDefault()}
    >
      <main className="flex-1 w-full flex overflow-hidden bg-gray-50 dark:bg-[#161618] relative">
        {/* Mobile Sidebar Overlay */}
        {isDrawerOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsDrawerOpen(false)} />
        )}

        <div className={`relative flex flex-col select-none justify-between bg-white dark:bg-[#1f1f22] md:border border-neutral-200/50 dark:border-white/10 transition-colors duration-300 ${
          isDrawerOpen
            ? 'absolute z-50 left-0 top-0 bottom-0 w-[280px] shadow-2xl p-4 pt-5 animate-in slide-in-from-left duration-300'
            : 'hidden md:flex w-[240px] md:w-[250px] shadow-sm m-3 rounded-[32px] p-4 pt-5'
        }`}>
          <div className="flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center space-x-2">
                <div
                  className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all"
                  title="Close"
                  onClick={handleCloseSidebar}
                />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all" title="Minimize" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all" title="Zoom" />
              </div>
              {isDrawerOpen && (
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="p-1 rounded-full hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400 active:scale-95 transition-all"
                  title="Close Sidebar"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            <div className="mb-4 flex items-center gap-2.5 px-2">
              <div className="w-7 h-7 rounded-xl bg-pink-500 text-white flex items-center justify-center shadow-sm">
                <ImageIcon size={15} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate">Photos</h2>
                <p className="text-[10px] text-neutral-400 dark:text-neutral-500 truncate">
                  {configuredSources.length === 0 ? 'Scanning all sources' : `${configuredSources.length} selected source${configuredSources.length === 1 ? '' : 's'}`}
                </p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1 space-y-4 sidebar-scroll min-h-0">
              <div>
                <button
                  onClick={() => selectSection('all-photos')}
                  className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors font-medium ${
                    activeSection === 'all-photos'
                      ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 font-bold'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-neutral-200/50 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  <ImageIcon size={16} className="flex-shrink-0" />
                  <span className="truncate flex-1">All Photos</span>
                  <span className="text-[10px] font-semibold text-neutral-400">{currentFiles.length}</span>
                </button>
              </div>

              <div>
                <span className="px-2 text-[9px] font-bold text-gray-400 dark:text-gray-500 tracking-wider uppercase block mb-1">
                  Media Folders
                </span>
                <div className="space-y-0.5">
                  {mediaFolders.map((folder) => {
                    const isActive = activeSection === `folder:${folder.id}`;
                    return (
                      <button
                        key={folder.id}
                        onClick={() => selectSection(`folder:${folder.id}`)}
                        className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md text-xs text-left transition-colors font-medium ${
                          isActive
                            ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 font-semibold'
                            : 'text-gray-600 dark:text-gray-300 hover:bg-neutral-200/50 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        <Folder size={14} className="flex-shrink-0 text-sky-500" />
                        <span className="truncate flex-1" title={folder.id}>{folder.name}</span>
                        <span className="text-[10px] font-semibold text-neutral-400">{folder.mediaCount || parseInt(folder.size, 10) || 0}</span>
                      </button>
                    );
                  })}
                  {mediaFolders.length === 0 && (
                    <div className="px-2 py-2 text-xs text-gray-400 dark:text-gray-500 italic">
                      No media folders found
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-neutral-200/30 dark:border-white/10 flex items-center justify-between px-1.5 text-neutral-400 dark:text-neutral-500 text-[10px]">
            <span className="font-semibold text-neutral-500 dark:text-neutral-400">{mediaFolders.length} folders</span>
            <span className="opacity-75">{currentFiles.length} media</span>
          </div>
        </div>

        {/* Dynamic Body */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50 dark:bg-[#161618] w-full md:pt-3 md:pr-3 md:pb-3">
          {/* Mobile hamburger for body */}
          <div className="md:hidden flex items-center p-4 bg-white dark:bg-[#1c1c1e] border-b border-neutral-100 dark:border-white/10">
            <button onClick={() => setIsDrawerOpen(true)} className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition mr-3">
              <Menu size={20} />
            </button>
            <h1 className="font-semibold text-gray-800 dark:text-white">
              {sectionTitle}
            </h1>
          </div>

          <div className="flex flex-col h-full bg-white dark:bg-[#1c1c1e] md:rounded-[32px] md:border border-neutral-200/50 dark:border-white/10 shadow-sm overflow-hidden transform-gpu">
            <Toolbar
              currentPath={['Photos', sectionTitle]}
              onNavigateBack={() => {}}
              onNavigateForward={() => {}}
              canNavigateBack={false}
              canNavigateForward={false}
              viewMode={viewMode}
              setViewMode={setViewMode}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onAddNewFile={() => {}}
              onAddNewFolder={() => {}}
              sortOption={sortOption}
              setSortOption={setSortOption}
            />
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-neutral-500 dark:text-neutral-400">
                <span className="animate-pulse">Scanning attached drives for photos and videos...</span>
              </div>
            ) : (
              <FileArea
                files={processedFiles}
                selectedFileId={selectedFileId}
                setSelectedFileId={setSelectedFileId}
                onFileDoubleClick={handleFileDoubleClick}
                onDeleteFile={() => toast({ message: "Cannot delete from global photos view yet.", tone: "warning" })}
                onRenameFile={() => toast({ message: "Cannot rename from global photos view yet.", tone: "warning" })}
                onUploadFiles={() => {}}
                viewMode={viewMode}
                currentPath={['Photos', sectionTitle]}
              />
            )}
          </div>
        </div>
      </main>

      {/* Modal and Panel overlays */}
      {quickLookFile && (
        <QuickLookModal
          file={quickLookFile}
          onClose={() => setQuickLookFile(null)}
          onUpdateFile={handleReadOnlyUpdate}
          onDelete={handleReadOnlyDelete}
          files={quickLookFiles}
          currentIndex={quickLookIndex}
          onSelectFile={setQuickLookFile}
        />
      )}
    </div>
  );
}
