import React from 'react';
import * as Icons from 'lucide-react';
import { SidebarItem } from '../types';
import { SIDEBAR_ITEMS } from '../data';

interface SidebarProps {
  activeSection: string;
  setActiveSection: (id: string) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  onNavigateHome: () => void;
}

export default function Sidebar({
  activeSection,
  setActiveSection,
  selectedTag,
  setSelectedTag,
  onNavigateHome,
}: SidebarProps) {
  
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
        setActiveSection('nextcloud'); // Keep Nextcloud area open when filtering or reset active folder
      }
    } else {
      setSelectedTag(null);
      setActiveSection(item.id);
      if (item.id === 'nextcloud') {
        onNavigateHome();
      }
    }
  };

  return (
    <div className="relative w-[240px] md:w-[250px] bg-gray-100 m-3 rounded-[32px] p-4 pt-5 flex flex-col select-none justify-between">
      
      {/* Top Part: Title with macOS controls */}
      <div className="flex flex-col">
        {/* macOS Window Title bar actions */}
        <div className="flex items-center space-x-2 mb-4 px-1">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all" title="Close" />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all" title="Minimize" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all" title="Zoom" />
        </div>

        {/* Scrollable Nav Area */}
        <div className="overflow-y-auto pr-1 space-y-4 max-h-[calc(100vh-280px)] scrollbar-thin">
          
          {/* Top Unlabeled Items */}
          <div className="space-y-0.5">
            {SIDEBAR_ITEMS.filter(item => !item.isFavorite && !item.isTag).map((item) => {
              const isActive = activeSection === item.id && !selectedTag;
              return (
                <button
                  key={item.id}
                  id={`sidebar-item-${item.id}`}
                  onClick={() => handleItemClick(item)}
                  className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md text-xs text-left transition-colors font-medium
                    ${isActive 
                      ? 'bg-blue-600/10 text-blue-600 font-semibold' 
                      : 'text-gray-600 hover:bg-neutral-200/50 hover:text-gray-900'
                    }`}
                >
                  {renderIcon(item.icon, isActive ? '#2563eb' : undefined, 14)}
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Favorites Header */}
          <div>
            <span className="px-2 text-[9px] font-bold text-gray-400 tracking-wider uppercase block mb-1">
              Favorites
            </span>
            <div className="space-y-0.5">
              {SIDEBAR_ITEMS.filter(item => item.isFavorite).map((item) => {
                const isNextcloudActive = item.id === 'nextcloud' && activeSection === 'nextcloud' && !selectedTag;
                const isGenericActive = activeSection === item.id && !selectedTag;
                const isActive = item.id === 'nextcloud' ? isNextcloudActive : isGenericActive;

                return (
                  <button
                    key={item.id}
                    id={`sidebar-item-${item.id}`}
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md text-xs text-left transition-colors font-medium
                      ${isActive 
                        ? 'bg-blue-600/10 text-blue-600 font-semibold' 
                        : 'text-gray-600 hover:bg-neutral-200/50 hover:text-gray-900'
                      }`}
                  >
                    {renderIcon(item.id === 'nextcloud' ? 'FolderSync' : item.icon, isActive ? '#2563eb' : undefined, 14)}
                    <span className="truncate flex-1">{item.label}</span>
                    {item.badge && (
                      <span className="text-[9px] bg-neutral-300/60 text-neutral-600 font-bold rounded px-1.5 py-0.5">{item.badge}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags Header */}
          <div>
            <div className="flex items-center justify-between px-2 mb-1">
              <span className="text-[9px] font-bold text-gray-400 tracking-wider uppercase block">
                Tags
              </span>
              {selectedTag && (
                <button 
                  onClick={() => setSelectedTag(null)}
                  className="text-[9px] text-blue-500 hover:underline cursor-pointer"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="space-y-0.5">
              {SIDEBAR_ITEMS.filter(item => item.isTag).map((item) => {
                const isActive = selectedTag === item.label;
                return (
                  <button
                    key={item.id}
                    id={`sidebar-item-tag-${item.id}`}
                    onClick={() => handleItemClick(item)}
                    className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md text-xs text-left transition-all font-medium
                      ${isActive 
                        ? 'bg-blue-600/15 text-blue-900 font-semibold' 
                        : 'text-gray-600 hover:bg-neutral-200/50'
                      }`}
                  >
                    <span 
                      className="w-2 h-2 rounded-full flex-shrink-0" 
                      style={{ backgroundColor: item.tagColor }}
                    />
                    <span className="truncate flex-1 text-xs">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

        </div>
      </div>

      {/* Footer Branding or Info */}
      <div className="pt-2.5 border-t border-neutral-200/30 flex items-center justify-between px-1.5 text-neutral-400 text-[10px]">
        <span className="font-semibold text-neutral-500">alyncco@gmail.com</span>
        <span className="opacity-75">Cloud Sync Active</span>
      </div>

      {/* Styled thick vertical scrollbar track/separator visible on right, matching macOS Finder look */}
      <div className="absolute top-1/4 right-[2px] w-[5px] h-1/3 bg-gray-400/30 rounded-full opacity-60 hover:opacity-100 transition-opacity" />
    </div>
  );
}
