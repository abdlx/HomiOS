import { withAuth } from '../../../lib/api-auth.ts';
import { CloudDriveError, cloudConnectUrl } from '../../../lib/cloud-drive.ts';

export default withAuth(async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    return res.redirect(302, await cloudConnectUrl());
  } catch (error) {
    const status = error instanceof CloudDriveError ? error.status : 502;
    return res.status(status).json({ error: error instanceof Error ? error.message : 'Cloud storage unavailable' });
  }
}, { adminOnly: true });
