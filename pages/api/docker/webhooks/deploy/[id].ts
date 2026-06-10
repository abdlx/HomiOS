import crypto from 'crypto';
import { getApp } from '../../../../../lib/docker-db.ts';
import { enqueueDeploy } from '../../../../../lib/deploy-engine.ts';

/**
 * External CI/CD deploy webhook. NOT session-authenticated (called by GitHub
 * etc.) — instead it requires the app's per-resource secret, supplied via
 * `?secret=` or the `x-webhook-secret` header. Compared in constant time.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }
  const { id } = req.query;
  const app = getApp(id) as any;
  if (!app) return res.status(404).json({ error: 'App not found' });

  const provided = String(req.query.secret || req.headers['x-webhook-secret'] || '');
  if (!app.webhook_secret || !provided || !timingSafeEqual(provided, app.webhook_secret)) {
    return res.status(401).json({ error: 'Invalid webhook secret' });
  }

  try {
    const deploymentId = enqueueDeploy(id);
    return res.status(202).json({ status: 'queued', deploymentId });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
