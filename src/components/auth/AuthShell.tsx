import React from 'react';

/**
 * Shared chrome for the sign-in and first-run screens.
 *
 * Both used to be hand-rolled with a flat slate gradient, the wrong product name,
 * and no theme awareness. This keeps them identical, theme-aware, and on-brand:
 * an ambient aurora backdrop with a frosted-glass card on top, matching the
 * macOS-style surfaces used across the desktop (see SystemUI.tsx).
 */

export function BrandMark({ size = 52 }: { size?: number }) {
  return (
    <div
      className="relative grid place-items-center rounded-[24%] bg-gradient-to-b from-neutral-800 to-neutral-950 dark:from-neutral-700 dark:to-neutral-900 shadow-xl shadow-black/30 ring-1 ring-white/20 p-2.5"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <img src="/icon/homios-icon.svg" alt="HomiOS" className="w-full h-full object-contain drop-shadow" />
    </div>
  );
}

export default function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[100dvh] flex flex-col items-center justify-center overflow-hidden bg-slate-100 dark:bg-[#0b0c10] px-6 py-10">
      {/* Ambient background */}
      <div className="pointer-events-none absolute inset-0 auth-grain">
        <div className="auth-aurora" />
      </div>

      <main className="relative w-full max-w-[24rem]">
        <div className="flex flex-col items-center text-center mb-7">
          <BrandMark />
          <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-slate-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>

        <div className="rounded-[20px] bg-white/80 dark:bg-white/[0.06] backdrop-blur-2xl border border-black/[0.06] dark:border-white/10 shadow-[0_24px_64px_-16px_rgba(15,23,42,0.35)] dark:shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)] p-6">
          {children}
        </div>

        {footer && (
          <p className="mt-6 text-center text-[12.5px] text-slate-400 dark:text-slate-500">{footer}</p>
        )}
      </main>
    </div>
  );
}

/* ── Shared form primitives ── */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[12.5px] font-medium text-slate-700 dark:text-slate-300">{label}</span>
        {hint}
      </div>
      {children}
    </label>
  );
}

export const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl text-[14px] bg-slate-100/80 dark:bg-white/5 ' +
  'border border-slate-200 dark:border-white/10 text-slate-900 dark:text-slate-100 ' +
  'placeholder-slate-400 dark:placeholder-slate-500 ' +
  'focus:outline-none focus:ring-2 focus:ring-neutral-400/60 dark:focus:ring-white/30 focus:border-transparent ' +
  'transition-[box-shadow,border-color] duration-150';

export function SubmitButton({
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      className="group relative w-full py-2.5 rounded-xl text-[14px] font-semibold text-white dark:text-neutral-900
        bg-neutral-900 hover:bg-neutral-800 active:bg-black dark:bg-white dark:hover:bg-neutral-100 dark:active:bg-neutral-200
        shadow-lg shadow-black/15 hover:shadow-black/25 dark:shadow-white/5
        disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none
        transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.99]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
        flex items-center justify-center gap-2 cursor-pointer"
    >
      {loading && (
        <span className="w-4 h-4 rounded-full border-2 border-white/40 dark:border-neutral-900/40 border-t-white dark:border-t-neutral-900 animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
