import { afterEach, describe, expect, it } from 'vitest';
import { getDb } from '../lib/db.ts';
import { canAccessJob, enqueueJob, getJob, listJobEvents, stopJobWorker, updateJobAction } from '../lib/jobs.ts';

afterEach(() => {
  stopJobWorker();
  getDb().prepare('DELETE FROM jobs').run();
});

describe('durable job scheduling', () => {
  it('persists a future job without dispatching it early', async () => {
    const runAt = new Date(Date.now() + 60 * 60 * 1000);
    const id = enqueueJob({
      type: 'zip.create',
      name: 'Tomorrow archive',
      payload: { sourcePaths: ['/docs'] },
      teamId: 'team-a',
      userId: 7,
      runAt,
      maxAttempts: 5,
    });

    await new Promise((resolve) => setTimeout(resolve, 30));
    const job = getJob(id);
    expect(job?.status).toBe('queued');
    expect(job?.maxAttempts).toBe(5);
    expect(Date.parse(`${job?.runAt.replace(' ', 'T')}Z`)).toBeGreaterThan(Date.now());
    expect(listJobEvents(id)[0].type).toBe('scheduled');
  });

  it('deduplicates idempotency keys inside an owner scope', () => {
    const input = {
      type: 'file.copy' as const,
      payload: { sourcePath: '/a', destinationPath: '/b' },
      teamId: 'team-a',
      userId: 7,
      runAt: new Date(Date.now() + 60 * 60 * 1000),
      idempotencyKey: 'paste-a-to-b',
    };
    const first = enqueueJob(input);
    const duplicate = enqueueJob(input);
    const otherOwner = enqueueJob({ ...input, teamId: 'team-b', userId: 8 });

    expect(duplicate).toBe(first);
    expect(otherOwner).not.toBe(first);
  });

  it('supports pause, resume, cancel and retry as persisted state transitions', () => {
    const id = enqueueJob({
      type: 'file.move',
      runAt: new Date(Date.now() + 60 * 60 * 1000),
      teamId: 'team-a',
      userId: 7,
    });

    expect(updateJobAction(id, 'pause')?.status).toBe('paused');
    expect(updateJobAction(id, 'resume')?.status).toBe('queued');
    expect(updateJobAction(id, 'cancel')?.status).toBe('cancelled');
    expect(updateJobAction(id, 'retry')?.status).toBe('queued');
  });

  it('keeps job access scoped to its owner or team', () => {
    const id = enqueueJob({
      type: 'file.copy',
      runAt: new Date(Date.now() + 60 * 60 * 1000),
      teamId: 'team-a',
      userId: 7,
    });
    const job = getJob(id);
    expect(canAccessJob(job, { teamId: 'team-a', userId: 99 })).toBe(true);
    expect(canAccessJob(job, { teamId: 'team-b', userId: 7 })).toBe(true);
    expect(canAccessJob(job, { teamId: 'team-b', userId: 8 })).toBe(false);
  });
});
