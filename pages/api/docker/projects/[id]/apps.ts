import { getAppsByProject, createApp } from '../../../../../lib/docker-db';
import crypto from 'crypto';

export default async function handler(req: any, res: any) {
  const { id } = req.query; // project id
  
  try {
    if (req.method === 'GET') {
      const apps = getAppsByProject(id);
      return res.status(200).json(apps);
    } else if (req.method === 'POST') {
      const { name, build_pack, docker_image, docker_image_tag, compose_content, ports, env_vars } = req.body;
      const appId = crypto.randomUUID();
      const newApp = createApp(
        appId, 
        id, 
        name, 
        build_pack, 
        docker_image || null, 
        docker_image_tag || null, 
        compose_content || null, 
        ports || null, 
        env_vars || null
      );
      return res.status(201).json(newApp);
    } else {
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
