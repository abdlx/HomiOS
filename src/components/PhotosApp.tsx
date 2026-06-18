import React, { useState, useEffect } from 'react';
import Toolbar from './Toolbar';
import FileArea from './FileArea';
import QuickLookModal from './QuickLookModal';
import Sidebar from './Sidebar';
import { FileItem, ViewMode } from '../types';
import { toast } from './SystemUI';
import { Menu } from 'lucide-react';

interface PhotosAppProps {
  onClose?: () => void;
}

const PHOTOS_SOURCES_KEY = 'openfinder_photos_sources';

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

function normalizePath(source: string) {
  return source.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function isInsidePath(candidate: string | undefined, parent: string | null) {
  if (!parent) return true;
  if (!candidate) return false;
  const normalizedCandidate = normalizePath(candidate);
  const normalizedParent = normalizePath(parent);
  return normalizedCandidate === normalizedParent || normalizedCandidate.startsWith(`${normalizedParent}/`);
}

function pathLabel(source: string | null) {
  if (!source) return 'All Photos';
  const cleaned = source.replace(/\\/g, '/').replace(/\/+$/, '');
  return cleaned.split('/').filter(Boolean).pop() || source;
}

export default function PhotosApp({ onClose }: PhotosAppProps = {}) {
  const [currentFiles, setCurrentFiles] = useState<FileItem[]>([]);
  const [mediaFolders, setMediaFolders] = useState<FileItem[]>([]);
  const [configuredSources, setConfiguredSources] = useState<string[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOption, setSortOption] = useState<string>('date');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [quickLookFile, setQuickLookFile] = useState<FileItem | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('root');

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
    loadPhotos(sources);

    const handleSourcesChanged = () => {
      const nextSources = readPhotoSources();
      setConfiguredSources(nextSources);
      setSourceFilter(null);
      setActiveSection('root');
      setSelectedFileId(null);
      loadPhotos(nextSources);
    };

    window.addEventListener('storage', handleSourcesChanged);
    window.addEventListener('openfinder:photos-sources-changed', handleSourcesChanged);
    return () => {
      window.removeEventListener('storage', handleSourcesChanged);
      window.removeEventListener('openfinder:photos-sources-changed', handleSourcesChanged);
    };
  }, []);

  const loadPhotos = async (sources = configuredSources) => {
    setLoading(true);
    try {
      const query = sources.length > 0 ? `?sources=${encodeURIComponent(JSON.stringify(sources))}` : '';
      const res = await fetch(`/api/photos${query}`);
      if (res.ok) {
        const data = await res.json();
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
          toast({ message: 'Photos scan stopped early', description: 'Showing the newest media found so far.', tone: 'info' });
        }
      } else {
        setCurrentFiles([]);
        setMediaFolders([]);
        toast({ message: 'Failed to load photos', tone: 'danger' });
      }
    } catch (e) {
      console.error(e);
      setCurrentFiles([]);
      setMediaFolders([]);
      toast({ message: 'Error loading photos', tone: 'danger' });
    }
    setLoading(false);
  };

  const selectSection = (section: string) => {
    setActiveSection(section);
    setSelectedFileId(null);
    if (isMobile) setIsDrawerOpen(false);
  };

  const handleFileDoubleClick = (file: FileItem) => {
    if (file.type === 'folder') {
      setSourceFilter(null);
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

  const visibleFolders = !activeFolder && sourceFilter
    ? mediaFolders.filter((folder) => isInsidePath(folder.id, sourceFilter))
    : [];

  const visibleMedia = activeFolder
    ? currentFiles.filter((file) => file.folderPath === activeFolder.id)
    : sourceFilter
      ? currentFiles.filter((file) => isInsidePath(file.folderPath || file.id, sourceFilter))
      : currentFiles;

  const visibleBaseFiles = activeFolder
    ? visibleMedia
    : sourceFilter
      ? [...visibleFolders, ...visibleMedia]
      : visibleMedia;

  const sectionTitle = activeFolder
    ? activeFolder.name
    : sourceFilter
      ? pathLabel(sourceFilter)
      : 'All Photos';

  const handleNavigateHome = () => {
    setSourceFilter(null);
    setActiveSection('root');
    setSelectedFileId(null);
  };

  const handleNavigateSource = (source: string) => {
    setSourceFilter(source);
    setSelectedFileId(null);
    setQuickLookFile(null);
  };

  const handleCloseSidebar = () => {
    if (isMobile && isDrawerOpen) {
      setIsDrawerOpen(false);
    } else {
      onClose?.();
    }
  };

  const processedFiles = visibleBaseFiles
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

        <Sidebar
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          selectedTag={null}
          setSelectedTag={() => {}}
          onNavigateHome={handleNavigateHome}
          onNavigateFolder={handleNavigateSource}
          onNavigateStorage={() => toast({ message: 'Storage opens in Files', tone: 'info' })}
          onNavigateShared={() => toast({ message: 'Sharing opens in Files', tone: 'info' })}
          isMobileDrawer={isDrawerOpen}
          onCloseDrawer={handleCloseSidebar}
        />

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
