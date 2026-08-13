import { withAuth } from '../../../lib/api-auth.ts';
import { enqueueJob, listJobs, startJobWorker, JobType } from '../../../lib/jobs.ts';

const VALID_TYPES = new Set<JobType>([
  'index.files',
  'index.photos',
  'thumbnail.generate',
  'backup.run',
  'backup.restore',
  'sync.run',
  'ocr.run',
  'zip.create',
  'file.move',
  'file.copy',
]);

export default withAuth(async (req: any, res: any, session: any) => {
  startJobWorker();

  if (req.method === 'GET') {
    return res.json(listJobs({
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      limit: Number(req.query.limit) || 50,
      teamId: session.teamId,
      userId: session.userId,
    }));
  }

  if (req.method === 'POST') {
    const { type, payload, name, priority, runAt, maxAttempts, idempotencyKey } = req.body || {};
    if (!VALID_TYPES.has(type)) return res.status(400).json({ error: 'Invalid job type' });
    const id = enqueueJob({
      type,
      payload,
      name,
      priority,
      runAt,
      maxAttempts,
      idempotencyKey,
      teamId: session.teamId,
      userId: session.userId,
    });
    return res.status(201).json({ ok: true, id });
  }

  res.setHeader('Allow', ['GET', 'POST']);
  return res.status(405).end();
});
