import React from 'react';
import { 
  Download, 
  FileText, 
  Image as ImageIcon, 
  Video, 
  Music, 
  HardDrive, 
  Star, 
  ChevronRight, 
  Clock,
  Sparkles,
  Layers,
  Database
} from 'lucide-react';
import { FileItem, DriveItem, SidebarItem } from '../types';

interface MobileHomeScreenProps {
  drives: DriveItem[];
  shortcuts: SidebarItem[];
  recentFiles: FileItem[];
  onNavigateShortcut: (path: string) => void;
  onNavigateStorage: () => void;
  onNavigateTab: (tab: 'files' | 'favorites' | 'storage') => void;
  onOpenFile: (file: FileItem) => void;
  serverIp: string;
}

export default function MobileHomeScreen({
  drives,
  shortcuts,
  recentFiles,
  onNavigateShortcut,
  onNavigateStorage,
  onNavigateTab,
  onOpenFile,
  serverIp
}: MobileHomeScreenProps) {
  // Try to find the root or first mounted drive for primary storage stats
  const primaryDrive = drives.find(d => d.path === '/' || d.label.toLowerCase() === 'root') || drives[0];
  const usagePct = primaryDrive?.usagePercent ?? 45;
  const totalSize = primaryDrive?.size ?? '128 GB';
  const usedSpace = primaryDrive?.usedBytes ?? '57.6 GB';

  // Helper to match a category click to an actual system shortcut path
  const handleCategoryClick = (categoryLabel: string) => {
    // Look for a shortcut where label matches (case insensitive)
    const match = shortcuts.find(s => 
      s.label.toLowerCase() === categoryLabel.toLowerCase() ||
      s.label.toLowerCase().includes(categoryLabel.toLowerCase())
    );

    if (match && match.path) {
      onNavigateShortcut(match.path);
    } else {
      // Fallback: search tab or root navigate
      if (categoryLabel.toLowerCase() === 'favorites') {
        onNavigateTab('favorites');
      } else {
        // Just navigate to the Files tab under the current root
        onNavigateTab('files');
      }
    }
  };

  const categories = [
    { name: 'Downloads', icon: Download, color: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    { name: 'Documents', icon: FileText, color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
    { name: 'Images', icon: ImageIcon, color: 'bg-green-500/10 text-green-600 border-green-500/20' },
    { name: 'Videos', icon: Video, color: 'bg-purple-500/10 text-purple-600 border-purple-500/20' },
    { name: 'Music', icon: Music, color: 'bg-pink-500/10 text-pink-600 border-pink-500/20' },
    { name: 'Favorites', icon: Star, color: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
  ];

  // Render file extension icons dynamically
  const getFileIcon = (file: FileItem) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return <Video size={16} className="text-purple-500" />;
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return <ImageIcon size={16} className="text-blue-500" />;
    if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) return <Music size={16} className="text-pink-500" />;
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'html', 'css', 'json', 'sh'].includes(ext)) return <FileText size={16} className="text-emerald-500" />;
    return <FileText size={16} className="text-neutral-400" />;
  };

  return (
    <div className="flex-1 bg-neutral-50 overflow-y-auto px-4 py-5 pb-20 space-y-6">
      
      {/* 1. Storage Card */}
      <div className="relative overflow-hidden bg-gradient-to-br from-neutral-900 via-neutral-800 to-indigo-950 text-white rounded-3xl p-5 shadow-lg border border-neutral-800/80">
        {/* Glow effect */}
        <div className="absolute top-[-30px] right-[-30px] w-32 h-32 bg-blue-500/20 rounded-full blur-2xl" />
        
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/10 backdrop-blur-md">
              <Database size={16} className="text-sky-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wide">Internal Storage</h3>
              <p className="text-[10px] text-neutral-400 font-mono">/dev/{primaryDrive?.name || 'sda1'}</p>
            </div>
          </div>
          <span className="text-[10px] font-bold bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full border border-sky-500/30">
            {usagePct}% Used
          </span>
        </div>

        <div className="space-y-2.5">
          <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden border border-white/5">
            <div 
              className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-400 to-indigo-500 transition-all duration-700" 
              style={{ width: `${usagePct}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-neutral-300 font-medium px-0.5">
            <span>{usedSpace} Used</span>
            <span>{totalSize} Total</span>
          </div>
        </div>

        <button 
          onClick={onNavigateStorage}
          className="w-full mt-4 py-2 bg-white/10 hover:bg-white/15 text-white font-semibold text-xs rounded-xl transition-all border border-white/10 flex items-center justify-center space-x-1 backdrop-blur-md"
        >
          <span>Manage Disk Partitioning</span>
          <ChevronRight size={14} />
        </button>
      </div>

      {/* 2. Categories Grid */}
      <div>
        <h3 className="text-xs font-extrabold text-neutral-500 uppercase tracking-wider mb-3 px-1">
          Categories
        </h3>
        <div className="grid grid-cols-3 gap-2.5">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.name}
                onClick={() => handleCategoryClick(cat.name)}
                className="flex flex-col items-center justify-center p-3.5 bg-white border border-neutral-100/80 rounded-2xl shadow-sm hover:shadow-md transition-all group active:scale-95"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${cat.color} mb-2`}>
                  <Icon size={18} className="stroke-[2.2]" />
                </div>
                <span className="text-[10px] font-bold text-neutral-700 truncate w-full text-center">
                  {cat.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Recent Files */}
      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <h3 className="text-xs font-extrabold text-neutral-500 uppercase tracking-wider flex items-center space-x-1">
            <Clock size={12} className="stroke-[2.5]" />
            <span>Recent Files</span>
          </h3>
          <button 
            onClick={() => onNavigateTab('files')}
            className="text-[10px] text-blue-600 font-bold hover:underline"
          >
            See All
          </button>
        </div>

        {recentFiles.length === 0 ? (
          <div className="bg-white border border-neutral-100 rounded-2xl p-6 text-center text-xs text-neutral-400">
            No recent files found in this directory
          </div>
        ) : (
          <div className="bg-white border border-neutral-100 rounded-2xl divide-y divide-neutral-50 shadow-sm overflow-hidden">
            {recentFiles.slice(0, 5).map((file) => (
              <button
                key={file.id}
                onClick={() => onOpenFile(file)}
                className="w-full text-left px-3.5 py-3 flex items-center justify-between hover:bg-neutral-50/50 active:bg-neutral-100/50 transition-colors"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-neutral-50 border border-neutral-100 flex items-center justify-center flex-shrink-0">
                    {getFileIcon(file)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-neutral-800 truncate">
                      {file.name}
                    </p>
                    <p className="text-[9px] text-neutral-400 mt-0.5">
                      {file.size} &bull; {file.updatedAt}
                    </p>
                  </div>
                </div>
                <ChevronRight size={14} className="text-neutral-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. Server Sync Status Widget */}
      <div className="bg-white border border-neutral-100 rounded-2xl p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center">
            <Layers size={16} className="text-emerald-500 animate-pulse" />
          </div>
          <div>
            <p className="text-xs font-bold text-neutral-800">Server Active</p>
            <p className="text-[9px] text-neutral-400">IP: {serverIp}</p>
          </div>
        </div>
        <span className="text-[9px] font-bold bg-emerald-50 border border-emerald-200 text-emerald-600 px-2 py-0.5 rounded-full">
          Sync Online
        </span>
      </div>

    </div>
  );
}
