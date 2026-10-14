import path from 'path';
import { withAuth } from '../../../lib/api-auth.ts';
import { enqueueJob } from '../../../lib/jobs.ts';
import { resolveTransferPath } from '../../../lib/file-transfers.ts';
import fs from 'node:fs';

export default withAuth(async function handler(req: any, res: any, session: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const { sourcePath, destinationPath, priority, runAt, idempotencyKey, collision = 'error', batchId } = req.body || {};
  if (!['error', 'replace', 'keep-both', 'skip'].includes(collision) || batchId != null && (typeof batchId !== 'string' || batchId.length > 128)) return res.status(400).json({ error: 'Invalid transfer options' });
  if (!sourcePath || !destinationPath) {
    return res.status(400).json({ error: 'Missing sourcePath or destinationPath' });
  }
  try {
    const sourceIsCloud = String(sourcePath).replace(/^\/+/, '').startsWith('Cloud Drive/');
    const destinationIsCloud = String(destinationPath).replace(/^\/+/, '').startsWith('Cloud Drive/');
    if (sourceIsCloud || destinationIsCloud) {
      return res.status(400).json({ error: 'Use upload or download to transfer files between local and cloud storage' });
    }
    const source = resolveTransferPath(sourcePath);
    const destination = resolveTransferPath(destinationPath);
    if (source === destination && collision !== 'keep-both' || destination.startsWith(source + path.sep) || source.startsWith(destination + path.sep)) return res.status(400).json({ error: 'Choose a different destination folder' });
    if (fs.existsSync(destination) && collision === 'error') return res.status(409).json({ code: 'conflict', error: 'Destination already exists' });
    const id = enqueueJob({
      type: 'file.copy',
      name: `Copy ${path.basename(source)}`,
      payload: { sourcePath, destinationPath, collision, batchId },
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
