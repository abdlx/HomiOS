import { withAuth } from '../../../../lib/api-auth.ts';
import { removeManagedApp } from '../../../../lib/apps/app-service.ts';
export default withAuth(async (req:any,res:any,session:any)=> {
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).end();
  try {
    await removeManagedApp(String(req.query.id),session);
    return res.json({ ok:true, dataPreserved:true });
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'App removal failed' });
  }
}, { adminOnly:true, ability:'write' });
