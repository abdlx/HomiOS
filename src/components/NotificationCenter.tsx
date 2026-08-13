import React, { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Circle, Info, Trash2, X, AlertTriangle, CheckCircle2, XCircle, Loader2, Pause, Play, RefreshCw } from 'lucide-react';
import { NotificationItem } from '../types';
import { useJobActivity } from '../hooks/useJobActivity';

type NotificationFilter = 'all' | 'unread' | 'activity' | 'transfers' | 'system';

const FILTERS: { id: NotificationFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'activity', label: 'Activity' },
  { id: 'transfers', label: 'Transfers' },
  { id: 'system', label: 'System' },
];

const toneIcon = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

const toneClass = {
  info: 'bg-blue-500/15 text-blue-300',
  success: 'bg-emerald-500/15 text-emerald-300',
  warning: 'bg-amber-500/15 text-amber-300',
  danger: 'bg-red-500/15 text-red-300',
};

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
}

export default function NotificationCenter({ open, onClose, onUnreadChange }: NotificationCenterProps) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [loading, setLoading] = useState(false);
  const { activeJobs, transferJobs, updateJob } = useJobActivity();

  const unreadCount = useMemo(() => items.filter((item) => !item.readAt).length, [items]);
  const liveJobs = useMemo(() => {
    if (filter === 'system' || filter === 'unread') return [];
    if (filter === 'transfers') return transferJobs.filter((job) => ['queued', 'running', 'paused'].includes(job.status));
    return activeJobs;
  }, [filter, transferJobs, activeJobs]);

  const load = async (nextFilter = filter) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/notifications?limit=80&filter=${nextFilter}`);
      if (res.ok) {
        const data = await res.json();
        setItems(data);
        onUnreadChange?.(data.filter((item: NotificationItem) => !item.readAt).length);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    load();
    const timer = window.setInterval(() => load(), 15000);
    return () => window.clearInterval(timer);
  }, [open, filter]);

  useEffect(() => {
    const loadUnread = async () => {
      try {
        const res = await fetch('/api/notifications?limit=80&filter=unread');
        if (res.ok) {
          const data = await res.json();
          onUnreadChange?.(data.length);
        }
      } catch {
        // Notification badge is best effort.
      }
    };
    loadUnread();
    const timer = window.setInterval(loadUnread, 15000);
    return () => window.clearInterval(timer);
  }, [onUnreadChange]);

  if (!open) return null;

  const setRead = async (item: NotificationItem, read: boolean) => {
    await fetch(`/api/notifications/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ read }),
    });
    setItems((prev) => prev.map((n) => n.id === item.id ? { ...n, readAt: read ? new Date().toISOString() : undefined } : n));
  };

  const deleteItem = async (id: number) => {
    await fetch(`/api/notifications/${id}`, { method: 'DELETE' });
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const markAllRead = async () => {
    await fetch('/api/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter }),
    });
    setItems((prev) => prev.map((item) => ({ ...item, readAt: item.readAt || new Date().toISOString() })));
  };

  const clearRead = async () => {
    await fetch('/api/notifications', { method: 'DELETE' });
    setItems((prev) => prev.filter((item) => !item.readAt));
  };

  return (
    <div className="fixed inset-y-8 right-4 z-[220] w-[390px] max-w-[calc(100vw-24px)] overflow-hidden rounded-[28px] border border-white/10 bg-[#17171a]/92 text-white shadow-2xl backdrop-blur-2xl">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
            <Bell size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Notification Center</h2>
            <p className="text-[11px] text-white/45">{unreadCount} unread</p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-full p-2 text-white/55 transition hover:bg-white/10 hover:text-white" title="Close">
          <X size={16} />
        </button>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${filter === item.id ? 'bg-white text-black' : 'text-white/65 hover:bg-white/10 hover:text-white'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-b border-white/10 px-4 py-2">
        <button onClick={markAllRead} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/65 hover:bg-white/10 hover:text-white">
          <CheckCheck size={13} />
          Mark read
        </button>
        <button onClick={clearRead} className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white/65 hover:bg-white/10 hover:text-white">
          <Trash2 size={13} />
          Clear read
        </button>
      </div>

      <div className="h-[calc(100%-142px)] overflow-y-auto p-3">
        {liveJobs.length > 0 && (
          <section className="mb-3 space-y-2" aria-label="Live jobs">
            <div className="flex items-center gap-2 px-1 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
              <Loader2 size={11} className="animate-spin text-blue-300" />
              Live on server
            </div>
            {liveJobs.map((job) => (
              <div key={job.id} className="rounded-2xl border border-blue-400/15 bg-blue-500/[0.08] p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="truncate text-xs font-semibold">{job.name}</h3>
                      <span className="font-mono text-[10px] text-white/55">{job.progress || 0}%</span>
                    </div>
                    <p className="mt-1 text-[10px] capitalize text-white/42">{job.status}{job.runAt && job.status === 'queued' ? ` · ${new Date(job.runAt).toLocaleString()}` : ''}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-blue-400 transition-[width] duration-300" style={{ width: `${Math.max(job.status === 'running' ? 2 : 0, job.progress || 0)}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {job.status === 'queued' && <button onClick={() => void updateJob(job.id, 'pause')} className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white" title="Pause"><Pause size={12} /></button>}
                    {job.status === 'paused' && <button onClick={() => void updateJob(job.id, 'resume')} className="rounded-lg p-1.5 text-white/45 hover:bg-white/10 hover:text-white" title="Resume"><Play size={12} /></button>}
                    <button onClick={() => void updateJob(job.id, 'cancel')} className="rounded-lg p-1.5 text-white/45 hover:bg-red-500/15 hover:text-red-300" title="Cancel"><XCircle size={12} /></button>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )}
        {loading && items.length === 0 && (
          <div className="py-10 text-center text-sm text-white/45">Loading notifications...</div>
        )}
        {!loading && items.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center text-white/45">
            <Bell size={34} className="opacity-50" />
            <p className="text-sm font-medium">Nothing here yet</p>
          </div>
        )}
        <div className="space-y-2">
          {items.map((item) => {
            const Icon = toneIcon[item.tone] || Info;
            return (
              <div key={item.id} className={`group rounded-2xl border border-white/8 bg-white/[0.06] p-3 transition hover:bg-white/[0.09] ${item.readAt ? 'opacity-65' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${toneClass[item.tone] || toneClass.info}`}>
                    <Icon size={15} />
                  </div>
                  <button onClick={() => setRead(item, !item.readAt)} className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold">{item.title}</h3>
                      {!item.readAt && <Circle size={7} fill="currentColor" className="text-blue-300" />}
                    </div>
                    <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-white/55">{item.message}</p>
                    <p className="mt-2 text-[10px] text-white/35">{new Date(item.createdAt).toLocaleString()}</p>
                  </button>
                  <button onClick={() => deleteItem(item.id)} className="rounded-full p-1.5 text-white/35 opacity-0 transition hover:bg-white/10 hover:text-red-300 group-hover:opacity-100" title="Delete">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
