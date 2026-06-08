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

export default function App() {
  const [currentFiles, setCurrentFiles] = useState<FileItem[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [pathHistory, setPathHistory] = useState<string[][]>([['Root']]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const currentPath = pathHistory[historyIndex];
  const [loading, setLoading] = useState(false);

  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortOption, setSortOption] = useState<string>('name');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('nextcloud');
  const [quickLookFile, setQuickLookFile] = useState<FileItem | null>(null);
  const [fileMetadata, setFileMetadata] = useState<Record<string, { tags?: string[], folderColor?: string }>>({});

  useEffect(() => {
    const saved = localStorage.getItem('fileMetadata');
    if (saved) setFileMetadata(JSON.parse(saved));
  }, []);

  const updateFileMetadata = (fileId: string, updates: any) => {
    setFileMetadata((prev) => {
      const newMeta = { ...prev, [fileId]: { ...prev[fileId], ...updates } };
      localStorage.setItem('fileMetadata', JSON.stringify(newMeta));
      return newMeta;
    });
  };

  useEffect(() => {
    loadFiles();
  }, [currentPath]);

  const getApiPath = () => {
    if (currentPath.length === 0) return '';
    if (currentPath[0] === 'Home' || currentPath[0] === 'Root') {
      return currentPath.slice(1).join('/');
    }
    return currentPath.join('/');
  };

  const loadFiles = async () => {
    setLoading(true);
    const apiPath = getApiPath();
    try {
      const res = await fetch(`/api/files?path=/${apiPath}`);
      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (res.ok) {
        const data = await res.json();
        const formatted: FileItem[] = data.map((file: any) => ({
          id: file.path || file.name,
          name: file.name,
          type: file.isDir ? 'folder' : (file.name.match(/\.(jpg|png|jpeg|gif)$/i) ? 'image' : (file.name.match(/\.(txt|md)$/i) ? 'text' : 'document')),
          size: file.isDir ? '--' : `${(file.size / 1024).toFixed(1)} KB`,
          updatedAt: file.modified ? file.modified.split('T')[0] : new Date().toISOString().split('T')[0],
          folderColor: 'blue',
        }));
        setCurrentFiles(formatted);
      } else {
        setCurrentFiles([]);
      }
    } catch (e) {
      console.error(e);
      setCurrentFiles([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && selectedFileId) {
        const item = currentFiles.find(f => f.id === selectedFileId);
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (item) setQuickLookFile(item);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFileId, currentFiles]);

  const pushPath = (newPath: string[]) => {
    const newHistory = pathHistory.slice(0, historyIndex + 1);
    newHistory.push(newPath);
    setPathHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setSelectedFileId(null);
  };

  const handleNavigateBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setSelectedFileId(null);
    }
  };

  const handleNavigateForward = () => {
    if (historyIndex < pathHistory.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setSelectedFileId(null);
    }
  };

  const handleFileDoubleClick = (file: FileItem) => {
    if (file.type === 'folder') {
      pushPath([...currentPath, file.name]);
    } else {
      setQuickLookFile(file);
    }
  };

  const handleNavigateHome = () => {
    pushPath(['Root']);
  };

  const handleAddNewFile = async (name: string, type: 'document' | 'text' | 'image' = 'text') => {
    const apiPath = getApiPath();
    const fullName = name.includes('.') ? name : `${name}.txt`;
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/${apiPath}/${fullName}`, content: `# ${fullName}\n\nCreated from UI!` })
    });
    if (res.ok) loadFiles();
  };

  const handleAddNewFolder = async (name: string) => {
    const apiPath = getApiPath();
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/${apiPath}/${name}`, isDir: true })
    });
    if (res.ok) loadFiles();
  };

  const handleUpdateFile = async (updated: FileItem) => {
    const apiPath = getApiPath();
    const res = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/${apiPath}/${updated.name}`, content: updated.content || '' })
    });
    if (res.ok) loadFiles();
    setQuickLookFile(null);
  };

  const handleDeleteFile = async (id: string) => {
    if (!confirm('Are you sure you want to delete this file?')) return;
    const res = await fetch('/api/files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `/${id}` })
    });
    if (res.ok) {
      if (selectedFileId === id) setSelectedFileId(null);
      loadFiles();
    }
  };

  const handleUploadSimulate = async (payload: { name: string; type: 'document' | 'image' }) => {
    handleAddNewFile(payload.name, payload.type);
  };

  const parseSizeToVal = (sizeStr: string): number => {
    const stripped = sizeStr.toLowerCase().trim();
    if (stripped.includes('--')) return 0;
    const num = parseFloat(stripped);
    if (isNaN(num)) return 0;
    if (stripped.includes('mb')) return num * 1024 * 1024;
    if (stripped.includes('kb')) return num * 1024;
    return num;
  };

  const processedFiles = currentFiles
    .map(file => ({
      ...file,
      tags: fileMetadata[file.id]?.tags || file.tags,
      folderColor: fileMetadata[file.id]?.folderColor || file.folderColor
    }))
    .filter((file) => selectedTag ? file.tags?.includes(selectedTag) : true)
    .filter((file) => searchTerm.trim() ? file.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) : true)
    .sort((a, b) => {
      if (sortOption === 'size') return parseSizeToVal(b.size) - parseSizeToVal(a.size);
      if (sortOption === 'date') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="h-screen w-full flex flex-col select-none overflow-hidden bg-white">
      <main className="flex-1 w-full flex overflow-hidden bg-white">
        <Sidebar
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          selectedTag={selectedTag}
          setSelectedTag={setSelectedTag}
          onNavigateHome={handleNavigateHome}
          onNavigateFolder={(folderName) => {
            pushPath(['Root', folderName]);
          }}
        />
        <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
          <Toolbar
            currentPath={currentPath}
            onNavigateBack={handleNavigateBack}
            onNavigateForward={handleNavigateForward}
            canNavigateBack={historyIndex > 0}
            canNavigateForward={historyIndex < pathHistory.length - 1}
            viewMode={viewMode}
            setViewMode={setViewMode}
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            onAddNewFile={handleAddNewFile}
            onAddNewFolder={handleAddNewFolder}
            sortOption={sortOption}
            setSortOption={setSortOption}
          />
          <FileArea
            files={processedFiles}
            selectedFileId={selectedFileId}
            setSelectedFileId={setSelectedFileId}
            onFileDoubleClick={handleFileDoubleClick}
            onDeleteFile={handleDeleteFile}
            onUploadSimulate={handleUploadSimulate}
            viewMode={viewMode}
            currentPath={currentPath}
            onUpdateMetadata={updateFileMetadata}
          />
        </div>
      </main>
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
