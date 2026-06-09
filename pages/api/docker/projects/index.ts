import { getProjects, createProject } from '../../../../lib/docker-db';
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const projects = getProjects();
      return res.status(200).json(projects);
    } else if (req.method === 'POST') {
      const { name, description } = req.body;
      const id = crypto.randomUUID();
      const newProject = createProject(id, name, description || '');
      return res.status(201).json(newProject);
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
