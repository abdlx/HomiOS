import { withAuth } from '../../../../lib/api-auth.ts';
import { bootstrapManagedCoolifyIntegration } from '../../../../lib/apps/managed-bootstrap.ts';
import { clearIntegrationStatusCache } from '../../../../lib/apps/integration-status.ts';
export default withAuth(async (req:any,res:any)=> { if(req.method!=='POST') return res.status(405).end(); try { const result=await bootstrapManagedCoolifyIntegration(); clearIntegrationStatusCache(); return res.json(result); } catch(error:any) { return res.status(409).json({error:error?.message,manualFallback:true}); } }, {adminOnly:true,ability:'write'});
