import { withAuth } from '../../../../lib/api-auth.ts';
import { removeManagedApp } from '../../../../lib/apps/app-service.ts';
export default withAuth(async (req:any,res:any,session:any)=> { if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).end(); await removeManagedApp(String(req.query.id),session); return res.json({ ok:true, dataPreserved:true }); }, { adminOnly:true, ability:'write' });
