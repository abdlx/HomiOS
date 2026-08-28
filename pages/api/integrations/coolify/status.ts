import { withAuth } from '../../../../lib/api-auth.ts';
import { getCoolifyIntegrationStatus } from '../../../../lib/apps/integration-status.ts';
export default withAuth(async (req:any,res:any)=> req.method === 'GET' ? res.json(await getCoolifyIntegrationStatus()) : res.status(405).end());
