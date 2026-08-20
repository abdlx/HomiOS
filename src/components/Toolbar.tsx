import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LayoutList,
  Columns,
  Image,
  Share2,
  Tag,
  MoreHorizontal,
  Plus,
  X,
  ChevronDown
} from 'lucide-react';
import { ViewMode } from '../types';
import { toast } from './SystemUI';
import { GooeyInput } from './ui/gooey-input';

interface ToolbarProps {
  currentPath: string[];
  onNavigateBack: () => void;
  onNavigateForward: () => void;
  canNavigateBack: boolean;
  canNavigateForward: boolean;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onAddNewFile: (name: string, type: 'document' | 'text' | 'image') => void;
  onAddNewFolder: (name: string, color?: 'blue' | 'orange' | 'green') => void;
  sortOption: string;
  setSortOption: (opt: string) => void;
  onUploadFiles?: (files: FileList | File[]) => void;
}

export default function Toolbar({
  currentPath,
  onNavigateBack,
  onNavigateForward,
  canNavigateBack,
  canNavigateForward,
  viewMode,
  setViewMode,
  searchTerm,
  setSearchTerm,
  onAddNewFile,
  onAddNewFolder,
  sortOption,
  setSortOption,
  onUploadFiles
}: ToolbarProps) {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Dynamic directory title display
  const currentDirName = currentPath[currentPath.length - 1] || 'HomiOS';

  const handleCreateSubmitted = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) return;

    if (isCreatingFolder) {
      // Pick random folder color for variation or orange/blue
      const colors: ('blue' | 'orange' | 'green')[] = ['blue', 'orange', 'green'];
      const chosenColor = colors[Math.floor(Math.random() * colors.length)];
      onAddNewFolder(newItemName.trim(), chosenColor);
    } else {
      onAddNewFile(newItemName.trim(), 'text');
    }

    setNewItemName('');
    setIsAddMenuOpen(false);
  };

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-6 pt-5 pb-3 bg-transparent select-none">
      
      {/* 1. Left Island: Breadcrumb & History Island */}
      <div className="flex items-center space-x-4 w-full md:w-auto justify-between md:justify-start">
        <div className="flex items-center space-x-1 bg-neutral-100/60 dark:bg-white/5 rounded-full px-1.5 py-1 border border-neutral-200/40 dark:border-white/10 shadow-sm">
          <button
            onClick={onNavigateBack}
            disabled={!canNavigateBack}
            className={`p-1 rounded-full transition-colors cursor-pointer hover:bg-white dark:hover:bg-white/10 hover:shadow-sm ${
              canNavigateBack ? 'text-gray-700' : 'text-gray-300 pointer-events-none'
            }`}
            title="Back"
          >
            <ChevronLeft size={16} className="stroke-[2.5]" />
          </button>
          <button
            onClick={onNavigateForward}
            disabled={!canNavigateForward}
            className={`p-1 rounded-full transition-colors cursor-pointer hover:bg-white dark:hover:bg-white/10 hover:shadow-sm ${
              canNavigateForward ? 'text-gray-700' : 'text-gray-300 pointer-events-none'
            }`}
            title="Forward"
          >
            <ChevronRight size={16} className="stroke-[2.5]" />
          </button>
        </div>

        <h1 className="text-sm font-bold text-gray-800 dark:text-gray-100 tracking-wide">
          {currentDirName}
        </h1>

        {/* Dynamic Plus Action Trigger Card next to Breadcrumbs */}
        <div className="relative">
          <button 
            onClick={() => {
              setIsAddMenuOpen(!isAddMenuOpen);
              setIsCreatingFolder(false);
            }}
            className="flex items-center justify-center bg-white dark:bg-white/10 hover:bg-neutral-50 dark:hover:bg-white/20 text-neutral-600 dark:text-neutral-300 hover:text-blue-600 dark:hover:text-blue-400 rounded-full w-8 h-8 border border-neutral-200/50 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all cursor-pointer"
            title="Create New Folder or File"
          >
            <Plus size={15} className="stroke-[2.5]" />
          </button>

          {isAddMenuOpen && (
            <div className="absolute top-9 left-0 z-50 bg-white dark:bg-[#26262a] border border-neutral-200 dark:border-white/10 rounded-2xl shadow-xl p-3 w-60 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-white/10 pb-2 mb-2">
                <span className="text-xs font-bold text-gray-700 dark:text-gray-200">
                  Create New {isCreatingFolder ? 'Folder' : 'Text File'}
                </span>
                <button
                  onClick={() => setIsAddMenuOpen(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex space-x-1 mb-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(false)}
                  className={`flex-1 text-[10px] py-1 rounded-lg text-center font-bold transition-colors ${
                    !isCreatingFolder ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20'
                  }`}
                >
                  New File
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(true)}
                  className={`flex-1 text-[10px] py-1 rounded-lg text-center font-bold transition-colors ${
                    isCreatingFolder ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-white/20'
                  }`}
                >
                  New Folder
                </button>
              </div>

              <form onSubmit={handleCreateSubmitted}>
                <input
                  type="text"
                  placeholder={isCreatingFolder ? "Folder Name..." : "Notes-Draft.txt"}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="w-full text-xs px-2.5 py-1.5 border border-gray-200 dark:border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2 bg-neutral-50 dark:bg-white/5 text-gray-800 dark:text-gray-100"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white text-[11px] font-bold py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create
                </button>
              </form>

              {onUploadFiles && (
                <div className="flex space-x-1 mt-2 pt-2 border-t border-gray-100 dark:border-white/10">
                  <label className="flex-1 text-[10px] py-1.5 rounded-lg text-center font-bold bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/20 transition-colors cursor-pointer block">
                    Upload File
                    <input
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) onUploadFiles(e.target.files);
                        setIsAddMenuOpen(false);
                      }}
                    />
                  </label>
                  <label className="flex-1 text-[10px] py-1.5 rounded-lg text-center font-bold bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-white/20 transition-colors cursor-pointer block">
                    Upload Folder
                    <input
                      type="file"
                      multiple
                      {...{ webkitdirectory: "" } as any}
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files) onUploadFiles(e.target.files);
                        setIsAddMenuOpen(false);
                      }}
                    />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Floating View & Arrangement Island */}
      <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
        
        {/* View Mode Pill */}
        <div className="flex items-center space-x-1 bg-neutral-100/60 dark:bg-white/5 rounded-full px-1.5 py-1 border border-neutral-200/40 dark:border-white/10 shadow-sm">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-full transition-all cursor-pointer ${
              viewMode === 'grid' ? 'bg-white dark:bg-white/15 shadow-sm text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
            }`}
            title="Grid View (Default)"
          >
            <LayoutGrid size={15} className="stroke-[2]" />
          </button>
          
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-full transition-all cursor-pointer ${
              viewMode === 'list' ? 'bg-white dark:bg-white/15 shadow-sm text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
            }`}
            title="List View"
          >
            <LayoutList size={15} className="stroke-[2]" />
          </button>

          <button
            onClick={() => setViewMode('column')}
            className={`hidden md:block p-1.5 rounded-full transition-all cursor-pointer ${
              viewMode === 'column' ? 'bg-white dark:bg-white/15 shadow-sm text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
            }`}
            title="Columns View"
          >
            <Columns size={15} className="stroke-[2]" />
          </button>

          <button
            onClick={() => setViewMode('gallery')}
            className={`hidden md:block p-1.5 rounded-full transition-all cursor-pointer ${
              viewMode === 'gallery' ? 'bg-white dark:bg-white/15 shadow-sm text-gray-800 dark:text-white' : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
            }`}
            title="Gallery View"
          >
            <Image size={15} className="stroke-[2]" />
          </button>
        </div>

        {/* Sort Pill */}
        <div className="relative">
          <div className="flex items-center bg-neutral-100/60 dark:bg-white/5 rounded-full px-1.5 py-1 border border-neutral-200/40 dark:border-white/10 shadow-sm">
            <button
              onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
              className="p-1.5 px-2 rounded-full text-gray-600 hover:bg-white dark:hover:bg-white/10 hover:shadow-sm flex items-center space-x-1 cursor-pointer transition-all"
              title="Arrange Items"
            >
              <LayoutGrid size={15} className="stroke-[2]" />
              <ChevronDown size={12} className="stroke-[3] opacity-70" />
            </button>
          </div>

          {isSortMenuOpen && (
            <div className="absolute right-0 top-10 z-50 bg-white dark:bg-[#26262a] border border-gray-200 dark:border-white/10 rounded-xl shadow-lg py-1 w-32 text-xs">
              <button
                onClick={() => { setSortOption('name'); setIsSortMenuOpen(false); }}
                className={`w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-white/10 ${sortOption === 'name' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}
              >
                Name
              </button>
              <button
                onClick={() => { setSortOption('size'); setIsSortMenuOpen(false); }}
                className={`w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-white/10 ${sortOption === 'size' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}
              >
                File Size
              </button>
              <button
                onClick={() => { setSortOption('date'); setIsSortMenuOpen(false); }}
                className={`w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-white/10 ${sortOption === 'date' ? 'font-bold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}
              >
                Date Modified
              </button>
            </div>
          )}
        </div>

        {/* Actions Pill */}
        <div className="hidden sm:flex items-center space-x-0.5 bg-neutral-100/60 dark:bg-white/5 rounded-full px-1.5 py-1 border border-neutral-200/40 dark:border-white/10 shadow-sm">
          <button
            onClick={() => toast({ message: 'Share link copied', description: 'Anyone with the link can view this folder.', tone: 'success' })}
            className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-white/10 hover:text-blue-600 dark:hover:text-blue-400 hover:shadow-sm transition-all cursor-pointer"
            title="Share Selection"
          >
            <Share2 size={15} className="stroke-[2]" />
          </button>

          <button
            className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-white/10 hover:text-purple-600 dark:hover:text-purple-400 hover:shadow-sm transition-all cursor-pointer"
            title="Tag Shortcuts"
          >
            <Tag size={15} className="stroke-[2]" />
          </button>

          <button
            onClick={() => toast({ message: 'No additional actions', tone: 'info' })}
            className="p-1.5 rounded-full text-gray-500 dark:text-gray-400 hover:bg-white dark:hover:bg-white/10 hover:text-gray-800 dark:hover:text-white hover:shadow-sm transition-all cursor-pointer"
            title="More Actions"
          >
            <MoreHorizontal size={15} className="stroke-[2]" />
          </button>
        </div>

        {/* 4. Dedicated Isolated Search button capsule */}
        <div className="relative flex items-center h-8">
          <GooeyInput 
            value={searchTerm}
            onValueChange={setSearchTerm}
            placeholder="Filter current directory..."
            expandedWidth={220}
            collapsedWidth={32}
            className="h-8"
            classNames={{
              root: "h-8",
              filterWrap: "h-8",
              bubbleSurface: "shadow-sm border border-neutral-200/40 dark:border-white/10"
            }}
          />
        </div>

      </div>
    </div>
  );
}
