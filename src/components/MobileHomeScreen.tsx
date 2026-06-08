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
  Cloud,
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
  const primaryDrive = drives.find(d => d.path === '/' || d.label.toLowerCase() === 'root') || drives[0];
  const usagePct = primaryDrive?.usagePercent ?? 45;
  const totalSize = primaryDrive?.size ?? '128 GB';
  const usedSpace = primaryDrive?.usedBytes ?? '57.6 GB';

  const handleCategoryClick = (categoryLabel: string) => {
    const match = shortcuts.find(s => 
      s.label.toLowerCase() === categoryLabel.toLowerCase() ||
      s.label.toLowerCase().includes(categoryLabel.toLowerCase())
    );

    if (match && match.path) {
      onNavigateShortcut(match.path);
    } else {
      if (categoryLabel.toLowerCase() === 'favorites') {
        onNavigateTab('favorites');
      } else {
        onNavigateTab('files');
      }
    }
  };

  const categories = [
    { name: 'Downloads', icon: Download, color: '#007aff', bg: '#007aff' },
    { name: 'Documents', icon: FileText, color: '#ff9500', bg: '#ff9500' },
    { name: 'Images', icon: ImageIcon, color: '#34c759', bg: '#34c759' },
    { name: 'Videos', icon: Video, color: '#af52de', bg: '#af52de' },
    { name: 'Music', icon: Music, color: '#ff2d55', bg: '#ff2d55' },
    { name: 'Favorites', icon: Star, color: '#ffcc00', bg: '#ffcc00' },
  ];

  const getFileIcon = (file: FileItem) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (['mp4', 'mkv', 'avi', 'mov', 'webm'].includes(ext)) return <Video size={20} className="text-[#af52de]" />;
    if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'].includes(ext)) return <ImageIcon size={20} className="text-[#007aff]" />;
    if (['mp3', 'wav', 'flac', 'ogg'].includes(ext)) return <Music size={20} className="text-[#ff2d55]" />;
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'go', 'html', 'css', 'json', 'sh'].includes(ext)) return <FileText size={20} className="text-[#34c759]" />;
    return <FileText size={20} className="text-[#8e8e93]" />;
  };

  return (
    <div className="flex-1 bg-[#f2f2f7] overflow-y-auto px-4 py-6 space-y-6 pb-[90px]">
      
      {/* Storage Section */}
      <div>
        <h2 className="text-[22px] font-bold text-black mb-3 px-1 tracking-tight">Storage</h2>
        <div className="bg-white rounded-[10px] overflow-hidden">
          <button 
            onClick={onNavigateStorage}
            className="w-full flex items-center px-4 py-3 active:bg-[#e5e5ea] transition-colors"
          >
            <div className="w-8 h-8 rounded-md bg-[#8e8e93] flex items-center justify-center flex-shrink-0">
              <Database size={20} color="white" />
            </div>
            <div className="ml-4 flex-1 text-left">
              <p className="text-[17px] font-normal text-black">Internal Storage</p>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 bg-[#e5e5ea] rounded-full overflow-hidden">
                  <div className="h-full bg-[#007aff] rounded-full" style={{ width: `${usagePct}%` }} />
                </div>
                <span className="text-[13px] text-[#8e8e93] whitespace-nowrap">{usagePct}%</span>
              </div>
            </div>
            <ChevronRight size={20} className="text-[#c6c6c8] ml-2" />
          </button>
        </div>
      </div>

      {/* Locations / Categories Section */}
      <div>
        <h2 className="text-[22px] font-bold text-black mb-3 px-1 tracking-tight">Locations</h2>
        <div className="bg-white rounded-[10px] overflow-hidden">
          {categories.map((cat, index) => {
            const Icon = cat.icon;
            return (
              <React.Fragment key={cat.name}>
                <button
                  onClick={() => handleCategoryClick(cat.name)}
                  className="w-full flex items-center px-4 py-2.5 active:bg-[#e5e5ea] transition-colors"
                >
                  <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.bg }}>
                    <Icon size={16} color="white" strokeWidth={2} />
                  </div>
                  <div className="ml-4 flex-1 text-left flex items-center justify-between">
                    <span className="text-[17px] font-normal text-black">{cat.name}</span>
                    <ChevronRight size={20} className="text-[#c6c6c8]" />
                  </div>
                </button>
                {index < categories.length - 1 && (
                  <div className="ml-[56px] border-b border-[#c6c6c8]" />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Recent Files Section */}
      <div>
        <h2 className="text-[22px] font-bold text-black mb-3 px-1 tracking-tight">Recent</h2>
        {recentFiles.length === 0 ? (
          <div className="bg-white rounded-[10px] p-6 text-center text-[15px] text-[#8e8e93]">
            No recent files
          </div>
        ) : (
          <div className="bg-white rounded-[10px] overflow-hidden">
            {recentFiles.slice(0, 5).map((file, index) => (
              <React.Fragment key={file.id}>
                <button
                  onClick={() => onOpenFile(file)}
                  className="w-full flex items-center px-4 py-3 active:bg-[#e5e5ea] transition-colors"
                >
                  <div className="flex-shrink-0">
                    {getFileIcon(file)}
                  </div>
                  <div className="ml-4 flex-1 text-left min-w-0 flex items-center justify-between">
                    <div className="min-w-0 pr-4">
                      <p className="text-[17px] font-normal text-black truncate">{file.name}</p>
                      <p className="text-[13px] text-[#8e8e93] mt-0.5">
                        {file.size} &bull; {file.updatedAt}
                      </p>
                    </div>
                    <ChevronRight size={20} className="text-[#c6c6c8] flex-shrink-0" />
                  </div>
                </button>
                {index < recentFiles.length - 1 && (
                  <div className="ml-[52px] border-b border-[#c6c6c8]" />
                )}
              </React.Fragment>
            ))}
            <button 
              onClick={() => onNavigateTab('files')}
              className="w-full py-3 text-center text-[15px] text-[#007aff] active:bg-[#e5e5ea] transition-colors"
            >
              See All Recent Files
            </button>
          </div>
        )}
      </div>

      {/* Server Status Section */}
      <div className="mt-8 mb-4 flex justify-center">
        <div className="flex items-center gap-2 text-[#8e8e93] text-[13px]">
          <Cloud size={16} />
          <span>Connected to {serverIp}</span>
        </div>
      </div>

    </div>
  );
}
