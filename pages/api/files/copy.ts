import path from 'path';
import { withAuth } from '../../../lib/api-auth.ts';
import { enqueueJob } from '../../../lib/jobs.ts';
import { resolveTransferPath } from '../../../lib/file-transfers.ts';

export default withAuth(async function handler(req: any, res: any, session: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { sourcePath, destinationPath, priority, runAt, idempotencyKey } = req.body || {};
  if (!sourcePath || !destinationPath) {
    return res.status(400).json({ error: 'Missing sourcePath or destinationPath' });
  }
  try {
    const source = resolveTransferPath(sourcePath);
    resolveTransferPath(destinationPath);
    const id = enqueueJob({
      type: 'file.copy',
      name: `Copy ${path.basename(source)}`,
      payload: { sourcePath, destinationPath },
      priority,
      runAt,
      idempotencyKey,
      teamId: session.teamId,
      userId: session.userId,
      maxAttempts: 3,
    });
    return res.status(202).json({ ok: true, id, jobId: id });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || 'Could not queue copy' });
  }
}, { adminOnly: true, ability: 'write' });
