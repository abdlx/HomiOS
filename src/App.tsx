/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import FileArea from './components/FileArea';
import QuickLookModal from './components/QuickLookModal';
import { FileItem, ViewMode } from './types';
import { INITIAL_FILES, SUBFOLDER_CONTENTS } from './data';

interface HistoryState {
  path: string[];
  files: FileItem[];
}

export default function App() {
  // Files list inside the current directory level
  const [currentFiles, setCurrentFiles] = useState<FileItem[]>(INITIAL_FILES);
  
  // Active selected file card ID (starts with 'folder-2' representing "Notes" folder checked, matching image specification!)
  const [selectedFileId, setSelectedFileId] = useState<string | null>('folder-2');

  // Breadcrumb directory stack paths
  const [currentPath, setCurrentPath] = useState<string[]>(['Nextcloud']);
  
  // Browser History simulation stack
  const [history, setHistory] = useState<HistoryState[]>([
    { path: ['Nextcloud'], files: INITIAL_FILES }
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  // Layout View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Sorting state
  const [sortOption, setSortOption] = useState<string>('name');

  // Interactive filtration state
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Left sidebar selector option
  const [activeSection, setActiveSection] = useState<string>('nextcloud');

  // Modal display controllers
  const [quickLookFile, setQuickLookFile] = useState<FileItem | null>(null);

  // Keypress event handler: Open Quick Look with SPACEBAR
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If Spacebar is pressed and we have an active selected card
      if (e.code === 'Space' && selectedFileId) {
        const item = currentFiles.find(f => f.id === selectedFileId);
        // Unless we are currently typing inside inputs
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (item) {
            setQuickLookFile(item);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFileId, currentFiles]);

  // Navigate back/forward through virtual folders
  const handleNavigateBack = () => {
    if (historyIndex > 0) {
      const prevIdx = historyIndex - 1;
      setHistoryIndex(prevIdx);
      setCurrentPath(history[prevIdx].path);
      setCurrentFiles(history[prevIdx].files);
      setSelectedFileId(null);
    }
  };

  const handleNavigateForward = () => {
    if (historyIndex < history.length - 1) {
      const nextIdx = historyIndex + 1;
      setHistoryIndex(nextIdx);
      setCurrentPath(history[nextIdx].path);
      setCurrentFiles(history[nextIdx].files);
      setSelectedFileId(null);
    }
  };

  // Navigating into directories
  const handleFileDoubleClick = (file: FileItem) => {
    if (file.type === 'folder') {
      // Update historical paths
      const newPath = [...currentPath, file.name];
      // Lookup folder custom mock records or fallback
      const subContents = SUBFOLDER_CONTENTS[file.name] || [];
      const newFilesState = subContents;

      // Append state & truncate forward history branches
      const truncatedHistory = history.slice(0, historyIndex + 1);
      const updatedHistory = [...truncatedHistory, { path: newPath, files: newFilesState }];
      
      setHistory(updatedHistory);
      setHistoryIndex(updatedHistory.length - 1);
      setCurrentPath(newPath);
      setCurrentFiles(newFilesState);
      setSelectedFileId(null);
    } else {
      // Is standard binary file -> Open rich macOS Quick Look modal!
      setQuickLookFile(file);
    }
  };

  // Reset to Nextcloud Root node
  const handleNavigateHome = () => {
    if (currentPath.length > 1) {
      const updated = [...history, { path: ['Nextcloud'], files: INITIAL_FILES }];
      setHistory(updated);
      setHistoryIndex(updated.length - 1);
      setCurrentPath(['Nextcloud']);
      setCurrentFiles(INITIAL_FILES);
      setSelectedFileId('folder-2'); // Reset Notes focus
    }
  };

  // Adding simulated assets directly in the client database list
  const handleAddNewFile = (name: string, type: 'document' | 'text' | 'image' = 'text') => {
    const fresh: FileItem = {
      id: `custom-file-${Date.now()}`,
      name: name.includes('.') ? name : `${name}.txt`,
      type: type === 'image' ? 'image' : 'document',
      size: '14 KB',
      updatedAt: new Date().toISOString().split('T')[0],
      thumbnailUrl: type === 'image' ? 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=300&q=80' : undefined,
      content: `# ${name}\n\nThis is a newly created responsive node in Nextcloud. Edit it using macOS Quick Look!`,
      tags: []
    };

    const nextFilesState = [...currentFiles, fresh];
    setCurrentFiles(nextFilesState);

    // Update active history item
    const nextHistory = [...history];
    nextHistory[historyIndex].files = nextFilesState;
    setHistory(nextHistory);
    setSelectedFileId(fresh.id);
  };

  const handleAddNewFolder = (name: string, folderColor: 'blue' | 'orange' | 'green' = 'blue') => {
    const fresh: FileItem = {
      id: `custom-fol-${Date.now()}`,
      name: name,
      type: 'folder',
      size: '0 items',
      updatedAt: new Date().toISOString().split('T')[0],
      folderColor: folderColor
    };

    const nextFilesState = [...currentFiles, fresh];
    setCurrentFiles(nextFilesState);

    const nextHistory = [...history];
    nextHistory[historyIndex].files = nextFilesState;
    setHistory(nextHistory);
    setSelectedFileId(fresh.id);
  };

  // Editing file attributes (e.g. rename or text contents updates inside Quick Look)
  const handleUpdateFile = (updated: FileItem) => {
    const nextFilesState = currentFiles.map(f => f.id === updated.id ? updated : f);
    setCurrentFiles(nextFilesState);

    const nextHistory = [...history];
    nextHistory[historyIndex].files = nextFilesState;
    setHistory(nextHistory);
  };

  // Removing items dynamically
  const handleDeleteFile = (id: string) => {
    const nextFilesState = currentFiles.filter(f => f.id !== id);
    setCurrentFiles(nextFilesState);

    const nextHistory = [...history];
    nextHistory[historyIndex].files = nextFilesState;
    setHistory(nextHistory);

    if (selectedFileId === id) {
      setSelectedFileId(null);
    }
  };

  // Handle simulated drag and drop inputs
  const handleUploadSimulate = (payload: { name: string; type: 'document' | 'image' }) => {
    handleAddNewFile(payload.name, payload.type);
  };

  // Metric parsing helper to sort files accurately by capacity counts
  const parseSizeToVal = (sizeStr: string): number => {
    const stripped = sizeStr.toLowerCase().trim();
    if (stripped.includes('items')) {
      return parseInt(stripped) || 0;
    }
    const num = parseFloat(stripped);
    if (isNaN(num)) return 0;
    if (stripped.includes('mb')) return num * 1024 * 1024;
    if (stripped.includes('kb')) return num * 1024;
    return num;
  };

  // Sorting and filtering computing steps
  const processedFiles = currentFiles
    .filter((file) => {
      // 1. Tag filtering from Left Sidebar selection
      if (selectedTag) {
        return file.tags?.includes(selectedTag);
      }
      return true;
    })
    .filter((file) => {
      // 2. Direct name keyword matching
      if (searchTerm.trim()) {
        return file.name.toLowerCase().includes(searchTerm.toLowerCase().trim());
      }
      return true;
    })
    .sort((a, b) => {
      // 3. User selected sort parameters
      if (sortOption === 'size') {
        return parseSizeToVal(b.size) - parseSizeToVal(a.size);
      }
      if (sortOption === 'date') {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return dateB - dateA;
      }
      // Defaults to alphabetical name
      return a.name.localeCompare(b.name);
    });

  const canNavigateBack = historyIndex > 0;
  const canNavigateForward = historyIndex < history.length - 1;

  return (
    <div className="h-screen w-full flex flex-col select-none overflow-hidden bg-white">
      {/* MAIN APPLICATION WINDOW WINDOW CONTAINER */}
      <main className="flex-1 w-full flex overflow-hidden bg-white">
        
        {/* Left Nav Navigation Sidebar Section */}
        <Sidebar
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          selectedTag={selectedTag}
          setSelectedTag={setSelectedTag}
          onNavigateHome={handleNavigateHome}
        />

        {/* Master Right Panel Flow (Pill Header + Active Client Directory Canvas) */}
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
          
          {/* Header Action with Separators ("Floating Island") */}
          <Toolbar
            currentPath={currentPath}
            onNavigateBack={handleNavigateBack}
            onNavigateForward={handleNavigateForward}
            canNavigateBack={canNavigateBack}
            canNavigateForward={canNavigateForward}
            viewMode={viewMode}
            setViewMode={setViewMode}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onAddNewFile={handleAddNewFile}
            onAddNewFolder={handleAddNewFolder}
            sortOption={sortOption}
            setSortOption={setSortOption}
          />

          {/* Files Grid and Multi-mode Canvas area */}
          <FileArea
            files={processedFiles}
            selectedFileId={selectedFileId}
            setSelectedFileId={setSelectedFileId}
            onFileDoubleClick={handleFileDoubleClick}
            onDeleteFile={handleDeleteFile}
            onUploadSimulate={handleUploadSimulate}
            viewMode={viewMode}
            currentPath={currentPath}
          />
          
        </div>
        
      </main>

      {/* Quick Look Details Dialog layer */}
      {quickLookFile && (
        <QuickLookModal
          file={quickLookFile}
          onClose={() => setQuickLookFile(null)}
          onUpdateFile={handleUpdateFile}
          onDelete={handleDeleteFile}
        />
      )}
    </div>
  );
}
