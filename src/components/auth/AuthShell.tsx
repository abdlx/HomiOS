import React from 'react';

/**
 * Shared chrome for the sign-in and first-run screens.
 *
 * Both used to be hand-rolled with a flat slate gradient, the wrong product name,
 * and no theme awareness. This keeps them identical, theme-aware, and on-brand:
 * an ambient aurora backdrop with a frosted-glass card on top, matching the
 * macOS-style surfaces used across the desktop (see SystemUI.tsx).
 */

export function BrandMark({ size = 44 }: { size?: number }) {
  return (
    <div
      className="relative grid place-items-center rounded-[22%] bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/30 ring-1 ring-white/20"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24" fill="none" className="text-white">
        {/* A folder that doubles as a magnifier — "find" + "files". */}
        <path
          d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2c.4 0 .78.16 1.06.44L11 6.5h8.5A1.5 1.5 0 0 1 21 8v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11Z"
          fill="currentColor"
          fillOpacity="0.9"
        />
        <circle cx="13.5" cy="12.5" r="3" stroke="rgb(37 99 235)" strokeWidth="1.6" />
        <path d="m16 15 2 2" stroke="rgb(37 99 235)" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
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
  'focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent ' +
  'transition-[box-shadow,border-color] duration-150';

export function SubmitButton({
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      className="group relative w-full py-2.5 rounded-xl text-[14px] font-semibold text-white
        bg-blue-600 hover:bg-blue-500 active:bg-blue-700
        shadow-lg shadow-blue-600/25 hover:shadow-blue-500/30
        disabled:opacity-45 disabled:cursor-not-allowed disabled:shadow-none
        transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.99]
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent
        flex items-center justify-center gap-2"
    >
      {loading && (
        <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />
      )}
      {children}
    </button>
  );
}
