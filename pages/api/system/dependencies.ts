import { withAuth } from '../../../lib/api-auth.ts';
import { checkDependencies } from '../../../lib/dependencies.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  return res.json(await checkDependencies());
});
