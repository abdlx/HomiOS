import path from 'path';
import { withAuth } from '../../../lib/api-auth.ts';
import { enqueueJob } from '../../../lib/jobs.ts';
import { resolveTransferPath } from '../../../lib/file-transfers.ts';
import { CloudDriveError, moveCloudItem } from '../../../lib/cloud-drive.ts';

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
    const sourceIsCloud = String(sourcePath).replace(/^\/+/, '').startsWith('Cloud Drive/');
    const destinationIsCloud = String(destinationPath).replace(/^\/+/, '').startsWith('Cloud Drive/');
    if (sourceIsCloud || destinationIsCloud) {
      if (!sourceIsCloud || !destinationIsCloud) {
        return res.status(400).json({ error: 'Move files within Cloud Drive; use copy to transfer between local and cloud storage' });
      }
      await moveCloudItem(sourcePath, destinationPath);
      return res.json({ ok: true, immediate: true });
    }
    const source = resolveTransferPath(sourcePath);
    resolveTransferPath(destinationPath);
    const id = enqueueJob({
      type: 'file.move',
      name: `Move ${path.basename(source)}`,
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
    return res.status(error instanceof CloudDriveError ? error.status : 400).json({ error: error?.message || 'Could not queue move' });
  }
}, { adminOnly: true, ability: 'write' });
