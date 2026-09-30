import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Power, RotateCw, X } from 'lucide-react';
import { ensureCsrfToken } from '../csrf';
import { toast } from './SystemUI';

type PowerAction = 'poweroff' | 'reboot';

export default function PowerControls() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [action, setAction] = useState<PowerAction | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node) && !popupRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    const onResize = () => setMenuOpen(false);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
    };
  }, [menuOpen]);

  const closeDialog = () => {
    if (submitting) return;
    setAction(null);
    setPassword('');
    setError('');
  };

  const chooseAction = (next: PowerAction) => {
    setMenuOpen(false);
    setAction(next);
    setPassword('');
    setError('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!action || !password || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const csrfToken = await ensureCsrfToken();
      const response = await fetch('/api/system/power', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-HomiOS-CSRF': csrfToken },
        body: JSON.stringify({ action, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not send the power command');
      toast({ message: action === 'reboot' ? 'Rebooting machine…' : 'Shutting down machine…', tone: 'info' });
      setAction(null);
      setPassword('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not send the power command');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => {
          const rect = menuRef.current?.getBoundingClientRect();
          if (rect) setMenuPosition({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
          setMenuOpen((open) => !open);
        }}
        className="flex items-center text-white/80 hover:text-white transition"
        title="Machine power controls"
        aria-label="Machine power controls"
        aria-expanded={menuOpen}
        aria-haspopup="menu"
      >
        <Power size={15} strokeWidth={2} />
      </button>
      {menuOpen && createPortal((
        <div ref={popupRef} role="menu" style={menuPosition} className="fixed z-[9999] w-44 rounded-xl border border-white/15 bg-[#26262a] p-1.5 text-sm text-white shadow-xl">
          <button type="button" role="menuitem" onClick={() => chooseAction('reboot')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10">
            <RotateCw size={15} /> Reboot machine
          </button>
          <button type="button" role="menuitem" onClick={() => chooseAction('poweroff')} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-white/10">
            <Power size={15} /> Shut down machine
          </button>
        </div>
      ), document.body)}
      {action && createPortal((
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[3px]" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDialog(); }}>
          <form onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="power-dialog-title" className="w-full max-w-sm rounded-2xl border border-black/5 bg-white p-6 text-slate-900 shadow-2xl dark:border-white/10 dark:bg-[#1c1c1e] dark:text-white">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400">
                  {action === 'reboot' ? <RotateCw size={20} /> : <Power size={20} />}
                </span>
                <h2 id="power-dialog-title" className="text-base font-semibold">{action === 'reboot' ? 'Reboot machine' : 'Shut down machine'}</h2>
              </div>
              <button type="button" onClick={closeDialog} disabled={submitting} aria-label="Cancel" className="text-slate-400 hover:text-slate-600 disabled:opacity-50 dark:hover:text-slate-200"><X size={18} /></button>
            </div>
            <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">Enter your administrator password to {action === 'reboot' ? 'reboot' : 'shut down'} this machine. Running work will be interrupted.</p>
            <label htmlFor="power-password" className="mt-5 block text-xs font-semibold text-slate-700 dark:text-slate-200">Password</label>
            <input
              id="power-password"
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError(''); }}
              className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 dark:border-white/10 dark:bg-white/5"
            />
            {error && <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
            <div className="mt-6 flex gap-2.5">
              <button type="button" onClick={closeDialog} disabled={submitting} className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15">Cancel</button>
              <button type="submit" disabled={submitting || !password} className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50">
                {submitting ? 'Please wait…' : action === 'reboot' ? 'Reboot' : 'Shut down'}
              </button>
            </div>
          </form>
        </div>
      ), document.body)}
    </div>
  );
}
