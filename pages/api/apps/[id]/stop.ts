import { withAuth } from '../../../../lib/api-auth.ts';
import { performAppAction } from '../../../../lib/apps/app-service.ts';
export default withAuth(async (req:any,res:any,session:any)=> req.method === 'POST' ? res.json({ app: await performAppAction(String(req.query.id),'stop',session) }) : res.status(405).end(), { adminOnly:true, ability:'write' });
