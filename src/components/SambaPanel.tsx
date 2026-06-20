import React, { useState, useEffect } from 'react';
import { Share2, Users, HardDrive, Shield, Plus, Trash2, Edit2, Lock, Save, X, Check, RefreshCw, Folder } from 'lucide-react';
import { confirmDialog, toast } from './SystemUI';

interface SambaShare {
  id: number;
  name: string;
  path: string;
  read_only: number;
  enabled?: number;
  expires_at?: string | null;
  comment: string;
  created_at: string;
  sambaUsers: any[];
}

interface SambaUser {
  id: number;
  username: string;
  enabled: number;
  created_at: string;
  shares: any[];
}

export default function SambaPanel({ defaultPath }: { defaultPath?: string }) {
  const [activeTab, setActiveTab] = useState<'shares' | 'users'>('shares');
  const [shares, setShares] = useState<SambaShare[]>([]);
  const [users, setUsers] = useState<SambaUser[]>([]);
  const [loading, setLoading] = useState(true);

  const host = typeof window !== 'undefined' ? window.location.hostname : 'server';

  // New Share form state
  const [isAddingShare, setIsAddingShare] = useState(false);
  const [newShareName, setNewShareName] = useState('');
  const [newSharePath, setNewSharePath] = useState('');
  const [newShareReadOnly, setNewShareReadOnly] = useState(false);
  const [newShareEnabled, setNewShareEnabled] = useState(true);
  const [newShareExpiresAt, setNewShareExpiresAt] = useState('');
  const [newShareUsers, setNewShareUsers] = useState<number[]>([]);

  // New User form state
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');

  // Editing Share state
  const [editingShareId, setEditingShareId] = useState<number | null>(null);
  const [editShareName, setEditShareName] = useState('');
  const [editSharePath, setEditSharePath] = useState('');
  const [editShareReadOnly, setEditShareReadOnly] = useState(false);
  const [editShareEnabled, setEditShareEnabled] = useState(true);
  const [editShareExpiresAt, setEditShareExpiresAt] = useState('');

  // Resetting Password state
  const [resettingUserId, setResettingUserId] = useState<number | null>(null);
  const [resetPasswordStr, setResetPasswordStr] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const sharesRes = await fetch('/api/shares');
      if (sharesRes.ok) setShares(await sharesRes.json());
      
      const usersRes = await fetch('/api/shares/users');
      if (usersRes.ok) setUsers(await usersRes.json());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    if (defaultPath) {
      setIsAddingShare(true);
      setNewSharePath(defaultPath);
      setNewShareName(defaultPath.split('/').pop() || 'Share');
    }
  }, [defaultPath]);

  const createShare = async () => {
    if (!newShareName || !newSharePath) return toast({ message: 'Name and path are required', tone: 'warning' });
    const res = await fetch('/api/shares', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newShareName,
        path: newSharePath,
        readOnly: newShareReadOnly,
        enabled: newShareEnabled,
        expiresAt: newShareExpiresAt || null,
        userIds: newShareUsers
      })
    });
    if (res.ok) {
      setIsAddingShare(false);
      setNewShareName('');
      setNewSharePath('');
      setNewShareReadOnly(false);
      setNewShareEnabled(true);
      setNewShareExpiresAt('');
      setNewShareUsers([]);
      loadData();
    } else {
      const data = await res.json();
      toast({ message: 'Something went wrong', description: data.error, tone: 'danger' });
    }
  };

  const deleteShare = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete this share?', message: 'Network access to this folder will be removed.', tone: 'danger', confirmLabel: 'Delete' }))) return;
    const res = await fetch('/api/shares', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (res.ok) loadData();
  };

  const saveEditedShare = async () => {
    if (!editingShareId || !editShareName || !editSharePath) return;
    const res = await fetch('/api/shares', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: editingShareId,
        name: editShareName,
        path: editSharePath,
        readOnly: editShareReadOnly,
        enabled: editShareEnabled,
        expiresAt: editShareExpiresAt || null
      })
    });
    if (res.ok) {
      setEditingShareId(null);
      loadData();
    } else {
      const data = await res.json();
      toast({ message: 'Something went wrong', description: data.error, tone: 'danger' });
    }
  };

  const toggleShareAccess = async (shareId: number, currentUsers: any[], userId: number) => {
    const current = currentUsers.find(u => u.id === userId);
    const userAccess = currentUsers
      .filter(u => u.id !== userId)
      .map(u => ({ id: u.id, access: u.access === 'read' ? 'read' : 'write' }));
    if (!current) {
      userAccess.push({ id: userId, access: 'write' });
    } else if (current.access !== 'read') {
      userAccess.push({ id: userId, access: 'read' });
    }
      
    const res = await fetch('/api/shares', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: shareId, userAccess })
    });
    if (res.ok) loadData();
  };

  const createUser = async () => {
    if (!newUsername || !newUserPassword) return toast({ message: 'Username and password are required', tone: 'warning' });
    const res = await fetch('/api/shares/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: newUsername, password: newUserPassword })
    });
    if (res.ok) {
      setIsAddingUser(false);
      setNewUsername('');
      setNewUserPassword('');
      loadData();
    } else {
      const data = await res.json();
      toast({ message: 'Something went wrong', description: data.error, tone: 'danger' });
    }
  };

  const deleteUser = async (id: number) => {
    if (!(await confirmDialog({ title: 'Delete this user?', message: 'This SMB user will lose access to all shares.', tone: 'danger', confirmLabel: 'Delete' }))) return;
    const res = await fetch('/api/shares/users', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    });
    if (res.ok) loadData();
  };

  const toggleUserEnabled = async (username: string, currentEnabled: number) => {
    const res = await fetch('/api/shares/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, enabled: !currentEnabled })
    });
    if (res.ok) loadData();
  };

  const performResetPassword = async (username: string) => {
    if (!resetPasswordStr) return toast({ message: 'Password is required', tone: 'warning' });
    const res = await fetch('/api/shares/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: resetPasswordStr, resetPassword: true })
    });
    if (res.ok) {
      setResettingUserId(null);
      setResetPasswordStr('');
      toast({ message: 'Password reset successfully', tone: 'success' });
    } else {
      const data = await res.json();
      toast({ message: 'Something went wrong', description: data.error, tone: 'danger' });
    }
  };

  return (
    <div className="flex-1 bg-white dark:bg-[#1c1c1e] h-full flex flex-col overflow-hidden">
      <div className="px-8 py-6 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-white dark:bg-[#1c1c1e]">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <Share2 className="text-blue-500" />
            Samba Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage local network file sharing and users.</p>
        </div>
        <button onClick={loadData} className="p-2 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-600 dark:text-slate-300 transition-colors" title="Refresh Data">
          <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex border-b border-slate-200 dark:border-white/10 px-6">
        <button
          onClick={() => setActiveTab('shares')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${activeTab === 'shares' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
        >
          <HardDrive size={16} /> Shares
        </button>
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-3 text-sm font-semibold border-b-2 flex items-center gap-2 ${activeTab === 'users' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
        >
          <Users size={16} /> Access Users
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-[#161618]">
        {activeTab === 'shares' && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Active Shares</h2>
              <button 
                onClick={() => setIsAddingShare(!isAddingShare)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
              >
                {isAddingShare ? <X size={16} /> : <Plus size={16} />}
                {isAddingShare ? 'Cancel' : 'New Share'}
              </button>
            </div>

            {isAddingShare && (
              <div className="bg-white dark:bg-[#1f1f22] p-5 rounded-2xl border border-blue-100 dark:border-blue-500/20 shadow-sm space-y-4 animate-in slide-in-from-top-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Share Name</label>
                    <input type="text" value={newShareName} onChange={e => setNewShareName(e.target.value)} placeholder="e.g. Media" className="w-full mt-1 border border-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Folder Path</label>
                    <input type="text" value={newSharePath} onChange={e => setNewSharePath(e.target.value)} placeholder="e.g. /mnt/sda1/Media" className="w-full mt-1 border border-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={newShareReadOnly} onChange={e => setNewShareReadOnly(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                    Read Only
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input type="checkbox" checked={newShareEnabled} onChange={e => setNewShareEnabled(e.target.checked)} className="w-4 h-4 rounded text-blue-600" />
                    Enabled
                  </label>
                  <input
                    type="datetime-local"
                    value={newShareExpiresAt}
                    onChange={e => setNewShareExpiresAt(e.target.value)}
                    className="border border-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 rounded-lg px-3 py-2 text-sm"
                    title="Optional expiry"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Allowed Users</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {users.map(u => (
                      <button 
                        key={u.id}
                        onClick={() => setNewShareUsers(prev => prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id])}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors flex items-center gap-1.5 border ${newShareUsers.includes(u.id) ? 'bg-blue-100 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {newShareUsers.includes(u.id) && <Check size={12} />}
                        {u.username}
                      </button>
                    ))}
                    {users.length === 0 && <span className="text-xs text-slate-400">No users found. Create users first.</span>}
                  </div>
                </div>
                <div className="flex justify-end">
                  <button onClick={createShare} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2">
                    <Save size={16} /> Create Share
                  </button>
                </div>
              </div>
            )}

            {shares.length === 0 && !loading && !isAddingShare && (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-white dark:bg-[#1f1f22] rounded-2xl border border-dashed border-slate-300 dark:border-white/15">
                <HardDrive size={48} className="mx-auto mb-3 opacity-20" />
                <p>No network shares configured yet.</p>
              </div>
            )}

            {shares.map(share => (
              <div key={share.id} className="bg-white dark:bg-[#1f1f22] p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col gap-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                      <Share2 size={20} />
                    </div>
                    <div>
                      <div className="flex flex-col gap-1.5 mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 select-all">
                            \\{host}\{share.name}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Windows</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded border border-slate-200 dark:border-white/10 select-all">
                            smb://{host}/{share.name}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Mac / Linux</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-2 flex items-center gap-1.5 border-t border-slate-100 dark:border-white/10 pt-2">
                        <Folder size={12} className="text-slate-400 dark:text-slate-500" /> {share.path}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {share.read_only ? (
                      <span className="px-2 py-1 bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-semibold rounded">Read Only</span>
                    ) : (
                      <span className="px-2 py-1 bg-green-50 dark:bg-green-500/15 text-green-700 dark:text-green-300 text-xs font-semibold rounded border border-green-100 dark:border-green-500/20">Read / Write</span>
                    )}
                    {share.enabled === 0 && (
                      <span className="px-2 py-1 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300 text-xs font-semibold rounded">Disabled</span>
                    )}
                    <button onClick={() => {
                      setEditingShareId(share.id);
                      setEditShareName(share.name);
                      setEditSharePath(share.path);
                      setEditShareReadOnly(!!share.read_only);
                      setEditShareEnabled(share.enabled !== 0);
                      setEditShareExpiresAt(share.expires_at ? String(share.expires_at).slice(0, 16) : '');
                    }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Edit Share">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => deleteShare(share.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete Share">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>

                {editingShareId === share.id && (
                  <div className="bg-blue-50/50 dark:bg-blue-500/10 p-4 rounded-xl border border-blue-100 dark:border-blue-500/20 space-y-3 mt-2">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Share Name</label>
                        <input type="text" value={editShareName} onChange={e => setEditShareName(e.target.value)} className="w-full mt-1 border border-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 rounded text-sm px-2 py-1.5" />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Path</label>
                        <input type="text" value={editSharePath} onChange={e => setEditSharePath(e.target.value)} className="w-full mt-1 border border-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 rounded text-sm px-2 py-1.5" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-4">
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="checkbox" checked={editShareReadOnly} onChange={e => setEditShareReadOnly(e.target.checked)} className="rounded text-blue-600" />
                          Read Only
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                          <input type="checkbox" checked={editShareEnabled} onChange={e => setEditShareEnabled(e.target.checked)} className="rounded text-blue-600" />
                          Enabled
                        </label>
                        <input
                          type="datetime-local"
                          value={editShareExpiresAt}
                          onChange={e => setEditShareExpiresAt(e.target.value)}
                          className="border border-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 rounded px-2 py-1.5 text-sm"
                          title="Optional expiry"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setEditingShareId(null)} className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded">Cancel</button>
                        <button onClick={saveEditedShare} className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded flex items-center gap-1"><Save size={14}/> Save</button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="border-t border-slate-100 dark:border-white/10 pt-3">
                  <p className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 mb-2">Access Control</p>
                  <div className="flex flex-wrap gap-2">
                    {users.map(u => {
                      const access = share.sambaUsers?.find((su: any) => su.id === u.id)?.access;
                      const hasAccess = !!access;
                      return (
                        <button
                          key={u.id}
                          onClick={() => toggleShareAccess(share.id, share.sambaUsers || [], u.id)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1.5 ${hasAccess ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-50 hover:text-slate-600'}`}
                        >
                          {hasAccess ? <Check size={12} /> : <Lock size={12} className="opacity-50" />}
                          {u.username}{hasAccess ? ` • ${access === 'read' ? 'Read' : 'Write'}` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'users' && (
          <div className="space-y-4 max-w-5xl mx-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Samba Users</h2>
              <button 
                onClick={() => setIsAddingUser(!isAddingUser)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors"
              >
                {isAddingUser ? <X size={16} /> : <Plus size={16} />}
                {isAddingUser ? 'Cancel' : 'New User'}
              </button>
            </div>

            {isAddingUser && (
              <div className="bg-white dark:bg-[#1f1f22] p-5 rounded-2xl border border-blue-100 dark:border-blue-500/20 shadow-sm space-y-4 animate-in slide-in-from-top-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Username</label>
                    <input type="text" value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="e.g. john" className="w-full mt-1 border border-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">SMB Password</label>
                    <input type="password" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Secret" className="w-full mt-1 border border-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>
                </div>
                <div className="flex justify-end mt-4">
                  <button onClick={createUser} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2">
                    <Save size={16} /> Create User
                  </button>
                </div>
              </div>
            )}

            {users.length === 0 && !loading && !isAddingUser && (
              <div className="text-center py-12 text-slate-500 dark:text-slate-400 bg-white dark:bg-[#1f1f22] rounded-2xl border border-dashed border-slate-300 dark:border-white/15">
                <Users size={48} className="mx-auto mb-3 opacity-20" />
                <p>No SMB users found. Create one to enable sharing.</p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {users.map(user => (
                <div key={user.id} className="bg-white dark:bg-[#1f1f22] p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 dark:text-white leading-tight">{user.username}</h3>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wide">SMB User</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase cursor-pointer px-2 py-1 rounded hover:bg-slate-50">
                        <input type="checkbox" checked={!!user.enabled} onChange={() => toggleUserEnabled(user.username, user.enabled)} className="rounded" />
                        {user.enabled ? <span className="text-emerald-600">Enabled</span> : <span className="text-slate-400">Disabled</span>}
                      </label>
                      <button onClick={() => {
                        setResettingUserId(resettingUserId === user.id ? null : user.id);
                        setResetPasswordStr('');
                      }} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Reset Password">
                        <Lock size={16} />
                      </button>
                      <button onClick={() => deleteUser(user.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Delete User">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  
                  {resettingUserId === user.id && (
                    <div className="mb-4 bg-slate-50 dark:bg-white/5 p-3 rounded-lg border border-slate-200 dark:border-white/10 flex items-center gap-2">
                      <input type="password" value={resetPasswordStr} onChange={e => setResetPasswordStr(e.target.value)} placeholder="New Password" className="flex-1 border border-slate-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-100 rounded px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-blue-500" />
                      <button onClick={() => performResetPassword(user.username)} className="bg-blue-600 text-white px-3 py-1 rounded text-xs font-semibold hover:bg-blue-700">Save</button>
                    </div>
                  )}
                  <div className="bg-slate-50 dark:bg-white/5 p-3 rounded-xl border border-slate-100 dark:border-white/10">
                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase mb-1.5">Accessible Shares</p>
                    <div className="flex flex-wrap gap-1">
                      {user.shares && user.shares.length > 0 ? (
                        user.shares.map((s: any) => (
                          <span key={s.id} className="text-xs bg-white dark:bg-white/10 border border-slate-200 dark:border-white/10 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300">{s.name}</span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500 italic">No shares assigned</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
