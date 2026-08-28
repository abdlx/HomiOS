/** Compatibility inventory route backed by the HomiOS ownership registry. */
import { withAuth } from '../../../lib/api-auth.ts';
import { listManagedApps } from '../../../lib/apps/app-service.ts';
export default withAuth(async (req:any,res:any)=> req.method === 'GET' ? res.json(listManagedApps()) : res.status(405).end());
