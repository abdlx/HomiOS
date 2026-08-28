import { withAuth } from '../../../../lib/api-auth.ts';
import { getManagedApp } from '../../../../lib/apps/app-service.ts';

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  const app = getManagedApp(String(req.query.id));
  return app ? res.json({ app }) : res.status(404).json({ error: 'Managed app not found' });
});
