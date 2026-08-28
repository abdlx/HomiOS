import { withAuth } from '../../../../lib/api-auth.ts';
import { getAppLogs } from '../../../../lib/apps/app-service.ts';
export default withAuth(async (req:any,res:any)=> req.method === 'GET' ? res.json({ logs: await getAppLogs(String(req.query.id)) }) : res.status(405).end());
