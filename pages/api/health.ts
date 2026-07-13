/**
 * Liveness/readiness probe.
 *
 * Deliberately unauthenticated (orchestrators can't hold a session) and deliberately
 * uninformative: it reports up/down only — never version, hostname, or error strings —
 * so it can't be used to fingerprint the instance. It used to return a hardcoded `ok`,
 * which meant a load balancer kept routing traffic to a process whose database had
 * gone away.
 */
import { getDb } from '../../lib/db.ts';

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).end();

  res.setHeader('Cache-Control', 'no-store');

  try {
    getDb().prepare('SELECT 1').get();
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[/api/health] database unreachable:', err);
    return res.status(503).json({ status: 'unavailable' });
  }
}
