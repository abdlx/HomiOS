import { withAuth } from '../../../lib/api-auth.ts';
import { listManagedApps } from '../../../lib/apps/app-service.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  return res.json({ apps: listManagedApps() });
});
