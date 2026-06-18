import React, { useState, useEffect } from 'react';
import Toolbar from './Toolbar';
import FileArea from './FileArea';
import QuickLookModal from './QuickLookModal';
import { FileItem, ViewMode } from '../types';
import { toast } from './SystemUI';
import { Menu, Image as ImageIcon } from 'lucide-react';

interface PhotosAppProps {
  onClose?: () => void;
}

export default function PhotosApp({ onClose }: PhotosAppProps = {}) {
  const [currentFiles, setCurrentFiles] = useState<FileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('gallery');
  const [sortOption, setSortOption] = useState<string>('date');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [quickLookFile, setQuickLookFile] = useState<FileItem | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('all-photos');

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
    loadPhotos();
  }, []);

  const loadPhotos = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/photos');
      if (res.ok) {
        const data = await res.json();
        const formatted: FileItem[] = data.map((file: any) => ({
          id: file.id,
          name: file.name,
          type: 'image',
          size: `${(file.size / 1024).toFixed(1)} KB`,
          updatedAt: file.modified ? file.modified.split('T')[0] : new Date().toISOString().split('T')[0],
          folderColor: 'blue',
          thumbnailUrl: `/api/files?raw=true&path=${encodeURIComponent(file.path)}`
        }));
        setCurrentFiles(formatted);
      } else {
        setCurrentFiles([]);
        toast({ message: 'Failed to load photos', tone: 'danger' });
      }
    } catch (e) {
      console.error(e);
      setCurrentFiles([]);
      toast({ message: 'Error loading photos', tone: 'danger' });
    }
    setLoading(false);
  };

  const handleFileDoubleClick = (file: FileItem) => {
    setQuickLookFile(file);
  };

  const processedFiles = currentFiles
    .filter((file) => searchTerm.trim() ? file.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) : true)
    .sort((a, b) => {
      if (sortOption === 'size') return parseFloat(b.size) - parseFloat(a.size);
      if (sortOption === 'name') return a.name.localeCompare(b.name);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

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

        {/* Responsive Sidebar (Simplified for Photos) */}
        <div className={`
          absolute inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0
          flex flex-col bg-white dark:bg-[#1f1f22] md:border-r border-neutral-200/50 dark:border-white/10 p-4 pt-5
          ${isDrawerOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
        `}>
          {/* macOS Window Title bar actions */}
          <div className="flex items-center justify-between mb-4 px-1">
            <div className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all" 
                title="Close" 
                onClick={onClose}
              />
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all" title="Minimize" />
              <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all" title="Zoom" />
            </div>
          </div>

          <div className="mb-2 flex items-center space-x-2.5 px-2">
            <div className="w-4 h-4 rounded-full bg-pink-500 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-white/90" />
            </div>
            <h2 className="text-[11px] font-bold text-gray-800 dark:text-gray-100 uppercase tracking-widest">Photos Library</h2>
          </div>
          
          <div className="flex-1 overflow-y-auto px-1 py-2 space-y-6 hide-scrollbar">
            <div className="space-y-0.5">
              <button
                onClick={() => { setActiveSection('all-photos'); if (isMobile) setIsDrawerOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg font-medium transition-all flex items-center space-x-2.5 ${
                  activeSection === 'all-photos' ? 'bg-blue-600/10 dark:bg-blue-500/15 text-blue-600 dark:text-blue-300 font-bold' : 'text-gray-600 dark:text-gray-300 hover:bg-neutral-200/50 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                <ImageIcon size={16} strokeWidth={2} className={activeSection === 'all-photos' ? 'text-blue-600 dark:text-blue-400' : ''} />
                <span>All Photos</span>
              </button>
            </div>
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
              All Photos
            </h1>
          </div>

          <div className="flex flex-col h-full bg-white dark:bg-[#1c1c1e] md:rounded-[32px] md:border border-neutral-200/50 dark:border-white/10 shadow-sm overflow-hidden transform-gpu">
            <Toolbar
              currentPath={['Photos']}
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
                <span className="animate-pulse">Scanning drives for photos... This might take a few seconds...</span>
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
                currentPath={['Photos']}
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
        />
      )}
    </div>
  );
}
