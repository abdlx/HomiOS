import React, { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { SidebarItem } from '../types';
import { SIDEBAR_ITEMS as STATIC_ITEMS } from '../data';

interface SidebarProps {
  activeSection: string;
  setActiveSection: (id: string) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  onNavigateHome: () => void;
  onNavigateFolder?: (folderName: string) => void;
  onNavigateStorage?: () => void;
  starredFolders?: SidebarItem[];
  isMobileDrawer?: boolean;
  onCloseDrawer?: () => void;
}

export default function Sidebar({
  activeSection,
  setActiveSection,
  selectedTag,
  setSelectedTag,
  onNavigateHome,
  onNavigateFolder,
  onNavigateStorage,
  starredFolders = [],
  isMobileDrawer = false,
  onCloseDrawer,
}: SidebarProps) {
  const [realFolders, setRealFolders] = useState<SidebarItem[]>([
    { id: 'root', label: 'Root', icon: 'HardDrive', isFavorite: true }
  ]);
  const [shortcuts, setShortcuts] = useState<SidebarItem[]>([]);
  const [serverIp, setServerIp] = useState<string>('Connecting...');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setServerIp(window.location.hostname);
    }
  }, []);

  useEffect(() => {
    fetch('/api/drives/available')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.length >= 0) {
          const drives = data.map((d: any) => ({
            id: d.path || d.label,
            label: d.isMounted === false ? `${d.label} ⚠️ Unmounted` : d.label,
            icon: 'HardDrive',
            path: d.path,
            name: d.name, // raw device name e.g. "sda1"
            isMounted: d.isMounted !== false
          }));
          setRealFolders(drives);
        }
      })
      .catch((err) => console.error('Failed to load drives:', err));

    fetch('/api/system/shortcuts')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.length > 0) {
          setShortcuts(data);
        }
      })
      .catch((err) => console.error('Failed to load shortcuts:', err));
  }, []);

  // Custom helper to dynamically render Lucide icons Safely
  const renderIcon = (iconName: string, color?: string, size = 16) => {
    // Falls back to Folder if icon not found
    const IconComponent = (Icons as any)[iconName] || Icons.Folder;
    return <IconComponent size={size} style={color ? { color } : undefined} className="flex-shrink-0" />;
  };

  const handleItemClick = (item: SidebarItem) => {
    if (item.isTag) {
      if (selectedTag === item.label) {
        setSelectedTag(null); // Toggle off tag filter
      } else {
        setSelectedTag(item.label);
        setActiveSection('root'); // Keep Root area open when filtering
      }
    } else {
      if ((item as any).isMounted === false) {
        const deviceName = (item as any).name || item.label.split(' ')[0];
        const confirmMount = window.confirm(`"${item.label}" is not mounted.\n\nMount /dev/${deviceName} → /mnt/${deviceName}?\n\n(Requires sudo or root privileges)`);
        if (confirmMount) {
          fetch('/api/drives/mount', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ device: deviceName })
          })
          .then(async (res) => {
            const result = await res.json();
            if (result.ok) {
              alert(`✅ Mounted successfully at ${result.mountPoint}`);
              window.location.reload();
            } else {
              alert(`❌ Mount failed:\n\n${result.error}`);
            }
          })
          .catch(() => alert('Error connecting to mount API'));
        }
        return;
      }
      setSelectedTag(null);
      setActiveSection(item.id);
      if (item.id === 'root' || item.id === 'nextcloud') {
        onNavigateHome();
      } else if (onNavigateFolder) {
        onNavigateFolder(item.path || item.label);
      }
    }
    if (isMobileDrawer && onCloseDrawer) {
      onCloseDrawer();
    }
  };

  const rootFolder: SidebarItem = { id: 'root', label: 'Root', icon: 'HardDrive', isFavorite: true, path: '/' };

  return (
    <div className={`relative flex flex-col select-none justify-between bg-white border-neutral-200/50 ${
      isMobileDrawer 
        ? 'w-full h-full p-4 pt-5' 
        : 'hidden md:flex w-[240px] md:w-[250px] border shadow-sm m-3 rounded-[32px] p-4 pt-5'
    }`}>
      
      {/* Top Part: Title with macOS controls */}
      <div className="flex flex-col">
        {/* macOS Window Title bar actions */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center space-x-2">
            <div 
              className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all" 
              title="Close" 
              onClick={onCloseDrawer}
            />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all" title="Minimize" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all" title="Zoom" />
          </div>
          {isMobileDrawer && onCloseDrawer && (
            <button 
              onClick={onCloseDrawer}
              className="p-1 rounded-full hover:bg-neutral-100 text-neutral-500 active:scale-95 transition-all"
            >
              <Icons.X size={16} />
            </button>
          )}
        </div>

        {/* Scrollable Nav Area */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-4 sidebar-scroll min-h-0">
          
          {/* Root Item */}
          <div className="mb-1">
            <button
              onClick={() => handleItemClick(rootFolder)}
              className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors font-medium
                ${activeSection === 'root' 
                  ? 'bg-blue-600/10 text-blue-600 font-bold' 
                  : 'text-gray-600 hover:bg-neutral-200/50 hover:text-gray-900'
                }`}
            >
              {renderIcon(rootFolder.icon, activeSection === 'root' ? '#2563eb' : undefined, 16)}
              <span className="truncate flex-1">{rootFolder.label}</span>
            </button>
          </div>

          {/* System Shortcuts */}
          {shortcuts.length > 0 && (
            <div className="mb-4 space-y-0.5">
              {shortcuts.map((item) => {
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md text-xs text-left transition-colors font-medium pl-6
                      ${isActive 
                        ? 'bg-blue-600/10 text-blue-600 font-semibold' 
                        : 'text-gray-500 hover:bg-neutral-200/50 hover:text-gray-900'
                      }`}
                  >
                    {renderIcon(item.icon, isActive ? '#2563eb' : undefined, 14)}
                    <span className="truncate flex-1">{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Storage Dashboard shortcut */}
          <div className="mb-4">
            <button
              onClick={() => { 
                setActiveSection('storage'); 
                onNavigateStorage?.(); 
                if (isMobileDrawer && onCloseDrawer) onCloseDrawer();
              }}
              className={`w-full flex items-center space-x-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors font-medium
                ${activeSection === 'storage'
                  ? 'bg-blue-600/10 text-blue-600 font-bold'
                  : 'text-gray-600 hover:bg-neutral-200/50 hover:text-gray-900'
                }`}
            >
              {renderIcon('Database', activeSection === 'storage' ? '#2563eb' : undefined, 16)}
              <span className="truncate flex-1">Storage</span>
            </button>
          </div>

          {/* Favorites Header */}
          {starredFolders.length > 0 && (
            <div>
              <span className="px-2 text-[9px] font-bold text-gray-400 tracking-wider uppercase block mb-1">
                Favorites
              </span>
              <div className="space-y-0.5">
                {starredFolders.map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleItemClick(item)}
                      className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md text-xs text-left transition-colors font-medium
                        ${isActive 
                          ? 'bg-blue-600/10 text-blue-600 font-semibold' 
                          : 'text-gray-600 hover:bg-neutral-200/50 hover:text-gray-900'
                        }`}
                    >
                      {renderIcon(item.icon, isActive ? '#2563eb' : undefined, 14)}
                      <span className="truncate flex-1">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Drives Header */}
          <div>
            <span className="px-2 text-[9px] font-bold text-gray-400 tracking-wider uppercase block mb-1">
              Connected Drives
            </span>
            <div className="space-y-0.5">
              {realFolders.map((item) => {
                const isActive = activeSection === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md text-xs text-left transition-colors font-medium
                      ${isActive 
                        ? 'bg-blue-600/10 text-blue-600 font-semibold' 
                        : 'text-gray-600 hover:bg-neutral-200/50 hover:text-gray-900'
                      }`}
                  >
                    {renderIcon(item.icon, isActive ? '#2563eb' : undefined, 14)}
                    <span className="truncate flex-1">{item.label}</span>
                  </button>
                );
              })}
              
              {realFolders.length === 0 && (
                <div className="px-2 py-2 text-xs text-gray-400 italic">No connected drives</div>
              )}
            </div>
          </div>

          {/* Tags Header */}
          <div className="mt-4">
            <span className="px-2 text-[9px] font-bold text-gray-400 tracking-wider uppercase block mb-1">
              Tags
            </span>
            <div className="space-y-0.5">
              {[
                { id: 'Red', color: 'bg-red-500' },
                { id: 'Orange', color: 'bg-orange-500' },
                { id: 'Yellow', color: 'bg-yellow-500' },
                { id: 'Green', color: 'bg-green-500' },
                { id: 'Blue', color: 'bg-blue-500' },
                { id: 'Purple', color: 'bg-purple-500' },
                { id: 'Gray', color: 'bg-gray-500' },
              ].map((tag) => {
                const isActive = selectedTag === tag.id;
                return (
                  <button
                    key={tag.id}
                    onClick={() => handleItemClick({ id: tag.id, label: tag.id, icon: 'Circle', isTag: true } as any)}
                    className={`w-full flex items-center space-x-2.5 px-2 py-1 rounded-md text-xs text-left transition-colors font-medium
                      ${isActive 
                        ? 'bg-neutral-200/60 text-gray-900 font-bold' 
                        : 'text-gray-600 hover:bg-neutral-200/50 hover:text-gray-900'
                      }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full shadow-sm flex-shrink-0 ${tag.color}`} />
                    <span className="truncate flex-1">{tag.id}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer Branding or Info */}
      <div className="pt-2.5 border-t border-neutral-200/30 flex items-center justify-between px-1.5 text-neutral-400 text-[10px]">
        <span className="font-semibold text-neutral-500">{serverIp}</span>
        <span className="opacity-75">Cloud Sync Active</span>
      </div>

    </div>
  );
}
