import { getAllApps, initDockerDB } from '../../lib/docker-db';

export default async function handler(req: any, res: any) {
  try {
    initDockerDB();
    const apps = getAllApps();
    res.status(200).json({ success: true, apps });
  } catch (err: any) {
    res.status(200).json({ success: false, error: err.message, stack: err.stack });
  }
}
