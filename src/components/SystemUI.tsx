import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle, Info, CheckCircle2, XCircle, Trash2, X,
} from 'lucide-react';

/* ────────────────────────────────────────────────────────────────────────
 * OS-style dialog + toast system.
 *
 * Replaces the native window.alert / window.prompt / window.confirm and the
 * scattered alert() calls with a single, theme-aware, animated surface.
 *
 * Usage (from anywhere — returns a Promise):
 *   await confirmDialog({ title: 'Delete file?', tone: 'danger' })  -> boolean
 *   await promptDialog({ title: 'New folder', placeholder: 'Name' }) -> string | null
 *   await alertDialog({ title: 'Heads up', message: '…' })          -> void
 *   toast({ message: 'Saved', tone: 'success' })
 * ──────────────────────────────────────────────────────────────────────── */

type Tone = 'default' | 'danger' | 'success' | 'info' | 'warning';

interface DialogRequest {
  id: number;
  kind: 'confirm' | 'prompt' | 'alert';
  title: string;
  message?: string;
  tone?: Tone;
  confirmLabel?: string;
  cancelLabel?: string;
  // prompt only
  placeholder?: string;
  defaultValue?: string;
  resolve: (value: any) => void;
}

interface ToastRequest {
  id: number;
  message: string;
  description?: string;
  tone?: Tone;
  duration?: number;
}

type DialogListener = (req: DialogRequest) => void;
type ToastListener = (req: ToastRequest) => void;

let uid = 0;
const dialogListeners = new Set<DialogListener>();
const toastListeners = new Set<ToastListener>();

function emitDialog(req: Omit<DialogRequest, 'id'>) {
  const full: DialogRequest = { ...req, id: ++uid };
  if (dialogListeners.size === 0) {
    // Fallback to native primitives if the host isn't mounted (e.g. SSR edge).
    if (req.kind === 'confirm') return req.resolve(window.confirm(req.title));
    if (req.kind === 'prompt') return req.resolve(window.prompt(req.title, req.defaultValue || ''));
    return req.resolve(undefined);
  }
  dialogListeners.forEach((l) => l(full));
}

export function confirmDialog(opts: {
  title: string; message?: string; tone?: Tone; confirmLabel?: string; cancelLabel?: string;
}): Promise<boolean> {
  return new Promise((resolve) => emitDialog({ kind: 'confirm', ...opts, resolve }));
}

export function promptDialog(opts: {
  title: string; message?: string; placeholder?: string; defaultValue?: string; confirmLabel?: string; cancelLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => emitDialog({ kind: 'prompt', ...opts, resolve }));
}

export function alertDialog(opts: {
  title: string; message?: string; tone?: Tone; confirmLabel?: string;
}): Promise<void> {
  return new Promise((resolve) => emitDialog({ kind: 'alert', ...opts, resolve }));
}

export function toast(opts: { message: string; description?: string; tone?: Tone; duration?: number }) {
  const full: ToastRequest = { ...opts, id: ++uid };
  toastListeners.forEach((l) => l(full));
}

/* ── Visual tokens ── */
const toneRing: Record<Tone, string> = {
  default: 'bg-neutral-100 text-neutral-800 dark:bg-white/10 dark:text-neutral-200',
  danger: 'bg-red-50 text-red-500 dark:bg-red-500/15 dark:text-red-300',
  success: 'bg-emerald-50 text-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300',
  info: 'bg-neutral-100 text-neutral-800 dark:bg-white/10 dark:text-neutral-200',
  warning: 'bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-300',
};

const toneButton: Record<Tone, string> = {
  default: 'bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 shadow-black/15',
  danger: 'bg-red-600 hover:bg-red-500 text-white shadow-red-500/25',
  success: 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/25',
  info: 'bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 text-white dark:text-neutral-900 shadow-black/15',
  warning: 'bg-amber-500 hover:bg-amber-400 text-white shadow-amber-500/25',
};

function ToneIcon({ tone, kind }: { tone: Tone; kind: DialogRequest['kind'] }) {
  if (tone === 'danger') return kind === 'confirm' ? <Trash2 size={20} /> : <XCircle size={20} />;
  if (tone === 'success') return <CheckCircle2 size={20} />;
  if (tone === 'warning') return <AlertTriangle size={20} />;
  return <Info size={20} />;
}

/* ── Dialog renderer ── */
function DialogLayer() {
  const [queue, setQueue] = useState<DialogRequest[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const active = queue[0] || null;

  useEffect(() => {
    const listener: DialogListener = (req) => setQueue((q) => [...q, req]);
    dialogListeners.add(listener);
    return () => { dialogListeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (active?.kind === 'prompt') {
      setValue(active.defaultValue || '');
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    }
  }, [active?.id]);

  const close = useCallback((result: any) => {
    if (!active) return;
    active.resolve(result);
    setQueue((q) => q.slice(1));
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(active.kind === 'confirm' ? false : active.kind === 'prompt' ? null : undefined);
      } else if (e.key === 'Enter' && active.kind !== 'prompt') {
        e.preventDefault();
        close(active.kind === 'confirm' ? true : undefined);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, close]);

  if (!active) return null;
  const tone: Tone = active.tone || 'default';

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/30 dark:bg-black/55 backdrop-blur-[3px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          close(active.kind === 'confirm' ? false : active.kind === 'prompt' ? null : undefined);
        }
      }}
    >
      <div className="animate-os-dialog w-full max-w-sm rounded-2xl bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.4)] overflow-hidden">
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 ${toneRing[tone]}`}>
              <ToneIcon tone={tone} kind={active.kind} />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-100 leading-snug">{active.title}</h3>
              {active.message && (
                <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">{active.message}</p>
              )}
            </div>
          </div>

          {active.kind === 'prompt' && (
            <form
              className="mt-4"
              onSubmit={(e) => { e.preventDefault(); close(value.trim() ? value.trim() : null); }}
            >
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={active.placeholder}
                className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-slate-100/80 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-neutral-400/60 dark:focus:ring-white/30 focus:border-transparent transition-all"
              />
            </form>
          )}
        </div>

        <div className="flex items-center gap-2.5 px-6 pb-6 pt-1">
          {active.kind !== 'alert' && (
            <button
              onClick={() => close(active.kind === 'confirm' ? false : null)}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200/60 dark:border-white/10 transition-colors"
            >
              {active.cancelLabel || 'Cancel'}
            </button>
          )}
          <button
            onClick={() => {
              if (active.kind === 'prompt') close(value.trim() ? value.trim() : null);
              else if (active.kind === 'confirm') close(true);
              else close(undefined);
            }}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold shadow-lg transition-colors ${toneButton[tone]}`}
          >
            {active.confirmLabel || (active.kind === 'confirm' ? 'Confirm' : 'OK')}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Toast renderer ── */
function ToastRow({ req, onDone }: { req: ToastRequest; onDone: (id: number) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDone(req.id), req.duration ?? 3200);
    return () => clearTimeout(t);
  }, [req.id]);

  const tone: Tone = req.tone || 'default';
  const icon =
    tone === 'success' ? <CheckCircle2 size={18} /> :
    tone === 'danger' ? <XCircle size={18} /> :
    tone === 'warning' ? <AlertTriangle size={18} /> : <Info size={18} />;

  return (
    <div className="animate-os-toast pointer-events-auto flex items-start gap-3 w-80 rounded-2xl bg-white/95 dark:bg-[#1c1c1e]/95 backdrop-blur-2xl border border-black/5 dark:border-white/10 shadow-[0_16px_40px_-8px_rgba(0,0,0,0.35)] px-4 py-3.5">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${toneRing[tone]}`}>{icon}</div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100 leading-snug">{req.message}</p>
        {req.description && <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{req.description}</p>}
      </div>
      <button onClick={() => onDone(req.id)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0">
        <X size={14} />
      </button>
    </div>
  );
}

function ToastLayer() {
  const [toasts, setToasts] = useState<ToastRequest[]>([]);

  useEffect(() => {
    const listener: ToastListener = (req) => setToasts((t) => [...t, req]);
    toastListeners.add(listener);
    return () => { toastListeners.delete(listener); };
  }, []);

  const remove = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);

  return (
    <div className="fixed top-4 right-4 z-[10001] flex flex-col items-end gap-2.5 pointer-events-none">
      {toasts.map((t) => <ToastRow key={t.id} req={t} onDone={remove} />)}
    </div>
  );
}

/* ── Host (mount once, e.g. in _app) ── */
export default function SystemUIHost() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(
    <>
      <DialogLayer />
      <ToastLayer />
    </>,
    document.body,
  );
}
