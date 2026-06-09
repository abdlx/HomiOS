import { getAllApps } from '../../../../lib/docker-db';

export default async function handler(req: any, res: any) {
  try {
    if (req.method === 'GET') {
      const apps = getAllApps();
      return res.status(200).json(apps);
    } else {
      res.setHeader('Allow', ['GET']);
      return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
