import { getDb } from './db.ts';

export type ResourceProfile = 'beautiful' | 'balanced' | 'server_saver';

export interface ResourceProfileConfig {
  profile: ResourceProfile;
  pollingMs: {
    desktop: number;
    activity: number;
  };
  concurrency: {
    cpu: number;
    io: number;
    media: number;
    backup: number;
  };
  thumbnails: {
    eager: boolean;
    maxPerRun: number;
  };
  indexing: {
    maxFilesPerRun: number;
    maxTextBytes: number;
  };
}

export const RESOURCE_PROFILES: Record<ResourceProfile, ResourceProfileConfig> = {
  beautiful: {
    profile: 'beautiful',
    pollingMs: { desktop: 3000, activity: 2000 },
    concurrency: { cpu: 2, io: 3, media: 2, backup: 1 },
    thumbnails: { eager: true, maxPerRun: 3000 },
    indexing: { maxFilesPerRun: 30000, maxTextBytes: 1024 * 1024 },
  },
  balanced: {
    profile: 'balanced',
    pollingMs: { desktop: 7000, activity: 4000 },
    concurrency: { cpu: 1, io: 2, media: 1, backup: 1 },
    thumbnails: { eager: true, maxPerRun: 1500 },
    indexing: { maxFilesPerRun: 15000, maxTextBytes: 512 * 1024 },
  },
  server_saver: {
    profile: 'server_saver',
    pollingMs: { desktop: 15000, activity: 10000 },
    concurrency: { cpu: 1, io: 1, media: 1, backup: 1 },
    thumbnails: { eager: false, maxPerRun: 400 },
    indexing: { maxFilesPerRun: 5000, maxTextBytes: 128 * 1024 },
  },
};

export function getResourceProfile(): ResourceProfile {
  try {
    const row = getDb().prepare('SELECT value FROM app_settings WHERE key = ?').get('resource_profile') as any;
    const value = row ? JSON.parse(row.value) : null;
    if (value === 'beautiful' || value === 'balanced' || value === 'server_saver') return value;
  } catch {
    // Fall through to default.
  }
  return 'balanced';
}

export function setResourceProfile(profile: ResourceProfile) {
  const value = profile === 'beautiful' || profile === 'server_saver' ? profile : 'balanced';
  getDb().prepare(`
    INSERT INTO app_settings (key, value, updated_at)
    VALUES ('resource_profile', ?, CURRENT_TIMESTAMP)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
  `).run(JSON.stringify(value));
  return RESOURCE_PROFILES[value];
}

export function getResourceProfileConfig() {
  return RESOURCE_PROFILES[getResourceProfile()];
}
