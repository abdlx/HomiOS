import { withAuth } from '../../../../lib/api-auth.ts';
import { disconnectCoolify } from '../../../../lib/apps/integration-storage.ts';
import { clearIntegrationStatusCache } from '../../../../lib/apps/integration-status.ts';
import { logAudit } from '../../../../lib/audit.ts';
export default withAuth(async (req:any,res:any,session:any)=> { if(req.method!=='POST') return res.status(405).end(); disconnectCoolify(); clearIntegrationStatusCache(); logAudit({teamId:session.teamId,userId:session.userId,action:'coolify.disconnected',resourceType:'integration',resourceId:'coolify'}); return res.json({ok:true}); }, {adminOnly:true,ability:'write'});
