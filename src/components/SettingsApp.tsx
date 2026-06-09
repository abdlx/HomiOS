import React, { useState } from 'react';
import { useWallpaper } from '../hooks/useWallpaper';
import { Settings, Monitor, Users, Wifi, Info, CheckCircle2 } from 'lucide-react';

interface SettingsAppProps {
  onClose?: () => void;
}

const WALLPAPERS = [
  "https://images.unsplash.com/photo-1552083375-1447ce886485?q=80&w=1470&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1682685797208-c741d58c2eff?q=80&w=1470&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1491466424936-e304919aada7?q=80&w=1469&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1482784160316-6eb046863ece?q=80&w=1470&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1501854140801-50d01698950b?q=80&w=1575&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1499678329028-101435549a4e?q=80&w=1470&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1511300636408-a63a89df3482?q=80&w=1470&auto=format&fit=crop",
  "https://images.unsplash.com/photo-1485470733090-0aae1788d5af?q=80&w=1517&auto=format&fit=crop"
];

export default function SettingsApp({ onClose }: SettingsAppProps) {
  const [activeTab, setActiveTab] = useState('appearance');
  const { wallpaper, changeWallpaper } = useWallpaper();

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'appearance', label: 'Appearance', icon: Monitor },
    { id: 'users', label: 'Users & Groups', icon: Users },
    { id: 'network', label: 'Network', icon: Wifi },
    { id: 'about', label: 'About', icon: Info },
  ];

  return (
    <div className="h-full w-full flex select-none overflow-hidden bg-gray-50 font-sans text-slate-800" onContextMenu={(e) => e.preventDefault()}>
      
      {/* Sidebar */}
      <div className="flex flex-col bg-white border-r border-neutral-200/50 w-[240px] md:w-[250px] shadow-sm m-3 rounded-[32px] p-4 pt-5 z-10">
        <div className="flex items-center space-x-2 mb-8 px-1">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all" title="Close" onClick={() => { if (onClose) onClose(); else window.location.href = '/dashboard'; }} />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all" title="Minimize" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all" title="Zoom" />
        </div>

        <div className="flex flex-col space-y-1">
          <span className="px-3 text-xs font-bold text-slate-400 mb-2 mt-2 tracking-wider">SYSTEM SETTINGS</span>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-3 px-3 py-2 rounded-xl transition-all text-sm font-medium ${
                activeTab === tab.id 
                  ? 'bg-blue-500/10 text-blue-600' 
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <tab.icon size={18} strokeWidth={2} className={activeTab === tab.id ? 'text-blue-500' : 'text-slate-400'} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden relative">
        <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-gray-50 to-transparent pointer-events-none z-10" />
        
        <div className="flex-1 overflow-y-auto pt-10 px-12 pb-24 z-0">
          <h1 className="text-3xl font-semibold tracking-tight text-slate-800 mb-8">{tabs.find(t => t.id === activeTab)?.label}</h1>
          
          {activeTab === 'appearance' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Wallpaper Preview */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <h3 className="text-lg font-semibold mb-4 text-slate-800">Current Wallpaper</h3>
                <div className="w-full aspect-video rounded-2xl overflow-hidden shadow-inner border border-black/5 relative group">
                  <img src={wallpaper} alt="Wallpaper Preview" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                </div>
              </div>

              {/* Wallpaper Grid */}
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <h3 className="text-lg font-semibold mb-4 text-slate-800">Choose Wallpaper</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {WALLPAPERS.map((wp, i) => (
                    <div 
                      key={i} 
                      onClick={() => changeWallpaper(wp)}
                      className={`relative aspect-video rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                        wallpaper === wp ? 'border-blue-500 scale-105 shadow-md z-10' : 'border-transparent hover:border-blue-300 hover:scale-[1.02]'
                      }`}
                    >
                      <img src={wp} alt={`Wallpaper option ${i+1}`} className="w-full h-full object-cover" />
                      {wallpaper === wp && (
                        <div className="absolute bottom-2 right-2 bg-blue-500 rounded-full p-0.5 text-white shadow-sm">
                          <CheckCircle2 size={16} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab !== 'appearance' && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 space-y-4 animate-in fade-in duration-500">
              <Settings size={48} className="opacity-20" />
              <p className="font-medium text-lg">These settings are managed by the administrator.</p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
