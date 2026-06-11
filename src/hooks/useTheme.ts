import { useState, useEffect } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'openfinder_theme';

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(pref: ThemePreference): 'light' | 'dark' {
  return pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref;
}

function applyTheme(pref: ThemePreference) {
  if (typeof document === 'undefined') return;
  const resolved = resolveTheme(pref);
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemePreference>('system');
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemePreference | null;
    const pref = saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
    setTheme(pref);
    setResolvedTheme(resolveTheme(pref));
    applyTheme(pref);
  }, []);

  const changeTheme = (pref: ThemePreference) => {
    setTheme(pref);
    setResolvedTheme(resolveTheme(pref));
    localStorage.setItem(STORAGE_KEY, pref);
    applyTheme(pref);
    window.dispatchEvent(new CustomEvent('themeChanged', { detail: pref }));
  };

  // Keep every component using the hook in sync
  useEffect(() => {
    const handleSync = (e: Event) => {
      const pref = (e as CustomEvent).detail as ThemePreference;
      setTheme(pref);
      setResolvedTheme(resolveTheme(pref));
    };
    window.addEventListener('themeChanged', handleSync);
    return () => window.removeEventListener('themeChanged', handleSync);
  }, []);

  // Follow OS preference live while in system mode
  useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      setResolvedTheme(resolveTheme('system'));
      applyTheme('system');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  return { theme, resolvedTheme, changeTheme };
}
