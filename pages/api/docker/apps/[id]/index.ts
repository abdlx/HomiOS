import { getApp, updateApp, deleteApp } from '../../../../../lib/docker-db';

export default async function handler(req: any, res: any) {
  const { id } = req.query; // app id
  
  try {
    if (req.method === 'GET') {
      const app = getApp(id);
      if (!app) return res.status(404).json({ error: 'App not found' });
      return res.status(200).json(app);
    } else if (req.method === 'PATCH') {
      const updatedApp = updateApp(id, req.body);
      return res.status(200).json(updatedApp);
    } else if (req.method === 'DELETE') {
      deleteApp(id);
      return res.status(200).json({ success: true });
    } else {
      res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
