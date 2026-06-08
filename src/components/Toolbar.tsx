import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  LayoutGrid, 
  LayoutList, 
  Columns, 
  Image, 
  ArrowUpDown, 
  Share2, 
  Tag, 
  MoreHorizontal, 
  Search,
  Plus,
  FolderPlus,
  ArrowDownCircle,
  X,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import { ViewMode } from '../types';

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
  setSortOption
}: ToolbarProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isSortMenuOpen, setIsSortMenuOpen] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);

  // Dynamic directory title display
  const currentDirName = currentPath[currentPath.length - 1] || 'Nextcloud';

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
        <div className="flex items-center space-x-1 bg-neutral-100/60 rounded-full px-1.5 py-1 border border-neutral-200/40 shadow-sm">
          <button
            onClick={onNavigateBack}
            disabled={!canNavigateBack}
            className={`p-1 rounded-full transition-colors cursor-pointer hover:bg-white hover:shadow-sm ${
              canNavigateBack ? 'text-gray-700' : 'text-gray-300 pointer-events-none'
            }`}
            title="Back"
          >
            <ChevronLeft size={16} className="stroke-[2.5]" />
          </button>
          <button
            onClick={onNavigateForward}
            disabled={!canNavigateForward}
            className={`p-1 rounded-full transition-colors cursor-pointer hover:bg-white hover:shadow-sm ${
              canNavigateForward ? 'text-gray-700' : 'text-gray-300 pointer-events-none'
            }`}
            title="Forward"
          >
            <ChevronRight size={16} className="stroke-[2.5]" />
          </button>
        </div>

        <h1 className="text-sm font-bold text-gray-800 tracking-wide">
          {currentDirName}
        </h1>

        {/* Dynamic Plus Action Trigger Card next to Breadcrumbs */}
        <div className="relative">
          <button 
            onClick={() => {
              setIsAddMenuOpen(!isAddMenuOpen);
              setIsCreatingFolder(false);
            }}
            className="flex items-center justify-center bg-white hover:bg-neutral-50 text-neutral-600 hover:text-blue-600 rounded-full w-8 h-8 border border-neutral-200/50 shadow-[0_1px_3px_rgba(0,0,0,0.02)] transition-all cursor-pointer"
            title="Create New Folder or File"
          >
            <Plus size={15} className="stroke-[2.5]" />
          </button>

          {isAddMenuOpen && (
            <div className="absolute top-9 left-0 z-50 bg-white border border-neutral-200 rounded-2xl shadow-xl p-3 w-60 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between border-b border-gray-100 pb-2 mb-2">
                <span className="text-xs font-bold text-gray-700">
                  Create New {isCreatingFolder ? 'Folder' : 'Text File'}
                </span>
                <button 
                  onClick={() => setIsAddMenuOpen(false)} 
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="flex space-x-1 mb-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(false)}
                  className={`flex-1 text-[10px] py-1 rounded-lg text-center font-bold transition-colors ${
                    !isCreatingFolder ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  New File
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingFolder(true)}
                  className={`flex-1 text-[10px] py-1 rounded-lg text-center font-bold transition-colors ${
                    isCreatingFolder ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                  className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2 bg-neutral-50"
                  autoFocus
                />
                <button
                  type="submit"
                  className="w-full bg-blue-600 text-white text-[11px] font-bold py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Create
                </button>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* 2. Floating View & Arrangement Island */}
      <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
        
        {/* View Mode Pill */}
        <div className="flex items-center space-x-1 bg-neutral-100/60 rounded-full px-1.5 py-1 border border-neutral-200/40 shadow-sm">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-full transition-all cursor-pointer ${
              viewMode === 'grid' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-800'
            }`}
            title="Grid View (Default)"
          >
            <LayoutGrid size={15} className="stroke-[2]" />
          </button>
          
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-full transition-all cursor-pointer ${
              viewMode === 'list' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-800'
            }`}
            title="List View"
          >
            <LayoutList size={15} className="stroke-[2]" />
          </button>

          <button
            onClick={() => setViewMode('column')}
            className={`hidden md:block p-1.5 rounded-full transition-all cursor-pointer ${
              viewMode === 'column' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-800'
            }`}
            title="Columns View"
          >
            <Columns size={15} className="stroke-[2]" />
          </button>

          <button
            onClick={() => setViewMode('gallery')}
            className={`hidden md:block p-1.5 rounded-full transition-all cursor-pointer ${
              viewMode === 'gallery' ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-800'
            }`}
            title="Gallery View"
          >
            <Image size={15} className="stroke-[2]" />
          </button>
        </div>

        {/* Sort Pill */}
        <div className="relative">
          <div className="flex items-center bg-neutral-100/60 rounded-full px-1.5 py-1 border border-neutral-200/40 shadow-sm">
            <button
              onClick={() => setIsSortMenuOpen(!isSortMenuOpen)}
              className="p-1.5 px-2 rounded-full text-gray-600 hover:bg-white hover:shadow-sm flex items-center space-x-1 cursor-pointer transition-all"
              title="Arrange Items"
            >
              <LayoutGrid size={15} className="stroke-[2]" />
              <ChevronDown size={12} className="stroke-[3] opacity-70" />
            </button>
          </div>

          {isSortMenuOpen && (
            <div className="absolute right-0 top-10 z-50 bg-white border border-gray-200 rounded-xl shadow-lg py-1 w-32 text-xs">
              <button
                onClick={() => { setSortOption('name'); setIsSortMenuOpen(false); }}
                className={`w-full px-3 py-1.5 text-left hover:bg-neutral-100 ${sortOption === 'name' ? 'font-bold text-blue-600' : 'text-gray-700'}`}
              >
                Name
              </button>
              <button
                onClick={() => { setSortOption('size'); setIsSortMenuOpen(false); }}
                className={`w-full px-3 py-1.5 text-left hover:bg-neutral-100 ${sortOption === 'size' ? 'font-bold text-blue-600' : 'text-gray-700'}`}
              >
                File Size
              </button>
              <button
                onClick={() => { setSortOption('date'); setIsSortMenuOpen(false); }}
                className={`w-full px-3 py-1.5 text-left hover:bg-neutral-100 ${sortOption === 'date' ? 'font-bold text-blue-600' : 'text-gray-700'}`}
              >
                Date Modified
              </button>
            </div>
          )}
        </div>

        {/* Actions Pill */}
        <div className="hidden sm:flex items-center space-x-0.5 bg-neutral-100/60 rounded-full px-1.5 py-1 border border-neutral-200/40 shadow-sm">
          <button
            onClick={() => alert(`Share link created.`)}
            className="p-1.5 rounded-full text-gray-500 hover:bg-white hover:text-blue-600 hover:shadow-sm transition-all cursor-pointer"
            title="Share Selection"
          >
            <Share2 size={15} className="stroke-[2]" />
          </button>
          
          <button
            className="p-1.5 rounded-full text-gray-500 hover:bg-white hover:text-purple-600 hover:shadow-sm transition-all cursor-pointer"
            title="Tag Shortcuts"
          >
            <Tag size={15} className="stroke-[2]" />
          </button>

          <button
            onClick={() => alert('More Actions')}
            className="p-1.5 rounded-full text-gray-500 hover:bg-white hover:text-gray-800 hover:shadow-sm transition-all cursor-pointer"
            title="More Actions"
          >
            <MoreHorizontal size={15} className="stroke-[2]" />
          </button>
        </div>

        {/* 4. Dedicated Isolated Search button capsule */}
        <div className="relative flex items-center space-x-1.5">
          {isSearchOpen && (
            <div className="relative flex items-center animate-in slide-in-from-right-3 duration-200">
              <input
                type="text"
                placeholder="Filter current directory..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="text-xs px-3 py-1 pr-7 border border-neutral-200 rounded-full w-40 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-inner"
                autoFocus
              />
              {searchTerm ? (
                <button 
                  onClick={() => setSearchTerm('')} 
                  className="absolute right-2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={12} />
                </button>
              ) : null}
            </div>
          )}

          <button
            onClick={() => setIsSearchOpen(!isSearchOpen)}
            className={`flex items-center justify-center rounded-full border shadow-sm transition-all cursor-pointer w-8 h-8 ${
              isSearchOpen || searchTerm 
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700' 
                : 'bg-neutral-100/60 text-gray-600 border-neutral-200/40 hover:bg-white'
            }`}
            title="Toggle Search Input"
            id="search-toggle-btn"
          >
            <Search size={15} className="stroke-[2]" />
          </button>
        </div>

      </div>
    </div>
  );
}
