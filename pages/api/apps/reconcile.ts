import { withAuth } from '../../../lib/api-auth.ts';
import { reconcileManagedApps } from '../../../lib/apps/reconciliation.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'POST') return res.status(405).end();
  return res.json({ apps: await reconcileManagedApps() });
}, { adminOnly: true, ability: 'write' });
