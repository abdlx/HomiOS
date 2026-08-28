import { withAuth } from '../../../lib/api-auth.ts';
import { listAppStorageMounts } from '../../../lib/apps/mount-inventory.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  return res.json({ mounts: listAppStorageMounts() });
}, { adminOnly: true, ability: 'deploy' });
