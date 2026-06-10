import React, { useState, useEffect, useCallback } from 'react';
import { useWallpaper } from '../hooks/useWallpaper';
import { useUsername } from '../hooks/useUsername';
import {
  Settings, Monitor, Users, Wifi, Info, CheckCircle2,
  HardDrive, Shield, Globe, UserPlus, Database, ShieldCheck, Cpu, Server, Menu,
  Key, Bell, Smartphone, Copy, Trash2, Plus, RefreshCw, Eye, EyeOff, Send
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { wallpaper, changeWallpaper } = useWallpaper();
  const { username, changeUsername } = useUsername();
  const [sysStats, setSysStats] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);

  // Teams & Members
  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  // API Tokens
  const [tokens, setTokens] = useState<any[]>([]);
  const [newTokenName, setNewTokenName] = useState('');
  const [newToken, setNewToken] = useState<string | null>(null);

  // Notifications
  const [notifSettings, setNotifSettings] = useState<any[]>([]);
  const [notifChannel, setNotifChannel] = useState('discord');
  const [notifConfig, setNotifConfig] = useState<Record<string, string>>({});

  // 2FA
  const [twoFA, setTwoFA] = useState<any>(null);
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [tfaLoading, setTfaLoading] = useState(false);

  const loadTeam = useCallback(async () => {
    const td = await fetch('/api/teams').then(r => r.ok ? r.json() : null);
    if (!td) return;
    setTeamInfo(td);
    const mid = td.activeTeamId;
    if (mid) {
      const ms = await fetch(`/api/teams/${mid}/members`).then(r => r.ok ? r.json() : []);
      setMembers(ms);
      const ns = await fetch(`/api/teams/${mid}/notifications`).then(r => r.ok ? r.json() : []);
      setNotifSettings(Array.isArray(ns) ? ns : []);
    }
  }, []);

  const loadTokens = useCallback(async () => {
    const t = await fetch('/api/tokens').then(r => r.ok ? r.json() : []);
    setTokens(Array.isArray(t) ? t : []);
  }, []);

  const loadTwoFA = useCallback(async () => {
    const d = await fetch('/api/auth/2fa').then(r => r.ok ? r.json() : null);
    setTwoFA(d);
  }, []);

  useEffect(() => {
    fetch('/api/system/stats').then(res => res.json()).then(setSysStats).catch(console.error);
    fetch('/api/users').then(res => res.json()).then(setUsers).catch(console.error);
    loadTeam();
    loadTokens();
    loadTwoFA();
  }, []);

  const tabs = [
    { id: 'general', label: 'General', icon: Settings },
    { id: 'appearance', label: 'Appearance', icon: Monitor },
    { id: 'users', label: 'Users & Groups', icon: Users },
    { id: 'members', label: 'Team Members', icon: UserPlus },
    { id: 'tokens', label: 'API Tokens', icon: Key },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: '2fa', label: 'Two-Factor Auth', icon: Smartphone },
    { id: 'network', label: 'Network', icon: Wifi },
    { id: 'storage', label: 'Storage', icon: HardDrive },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'about', label: 'About', icon: Info },
  ];

  const inviteMember = async () => {
    if (!inviteEmail || !teamInfo?.activeTeamId) return;
    await fetch(`/api/teams/${teamInfo.activeTeamId}/members`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
    });
    setInviteEmail('');
    loadTeam();
  };

  const createToken = async () => {
    if (!newTokenName) return;
    const r = await fetch('/api/tokens', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newTokenName, abilities: ['read', 'write', 'deploy'] }),
    });
    if (r.ok) {
      const d = await r.json();
      setNewToken(d.token);
      setNewTokenName('');
      loadTokens();
    }
  };

  const revokeToken = async (id: string) => {
    await fetch('/api/tokens', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
    loadTokens();
  };

  const saveNotif = async (channel: string, enabled: boolean, config: any) => {
    if (!teamInfo?.activeTeamId) return;
    await fetch(`/api/teams/${teamInfo.activeTeamId}/notifications`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, enabled, config }),
    });
    loadTeam();
  };

  const testNotif = async (channel: string) => {
    if (!teamInfo?.activeTeamId) return;
    await fetch(`/api/teams/${teamInfo.activeTeamId}/notifications`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel }),
    });
  };

  const init2FA = async () => {
    setTfaLoading(true);
    const r = await fetch('/api/auth/2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'init' }) });
    const d = await r.json();
    setTwoFA((prev: any) => ({ ...prev, ...d }));
    setTfaLoading(false);
  };

  const enable2FA = async () => {
    setTfaLoading(true);
    const r = await fetch('/api/auth/2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enable', code: totpCode }) });
    const d = await r.json();
    if (d.recoveryCodes) { setRecoveryCodes(d.recoveryCodes); loadTwoFA(); }
    setTotpCode('');
    setTfaLoading(false);
  };

  const disable2FA = async () => {
    if (!confirm('Disable two-factor authentication? This will make your account less secure.')) return;
    const pw = prompt('Enter your password to confirm:');
    if (!pw) return;
    setTfaLoading(true);
    await fetch('/api/auth/2fa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disable', password: pw }) });
    setRecoveryCodes([]);
    loadTwoFA();
    setTfaLoading(false);
  };

  const NOTIF_CHANNELS = [
    { id: 'email', label: 'Email', fields: [{ key: 'host', label: 'SMTP Host' }, { key: 'port', label: 'Port' }, { key: 'user', label: 'Username' }, { key: 'pass', label: 'Password', type: 'password' }, { key: 'from', label: 'From Address' }] },
    { id: 'discord', label: 'Discord', fields: [{ key: 'webhookUrl', label: 'Webhook URL' }] },
    { id: 'slack', label: 'Slack', fields: [{ key: 'webhookUrl', label: 'Webhook URL' }] },
    { id: 'telegram', label: 'Telegram', fields: [{ key: 'botToken', label: 'Bot Token' }, { key: 'chatId', label: 'Chat ID' }] },
    { id: 'pushover', label: 'Pushover', fields: [{ key: 'userKey', label: 'User Key' }, { key: 'appToken', label: 'App Token' }] },
    { id: 'webhook', label: 'Custom Webhook', fields: [{ key: 'url', label: 'URL' }] },
  ];

  return (
    <div className="h-full w-full flex select-none overflow-hidden bg-gray-50 font-sans text-slate-800 relative" onContextMenu={(e) => e.preventDefault()}>
      
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <div className={`${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0 absolute md:static z-50 h-full md:h-auto transition-transform duration-300 ease-in-out flex flex-col bg-white border-r border-neutral-200/50 w-[240px] md:w-[250px] shadow-2xl md:shadow-sm md:m-3 md:rounded-[32px] p-4 pt-5 flex-shrink-0`}>
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
              onClick={() => { setActiveTab(tab.id); setIsSidebarOpen(false); }}
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
        
        <div className="flex-1 overflow-y-auto pt-6 md:pt-10 px-6 md:px-12 pb-24 z-0">
          <div className="flex items-center gap-3 mb-8">
            <button className="md:hidden text-slate-500 hover:text-slate-800 transition" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={24} />
            </button>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-800 m-0">{tabs.find(t => t.id === activeTab)?.label}</h1>
          </div>
          
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

          {/* TEAM MEMBERS TAB */}
          {activeTab === 'members' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500"><UserPlus size={24} /></div>
                  <div>
                    <h3 className="text-lg font-semibold">Team Members</h3>
                    <p className="text-sm text-slate-500">{teamInfo?.teams?.find((t: any) => t.id === teamInfo.activeTeamId)?.name || 'Personal Team'}</p>
                  </div>
                </div>
                <div className="flex gap-3 mb-6">
                  <input placeholder="Email address" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400">
                    <option value="member">Member</option>
                    <option value="admin">Admin</option>
                    <option value="owner">Owner</option>
                  </select>
                  <button onClick={inviteMember} className="bg-indigo-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-indigo-600 transition">Invite</button>
                </div>
                <div className="space-y-2">
                  {members.map((m: any) => (
                    <div key={m.user_id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                      <div className="flex items-center gap-3">
                        <img src={`https://ui-avatars.com/api/?name=${m.email}&background=6366f1&color=fff&size=32`} className="w-8 h-8 rounded-full" alt="" />
                        <span className="text-sm font-medium">{m.email}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${m.role === 'owner' ? 'bg-purple-100 text-purple-700' : m.role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-600'}`}>{m.role}</span>
                    </div>
                  ))}
                  {members.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No members yet</p>}
                </div>
              </div>
            </div>
          )}

          {/* API TOKENS TAB */}
          {activeTab === 'tokens' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-500"><Key size={24} /></div>
                  <div>
                    <h3 className="text-lg font-semibold">API Tokens</h3>
                    <p className="text-sm text-slate-500">Tokens for programmatic access to the API</p>
                  </div>
                </div>
                {newToken && (
                  <div className="mb-5 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                    <p className="text-sm font-semibold text-emerald-700 mb-2">Copy your token now — it won't be shown again.</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white border border-emerald-200 rounded-lg px-3 py-2 font-mono break-all">{newToken}</code>
                      <button onClick={() => navigator.clipboard.writeText(newToken)} className="text-emerald-600 hover:text-emerald-800"><Copy size={16} /></button>
                    </div>
                    <button onClick={() => setNewToken(null)} className="mt-2 text-xs text-emerald-600 underline">Dismiss</button>
                  </div>
                )}
                <div className="flex gap-3 mb-6">
                  <input placeholder="Token name" value={newTokenName} onChange={e => setNewTokenName(e.target.value)}
                    className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                  <button onClick={createToken} className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-amber-600 transition flex items-center gap-2">
                    <Plus size={15} /> Create
                  </button>
                </div>
                <div className="space-y-2">
                  {tokens.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl">
                      <div>
                        <p className="text-sm font-medium">{t.name}</p>
                        <p className="text-xs text-slate-400">{t.abilities} • Created {new Date(t.created_at).toLocaleDateString()}</p>
                      </div>
                      <button onClick={() => revokeToken(t.id)} className="text-red-400 hover:text-red-600 transition"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {tokens.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No tokens yet</p>}
                </div>
              </div>
            </div>
          )}

          {/* NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center text-rose-500"><Bell size={24} /></div>
                  <div>
                    <h3 className="text-lg font-semibold">Notification Channels</h3>
                    <p className="text-sm text-slate-500">Get alerted on deployments, failures, and health</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap mb-6">
                  {NOTIF_CHANNELS.map(ch => (
                    <button key={ch.id} onClick={() => { setNotifChannel(ch.id); const s = notifSettings.find((n: any) => n.channel === ch.id); setNotifConfig(s ? JSON.parse(s.config || '{}') : {}); }}
                      className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${notifChannel === ch.id ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {ch.label}
                    </button>
                  ))}
                </div>
                {(() => {
                  const ch = NOTIF_CHANNELS.find(c => c.id === notifChannel)!;
                  const setting = notifSettings.find((n: any) => n.channel === notifChannel);
                  const enabled = setting?.enabled ?? false;
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-700">Enable {ch.label}</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" checked={!!enabled} onChange={e => saveNotif(notifChannel, e.target.checked, notifConfig)} />
                          <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-rose-500"></div>
                        </label>
                      </div>
                      {ch.fields.map(f => (
                        <div key={f.key}>
                          <label className="block text-xs font-medium text-slate-500 mb-1">{f.label}</label>
                          <input type={(f as any).type || 'text'} value={notifConfig[f.key] || ''} onChange={e => setNotifConfig(c => ({ ...c, [f.key]: e.target.value }))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400" />
                        </div>
                      ))}
                      <div className="flex gap-3 pt-2">
                        <button onClick={() => saveNotif(notifChannel, !!enabled, notifConfig)} className="flex-1 bg-rose-500 text-white rounded-xl py-2 text-sm font-medium hover:bg-rose-600 transition">Save</button>
                        <button onClick={() => testNotif(notifChannel)} className="flex items-center gap-2 border border-slate-200 text-slate-600 rounded-xl px-4 py-2 text-sm font-medium hover:bg-slate-50 transition">
                          <Send size={14} /> Test
                        </button>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* 2FA TAB */}
          {activeTab === '2fa' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white rounded-3xl p-6 shadow-sm border border-neutral-200/50">
                <div className="flex items-center gap-4 mb-6">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${twoFA?.enabled ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-400'}`}><Smartphone size={24} /></div>
                  <div>
                    <h3 className="text-lg font-semibold">Two-Factor Authentication</h3>
                    <p className={`text-sm font-medium ${twoFA?.enabled ? 'text-emerald-600' : 'text-slate-500'}`}>{twoFA?.enabled ? 'Enabled' : 'Disabled'}</p>
                  </div>
                </div>

                {twoFA?.enabled ? (
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">Your account is protected with TOTP two-factor authentication.</p>
                    {recoveryCodes.length > 0 && (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                        <p className="text-sm font-semibold text-amber-700 mb-3">Save these recovery codes in a safe place.</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {recoveryCodes.map((c, i) => <code key={i} className="bg-white border border-amber-200 rounded px-2 py-1 text-xs font-mono">{c}</code>)}
                        </div>
                      </div>
                    )}
                    <button onClick={disable2FA} disabled={tfaLoading} className="bg-red-50 border border-red-200 text-red-600 px-5 py-2 rounded-xl text-sm font-medium hover:bg-red-100 transition">
                      Disable 2FA
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    <p className="text-sm text-slate-600">Add an extra layer of security using an authenticator app like Google Authenticator or 1Password.</p>
                    {!twoFA?.qrDataUrl && (
                      <button onClick={init2FA} disabled={tfaLoading} className="bg-blue-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-600 transition disabled:opacity-60">
                        {tfaLoading ? 'Generating…' : 'Set up 2FA'}
                      </button>
                    )}
                    {twoFA?.qrDataUrl && (
                      <div className="space-y-5">
                        <div className="flex flex-col items-center gap-3">
                          <img src={twoFA.qrDataUrl} className="w-40 h-40 rounded-2xl border border-slate-200 shadow-sm" alt="QR code" />
                          <p className="text-xs text-slate-400 text-center">Scan with your authenticator app<br/>or enter the secret manually:</p>
                          <code className="text-xs bg-slate-100 px-3 py-1 rounded-lg font-mono break-all">{twoFA.secret}</code>
                        </div>
                        <div className="flex gap-3">
                          <input placeholder="6-digit code" value={totpCode} onChange={e => setTotpCode(e.target.value)} maxLength={6}
                            className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-blue-400" />
                          <button onClick={enable2FA} disabled={tfaLoading || totpCode.length < 6} className="bg-blue-500 text-white px-5 py-2 rounded-xl text-sm font-medium hover:bg-blue-600 transition disabled:opacity-50">
                            {tfaLoading ? 'Verifying…' : 'Enable'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
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
