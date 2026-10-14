import { withAuth } from '../../../lib/api-auth.ts';
import { listDesktopApps, listManagedApps } from '../../../lib/apps/app-service.ts';
import { reconcileManagedApps } from '../../../lib/apps/reconciliation.ts';
let lastRefresh = 0;
let refreshInFlight: Promise<unknown> | null = null;

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  let refreshError: string | undefined;
  if (req.query?.refresh === '1') {
    if (!refreshInFlight && Date.now() - lastRefresh > 4000) {
      lastRefresh = Date.now();
      refreshInFlight = reconcileManagedApps({ configureStorage: false }).finally(() => { refreshInFlight = null; });
    }
    try { await refreshInFlight; } catch { refreshError = 'Runtime status could not be refreshed. Showing saved status.'; }
  }
  const apps = req.query?.view === 'desktop' ? await listDesktopApps() : listManagedApps();
  return res.json({ apps, refreshError });
});
