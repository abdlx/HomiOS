import { useEffect, useState } from 'react';
export type AppearanceSettings = { accent: 'blue' | 'violet' | 'emerald' | 'rose' | 'amber'; density: 'comfortable' | 'compact'; iconSize: 'regular' | 'large' };
export const ACCENTS = { blue: '#3b82f6', violet: '#8b5cf6', emerald: '#10b981', rose: '#f43f5e', amber: '#f59e0b' };
const defaults: AppearanceSettings = { accent: 'blue', density: 'comfortable', iconSize: 'regular' };
const key = 'homios_appearance';
function normalize(value: Partial<AppearanceSettings>): AppearanceSettings { return { accent: value.accent && value.accent in ACCENTS ? value.accent : defaults.accent, density: value.density === 'compact' ? 'compact' : 'comfortable', iconSize: value.iconSize === 'large' ? 'large' : 'regular' }; }
function read() { try { return normalize(JSON.parse(localStorage.getItem(key) || '{}')); } catch { return defaults; } }
function apply(settings: AppearanceSettings) {
  const root = document.documentElement;
  root.dataset.accent = settings.accent; root.dataset.density = settings.density; root.dataset.iconSize = settings.iconSize;
  root.style.setProperty('--ui-accent', ACCENTS[settings.accent]);
}
export function useAppearanceSettings() {
  const [settings, setSettings] = useState(defaults);
  useEffect(() => { const value = read(); setSettings(value); apply(value); const changed = () => { const next = read(); setSettings(next); apply(next); }; window.addEventListener('homios:appearance', changed); return () => window.removeEventListener('homios:appearance', changed); }, []);
  function update(patch: Partial<AppearanceSettings>) { const next = normalize({ ...read(), ...patch }); localStorage.setItem(key, JSON.stringify(next)); apply(next); setSettings(next); window.dispatchEvent(new Event('homios:appearance')); }
  return { appearance: settings, updateAppearance: update };
}
