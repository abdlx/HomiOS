import { withAuth } from '../../../lib/api-auth.ts';
import { listDesktopApps, listManagedApps } from '../../../lib/apps/app-service.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  const apps = req.query?.view === 'desktop' ? await listDesktopApps() : listManagedApps();
  return res.json({ apps });
});
