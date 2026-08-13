import { withAuth } from '../../../lib/api-auth.ts';

const asEnabled = (value: string | undefined) => /^(1|true|yes|on)$/i.test(value || '');
const asPort = (value: string | undefined, fallback: number) => {
  const port = Number(value || fallback);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
};

async function isReachable(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const coolifyPort = asPort(process.env.COOLIFY_APP_PORT, 8000);
  const immichPort = asPort(process.env.IMMICH_APP_PORT, 2283);
  const coolifyEnabled = asEnabled(process.env.COOLIFY_ENABLED);
  const immichEnabled = asEnabled(process.env.IMMICH_ENABLED);
  const [coolifyOnline, immichOnline] = await Promise.all([
    coolifyEnabled ? isReachable(`http://127.0.0.1:${coolifyPort}/api/health`) : false,
    immichEnabled ? isReachable(`http://127.0.0.1:${immichPort}/`) : false,
  ]);

  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({
    coolify: { enabled: coolifyEnabled, online: coolifyOnline, port: coolifyPort },
    immich: { enabled: immichEnabled, online: immichOnline, port: immichPort },
  });
}, { adminOnly: true });
