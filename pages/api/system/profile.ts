import { withAuth } from '../../../lib/api-auth.ts';
import { getResourceProfileConfig, setResourceProfile } from '../../../lib/resource-profile.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method === 'GET') return res.json(getResourceProfileConfig());
  if (req.method === 'PATCH') {
    const profile = req.body?.profile;
    if (!['beautiful', 'balanced', 'server_saver'].includes(profile)) {
      return res.status(400).json({ error: 'Invalid profile' });
    }
    return res.json(setResourceProfile(profile));
  }
  res.setHeader('Allow', ['GET', 'PATCH']);
  return res.status(405).end();
}, { adminOnly: true, ability: 'write' });
