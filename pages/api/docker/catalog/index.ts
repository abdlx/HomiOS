import { withAuth } from '../../../../lib/api-auth.ts';
import { getCatalog } from '../../../../lib/app-catalog.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end();
  }
  return res.status(200).json(getCatalog());
});
