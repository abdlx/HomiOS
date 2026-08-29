import { withAuth } from '../../../../lib/api-auth.ts';
import { getCoolifyIntegrationStatus, getCoolifyIntegrationStatusSnapshot } from '../../../../lib/apps/integration-status.ts';
export default withAuth(async (req:any,res:any) => {
  if (req.method !== 'GET') return res.status(405).end();
  const value = req.query.refresh === '1'
    ? await getCoolifyIntegrationStatus(true)
    : getCoolifyIntegrationStatusSnapshot();
  return res.json(value);
});
