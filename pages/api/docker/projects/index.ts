import { getProjects, createProject } from '../../../../lib/docker-db.ts';
import { withAuth } from '../../../../lib/api-auth.ts';
import { validateName, ValidationError } from '../../../../lib/validate.ts';
import crypto from 'crypto';

export default withAuth(async (req: any, res: any) => {
  try {
    if (req.method === 'GET') {
      return res.status(200).json(getProjects());
    }
    if (req.method === 'POST') {
      const name = validateName(req.body?.name || '');
      const description = String(req.body?.description || '').slice(0, 500);
      const project = createProject(crypto.randomUUID(), name, description);
      return res.status(201).json(project);
    }
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err: any) {
    const code = err instanceof ValidationError ? 400 : 500;
    return res.status(code).json({ error: err.message });
  }
});
