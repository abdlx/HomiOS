import { useEffect, useState } from 'react';

export type BackgroundPollingMode = 'live' | 'balanced' | 'quiet';
export type ResourceProfile = 'beautiful' | 'balanced' | 'server_saver';

export interface PerformanceSettings {
  profile: ResourceProfile;
  glassSurfaces: boolean;
  reduceMotion: boolean;
  backgroundPolling: BackgroundPollingMode;
  preloadHiddenApps: boolean;
}

const STORAGE_KEY = 'openfinder_performance_settings';

const DEFAULT_SETTINGS: PerformanceSettings = {
  profile: 'balanced',
  glassSurfaces: true,
  reduceMotion: false,
  backgroundPolling: 'balanced',
  preloadHiddenApps: false,
};

function normalizeSettings(value: unknown): PerformanceSettings {
  const candidate = value && typeof value === 'object' ? value as Partial<PerformanceSettings> : {};
  const backgroundPolling =
    candidate.backgroundPolling === 'live' ||
    candidate.backgroundPolling === 'balanced' ||
    candidate.backgroundPolling === 'quiet'
      ? candidate.backgroundPolling
      : DEFAULT_SETTINGS.backgroundPolling;

  return {
    profile: candidate.profile === 'beautiful' || candidate.profile === 'server_saver' ? candidate.profile : DEFAULT_SETTINGS.profile,
    glassSurfaces: typeof candidate.glassSurfaces === 'boolean' ? candidate.glassSurfaces : DEFAULT_SETTINGS.glassSurfaces,
    reduceMotion: typeof candidate.reduceMotion === 'boolean' ? candidate.reduceMotion : DEFAULT_SETTINGS.reduceMotion,
    backgroundPolling,
    preloadHiddenApps: typeof candidate.preloadHiddenApps === 'boolean' ? candidate.preloadHiddenApps : DEFAULT_SETTINGS.preloadHiddenApps,
  };
}

function readSettings(): PerformanceSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeSettings(JSON.parse(saved)) : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(settings: PerformanceSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent('openfinder:performance-settings-changed', { detail: settings }));
}

export function usePerformanceSettings() {
  const [settings, setSettings] = useState<PerformanceSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    setSettings(readSettings());
  }, []);

  useEffect(() => {
    const handleSettingsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<PerformanceSettings>;
      setSettings(normalizeSettings(customEvent.detail));
    };

    window.addEventListener('openfinder:performance-settings-changed', handleSettingsChanged);
    return () => window.removeEventListener('openfinder:performance-settings-changed', handleSettingsChanged);
  }, []);

  const updateSettings = (updates: Partial<PerformanceSettings>) => {
    setSettings((current) => {
      const next = normalizeSettings({ ...current, ...updates });
      if (updates.profile && updates.profile !== current.profile) {
        fetch('/api/system/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: next.profile }),
        }).catch(() => {});
      }
      writeSettings(next);
      return next;
    });
  };

  return { settings, updateSettings };
}
