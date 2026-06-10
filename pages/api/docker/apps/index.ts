import { getAllApps } from '../../../../lib/docker-db.ts';
import { withAuth } from '../../../../lib/api-auth.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
  try {
    return res.status(200).json(getAllApps());
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});
