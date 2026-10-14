import { useEffect } from 'react';
import { useRemoteResource } from './useRemoteResource';

export interface InstalledApp {
  id: string;
  catalogId: string;
  name: string;
  status: string;
  primaryUrl: string | null;
  managedByHomiOS: boolean;
  resourceType?: 'service' | 'application';
  storage?: { accessAllMounts?: boolean };
}

export function useInstalledApps({ includeCoolifyResources = false, isActive = true }: { includeCoolifyResources?: boolean; isActive?: boolean } = {}) {
  const resource = useRemoteResource<{ apps: InstalledApp[]; refreshError?: string }>(includeCoolifyResources ? '/api/apps/installed?view=desktop' : '/api/apps/installed?refresh=1', isActive);
  const { refresh } = resource;
  useEffect(() => {
    if (!isActive) return;
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, includeCoolifyResources ? 60000 : 5000);
    const wake = () => { if (!document.hidden) void refresh(); };
    window.addEventListener('homios:apps-changed', wake); document.addEventListener('visibilitychange', wake);
    return () => { window.clearInterval(timer); window.removeEventListener('homios:apps-changed', wake); document.removeEventListener('visibilitychange', wake); };
  }, [refresh, isActive, includeCoolifyResources]);
  return { apps: resource.data?.apps || [], loading: resource.loading, refreshing: resource.refreshing, error: resource.error || resource.data?.refreshError, refresh };
}
