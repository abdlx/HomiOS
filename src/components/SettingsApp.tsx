import React, { useState, useEffect } from 'react';
import { useWallpaper } from '../hooks/useWallpaper';
import { useUsername } from '../hooks/useUsername';
import { 
  Settings, Monitor, Users, Wifi, Info, CheckCircle2, 
  HardDrive, Shield, Globe, UserPlus, Database, ShieldCheck, Cpu, Server
} from 'lucide-react';

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
  const [activeTab, setActiveTab] = useState('general');
  const { wallpaper, changeWallpaper } = useWallpaper();
  const { username, changeUsername } = useUsername();
  const [sysStats, setSysStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/system/stats')
      .then(res => res.json())
      .then(data => setSysStats(data))
      .catch(console.error);
    
    fetch('/api/users')
      .then(res => res.json())
      .then(data => setUsers(data))
      .catch(console.error);
  }, []);

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'appearance', label: 'Appearance', icon: Monitor },
    { id: 'users', label: 'Users & Groups', icon: Users },
    { id: 'network', label: 'Network', icon: Wifi },
    { id: 'storage', label: 'Storage', icon: HardDrive },
    { id: 'security', label: 'Security & Updates', icon: Shield },
    { id: 'about', label: 'About', icon: Info },
  ];

  return (
    <div className="h-full w-full flex select-none overflow-hidden bg-gray-50 font-sans text-slate-800" onContextMenu={(e) => e.preventDefault()}>
      
      {/* Sidebar */}
      <div className="flex flex-col bg-white border-r border-neutral-200/50 w-[240px] md:w-[250px] shadow-sm m-3 rounded-[32px] p-4 pt-5 z-10 flex-shrink-0">
        <div className="flex items-center space-x-2 mb-8 px-1">
          <div className="w-3 h-3 rounded-full bg-[#ff5f56] border border-[#e0443e] cursor-pointer hover:brightness-90 transition-all" title="Close" onClick={() => { if (onClose) onClose(); else window.location.href = '/dashboard'; }} />
          <div className="w-3 h-3 rounded-full bg-[#ffbd2e] border border-[#dfa123] cursor-pointer hover:brightness-90 transition-all" title="Minimize" />
          <div className="w-3 h-3 rounded-full bg-[#27c93f] border border-[#1aab29] cursor-pointer hover:brightness-90 transition-all" title="Zoom" />
        </div>

        <div className="flex flex-col space-y-1 overflow-y-auto pb-4">
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
          
          {/* GENERAL TAB */}
          {activeTab === 'general' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-500">
                    <Server size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">System Information</h3>
                    <p className="text-sm text-slate-500">Device identity and localization</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-3 items-center gap-4 border-b border-slate-100 pb-4">
                    <label className="text-sm font-medium text-slate-600">Username</label>
                    <div className="col-span-2">
                      <input 
                        type="text" 
                        value={username} 
                        onChange={(e) => changeUsername(e.target.value)}
                        placeholder="Enter your name"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-800" 
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 items-center gap-4 border-b border-slate-100 pb-4">
                    <label className="text-sm font-medium text-slate-600">Hostname</label>
                    <div className="col-span-2">
                      <input type="text" value={sysStats?.os?.hostname || 'Loading...'} readOnly className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-500 cursor-default" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 items-center gap-4 border-b border-slate-100 pb-4">
                    <label className="text-sm font-medium text-slate-600">Language</label>
                    <div className="col-span-2">
                      <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" defaultValue="en-us">
                        <option value="en-us">English (US)</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 items-center gap-4">
                    <label className="text-sm font-medium text-slate-600">Timezone</label>
                    <div className="col-span-2">
                      <select className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" defaultValue="local">
                        <option value="local">{Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time'}</option>
                        <option value="utc">UTC - Coordinated Universal Time</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* APPEARANCE TAB */}
          {activeTab === 'appearance' && (
            <div className="flex flex-col lg:flex-row items-start gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex-1 bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50 sticky top-0 z-10">
                <h3 className="text-lg font-semibold mb-4 text-slate-800">Current Wallpaper</h3>
                <div className="w-full aspect-video rounded-2xl overflow-hidden shadow-inner border border-black/5 relative group">
                  <img src={wallpaper} alt="Wallpaper Preview" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
                </div>
              </div>

              <div className="flex-1 bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <h3 className="text-lg font-semibold mb-4 text-slate-800">Choose Wallpaper</h3>
                <div className="grid grid-cols-2 gap-4">
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

          {/* USERS & GROUPS TAB */}
          {activeTab === 'users' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center text-orange-500">
                      <Users size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-slate-800">System Users</h3>
                      <p className="text-sm text-slate-500">Manage accounts and permissions</p>
                    </div>
                  </div>
                  <button className="flex items-center space-x-2 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors text-sm font-medium">
                    <UserPlus size={16} />
                    <span>Add User</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {users.map((user: any) => (
                    <div key={user.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors cursor-pointer">
                      <div className="flex items-center space-x-4">
                        <img src={`https://ui-avatars.com/api/?name=${user.email}&background=0D8ABC&color=fff`} className="w-10 h-10 rounded-full" alt={user.email} />
                        <div>
                          <p className="font-semibold text-slate-800">{user.email.split('@')[0]}</p>
                          <p className="text-xs text-slate-500">{user.email} • Admin</p>
                        </div>
                      </div>
                      <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">Active</span>
                    </div>
                  ))}
                  {users.length === 0 && (
                    <div className="p-4 text-center text-slate-500 text-sm">Loading users...</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* NETWORK TAB */}
          {activeTab === 'network' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center text-green-500">
                    <Globe size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">Network Interfaces</h3>
                    <p className="text-sm text-slate-500">IP assignment and routing</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {!sysStats?.network && (
                    <div className="text-center text-sm text-slate-500">Loading interfaces...</div>
                  )}
                  {sysStats?.network && Object.keys(sysStats.network).map((ifaceName) => {
                    const addrs = sysStats.network[ifaceName];
                    const ipv4 = addrs.find((a: any) => a.family === 'IPv4');
                    if (!ipv4) return null;
                    const isLoopback = ipv4.internal;
                    return (
                      <div key={ifaceName} className={`p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex items-center justify-between ${isLoopback ? 'opacity-60' : ''}`}>
                        <div className="flex items-center space-x-4">
                          <div className={`w-3 h-3 rounded-full ${isLoopback ? 'bg-slate-300' : 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-pulse'}`} />
                          <div>
                            <p className="font-semibold text-slate-800">{ifaceName}</p>
                            <p className="text-sm text-slate-500">{isLoopback ? 'Internal' : 'Connected'} • {ipv4.address}</p>
                          </div>
                        </div>
                        <button className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors">Configure</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STORAGE TAB */}
          {activeTab === 'storage' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center text-purple-500">
                    <Database size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-800">Storage & Volumes</h3>
                    <p className="text-sm text-slate-500">Disks, mounts, and quotas</p>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="font-semibold text-slate-700 flex items-center"><HardDrive size={16} className="mr-2 text-slate-400" /> System Volume (/)</span>
                      <span className="text-slate-500">
                        {sysStats ? `${(sysStats.disk.used / (1024 ** 3)).toFixed(1)} GB / ${(sysStats.disk.total / (1024 ** 3)).toFixed(1)} GB (${((sysStats.disk.used / sysStats.disk.total) * 100).toFixed(1)}% used)` : 'Loading...'}
                      </span>
                    </div>
                    <div className="w-full h-4 bg-slate-100 rounded-full overflow-hidden border border-black/5">
                      <div className="h-full bg-purple-500 rounded-full transition-all duration-1000" style={{ width: sysStats ? `${(sysStats.disk.used / sysStats.disk.total) * 100}%` : '0%' }} />
                    </div>
                    <p className="text-xs text-slate-400">Mount: /</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECURITY & UPDATES TAB */}
          {activeTab === 'security' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-3xl p-8 shadow-sm border border-neutral-200/50 flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 mb-4">
                  <ShieldCheck size={40} />
                </div>
                <h3 className="text-2xl font-bold text-slate-800 mb-2">System is up to date</h3>
                <p className="text-slate-500 mb-6">OpenFinder OS 1.0.4 • Last checked today at {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                
                <button className="bg-slate-800 text-white px-6 py-2.5 rounded-xl hover:bg-slate-700 transition-colors font-medium">
                  Check for Updates
                </button>
              </div>

              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">Security Preferences</h3>
                <div className="space-y-4 text-sm">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <p className="font-semibold text-slate-700 text-base">SSH Access</p>
                      <p className="text-slate-500">Allow remote terminal access</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                    </label>
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <div>
                      <p className="font-semibold text-slate-700 text-base">Firewall</p>
                      <p className="text-slate-500">Block incoming unauthorized traffic</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ABOUT TAB */}
          {activeTab === 'about' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-3xl p-10 shadow-sm border border-neutral-200/50 flex flex-col items-center text-center relative overflow-hidden">
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl mb-6 flex items-center justify-center text-white relative z-10">
                  <Cpu size={48} />
                </div>
                <h3 className="text-3xl font-bold text-slate-800 mb-1 relative z-10">OpenFinder OS</h3>
                <p className="text-slate-500 font-medium mb-8 relative z-10">Version 1.0.4 (Build 24E214)</p>
                
                <div className="w-full max-w-sm border-t border-slate-100 pt-8 text-sm text-slate-600 space-y-4 relative z-10">
                  <div className="flex justify-between"><span className="font-semibold text-slate-800">Processor</span> <span>{sysStats?.cpu?.model || 'Loading...'}</span></div>
                  <div className="flex justify-between"><span className="font-semibold text-slate-800">Memory</span> <span>{sysStats ? `${(sysStats.memory.total / (1024 ** 3)).toFixed(1)} GB` : 'Loading...'}</span></div>
                  <div className="flex justify-between"><span className="font-semibold text-slate-800">Platform</span> <span className="capitalize">{sysStats?.os?.platform || 'Loading...'} {sysStats?.os?.arch}</span></div>
                  <div className="flex justify-between"><span className="font-semibold text-slate-800">Hostname</span> <span>{sysStats?.os?.hostname || 'Loading...'}</span></div>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

    </div>
  );
}
