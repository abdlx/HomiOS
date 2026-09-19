import { useCallback, useEffect, useState } from 'react';

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

export function useInstalledApps({ includeCoolifyResources = false }: { includeCoolifyResources?: boolean } = {}) {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const response = await fetch(includeCoolifyResources ? '/api/apps/installed?view=desktop' : '/api/apps/installed', { cache: 'no-store' });
      if (response.ok) setApps((await response.json()).apps || []);
    } finally { setLoading(false); }
  }, [includeCoolifyResources]);
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 60_000);
    const wake = () => void refresh();
    window.addEventListener('homios:apps-changed', wake);
    return () => { window.clearInterval(timer); window.removeEventListener('homios:apps-changed', wake); };
  }, [refresh]);
  return { apps, loading, refresh };
}
