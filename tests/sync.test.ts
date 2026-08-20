/**
 * The drive-to-drive backup engine.
 *
 * These run against real temp directories because the failure modes that matter
 * are filesystem-shaped: copying a drive into itself, deleting the wrong side of
 * a mirror, or re-copying files that were already up to date.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

import { mockReq, mockRes } from './helpers.ts';
import { withTransaction } from '../lib/db.ts';
import { createSession, createUserWithPasswordHash, getSession } from '../lib/auth.ts';
import syncIndexHandler from '../pages/api/sync/index.ts';
import syncPlanHandler from '../pages/api/sync/[id].ts';
import {
  SYNC_FOLDER,
  createSyncPlan,
  deleteSyncPlan,
  getSyncPlan,
  listSyncPlans,
  listSyncRuns,
  runSyncPlan,
  updateSyncPlan,
} from '../lib/sync.ts';

const TEAM = 'team-sync';
const USER = 42;

let root: string;

function makeDir(name: string): string {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function write(base: string, relative: string, contents: string): string {
  const full = path.join(base, relative);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  return full;
}

/** Where a given source lands inside a destination drive. */
function mirrored(destination: string, source: string, relative = ''): string {
  return path.join(destination, SYNC_FOLDER, path.basename(source), relative);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), `homios-sync-${crypto.randomUUID().slice(0, 8)}-`));
  for (const plan of listSyncPlans(TEAM, USER)) deleteSyncPlan(plan.id);
});

describe('sync plans', () => {
  it('rejects a plan with no usable source/destination pairing', () => {
    const drive = makeDir('drive');
    expect(() => createSyncPlan({
      teamId: TEAM, userId: USER, name: 'self', sources: [drive], destinations: [drive],
    })).toThrow(/overlap/i);

    expect(() => createSyncPlan({
      teamId: TEAM, userId: USER, name: 'nested', sources: [drive], destinations: [path.join(drive, 'sub')],
    })).toThrow(/overlap/i);

    expect(() => createSyncPlan({
      teamId: TEAM, userId: USER, name: 'empty', sources: [], destinations: [makeDir('dest')],
    })).toThrow(/source/i);
  });

  it('rejects an unknown schedule and keeps known ones', () => {
    const source = makeDir('src');
    const destination = makeDir('dst');
    expect(() => createSyncPlan({
      teamId: TEAM, userId: USER, name: 'bad', sources: [source], destinations: [destination], schedule: 'yearly' as any,
    })).toThrow(/schedule/i);

    const id = createSyncPlan({
      teamId: TEAM, userId: USER, name: 'good', sources: [source], destinations: [destination], schedule: 'weekly',
    });
    expect(getSyncPlan(id)?.schedule).toBe('weekly');
  });

  it('round-trips sources, destinations and flags through an update', () => {
    const a = makeDir('a');
    const b = makeDir('b');
    const dest = makeDir('dest');
    const id = createSyncPlan({ teamId: TEAM, userId: USER, name: 'plan', sources: [a], destinations: [dest] });

    const updated = updateSyncPlan(id, { sources: [a, b], mirrorDeletes: true, enabled: false, name: 'renamed' });
    expect(updated?.sources.sort()).toEqual([a, b].sort());
    expect(updated?.mirrorDeletes).toBe(true);
    expect(updated?.enabled).toBe(false);
    expect(updated?.name).toBe('renamed');
  });
});

describe('runSyncPlan', () => {
  it('fans every source out to every destination', async () => {
    const photos = makeDir('photos');
    const docs = makeDir('docs');
    const backup1 = makeDir('backup1');
    const backup2 = makeDir('backup2');
    write(photos, 'trip/beach.jpg', 'beach');
    write(docs, 'notes.txt', 'notes');

    const id = createSyncPlan({
      teamId: TEAM, userId: USER, name: 'fan-out',
      sources: [photos, docs], destinations: [backup1, backup2],
    });
    const result = await runSyncPlan({ planId: id });

    expect(result.filesCopied).toBe(4); // 2 files x 2 destinations
    for (const destination of [backup1, backup2]) {
      expect(fs.readFileSync(mirrored(destination, photos, 'trip/beach.jpg'), 'utf8')).toBe('beach');
      expect(fs.readFileSync(mirrored(destination, docs, 'notes.txt'), 'utf8')).toBe('notes');
    }
    expect(getSyncPlan(id)?.lastStatus).toBe('completed');
  });

  it('skips files that are already up to date and copies changed ones', async () => {
    const source = makeDir('src');
    const destination = makeDir('dst');
    write(source, 'a.txt', 'one');
    write(source, 'nested/b.txt', 'two');

    const id = createSyncPlan({ teamId: TEAM, userId: USER, name: 'incremental', sources: [source], destinations: [destination] });
    const first = await runSyncPlan({ planId: id });
    expect(first.filesCopied).toBe(2);
    expect(first.filesSkipped).toBe(0);

    const second = await runSyncPlan({ planId: id });
    expect(second.filesCopied).toBe(0);
    expect(second.filesSkipped).toBe(2);

    write(source, 'a.txt', 'one-changed-and-longer');
    const third = await runSyncPlan({ planId: id });
    expect(third.filesCopied).toBe(1);
    expect(third.filesSkipped).toBe(1);
    expect(fs.readFileSync(mirrored(destination, source, 'a.txt'), 'utf8')).toBe('one-changed-and-longer');
  });

  it('leaves extra backup files alone unless mirroring deletions', async () => {
    const source = makeDir('src');
    const destination = makeDir('dst');
    write(source, 'keep.txt', 'keep');
    write(source, 'gone.txt', 'gone');

    const id = createSyncPlan({ teamId: TEAM, userId: USER, name: 'deletes', sources: [source], destinations: [destination] });
    await runSyncPlan({ planId: id });
    fs.rmSync(path.join(source, 'gone.txt'));

    const kept = await runSyncPlan({ planId: id });
    expect(kept.filesDeleted).toBe(0);
    expect(fs.existsSync(mirrored(destination, source, 'gone.txt'))).toBe(true);

    updateSyncPlan(id, { mirrorDeletes: true });
    const pruned = await runSyncPlan({ planId: id });
    expect(pruned.filesDeleted).toBe(1);
    expect(fs.existsSync(mirrored(destination, source, 'gone.txt'))).toBe(false);
    expect(fs.existsSync(mirrored(destination, source, 'keep.txt'))).toBe(true);
  });

  it('never touches anything outside its own backup folder', async () => {
    const source = makeDir('src');
    const destination = makeDir('dst');
    write(source, 'a.txt', 'a');
    const bystander = write(destination, 'someone-elses-data.txt', 'precious');

    const id = createSyncPlan({
      teamId: TEAM, userId: USER, name: 'safe-deletes', sources: [source], destinations: [destination], mirrorDeletes: true,
    });
    await runSyncPlan({ planId: id });

    expect(fs.readFileSync(bystander, 'utf8')).toBe('precious');
  });

  it('records a skipped pair when a drive is unavailable, and still syncs the rest', async () => {
    const source = makeDir('src');
    const good = makeDir('good');
    const missing = path.join(root, 'not-mounted');
    write(source, 'a.txt', 'a');

    const id = createSyncPlan({ teamId: TEAM, userId: USER, name: 'partial', sources: [source], destinations: [good, missing] });
    const result = await runSyncPlan({ planId: id });

    expect(result.filesCopied).toBe(1);
    expect(fs.existsSync(mirrored(good, source, 'a.txt'))).toBe(true);
    const skipped = result.pairs.find((pair) => pair.status === 'skipped');
    expect(skipped?.error).toMatch(/not available/i);
  });

  it('disambiguates two sources that share a folder name', async () => {
    const a = makeDir('mount-a/data');
    const b = makeDir('mount-b/data');
    const destination = makeDir('dst');
    write(a, 'a.txt', 'from-a');
    write(b, 'b.txt', 'from-b');

    const id = createSyncPlan({ teamId: TEAM, userId: USER, name: 'collision', sources: [a, b], destinations: [destination] });
    const result = await runSyncPlan({ planId: id });

    expect(result.filesCopied).toBe(2);
    const targets = new Set(result.pairs.map((pair) => pair.target));
    expect(targets.size).toBe(2);
    for (const pair of result.pairs) {
      expect(fs.readdirSync(pair.target).length).toBe(1);
    }
  });

  it('mirrors a nested tree without following symlinks back up it', async () => {
    const source = makeDir('src');
    const destination = makeDir('dst');
    write(source, 'deep/deeper/file.txt', 'deep');
    try {
      fs.symlinkSync(source, path.join(source, 'deep', 'loop'), 'junction');
    } catch {
      return; // Windows without developer mode cannot create links; the copy path is covered elsewhere.
    }

    const id = createSyncPlan({ teamId: TEAM, userId: USER, name: 'symlink', sources: [source], destinations: [destination] });
    const result = await runSyncPlan({ planId: id });

    expect(result.filesCopied).toBe(1);
    expect(fs.existsSync(mirrored(destination, source, 'deep/loop'))).toBe(false);
  });

  it('writes a run record that survives for the history view', async () => {
    const source = makeDir('src');
    const destination = makeDir('dst');
    write(source, 'a.txt', 'hello');

    const id = createSyncPlan({ teamId: TEAM, userId: USER, name: 'history', sources: [source], destinations: [destination] });
    await runSyncPlan({ planId: id });

    const runs = listSyncRuns({ planIds: [id] });
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe('completed');
    expect(runs[0].filesCopied).toBe(1);
    expect(runs[0].bytesCopied).toBe(5);
    expect(runs[0].pairs[0].target).toBe(mirrored(destination, source));
  });
});

describe('/api/sync', () => {
  let ownerSession: string;
  let otherSession: string;

  beforeAll(async () => {
    const ownerId = withTransaction((tx) =>
      createUserWithPasswordHash(tx, 'sync-owner@homios.test', 'x', { isAdmin: true })
    );
    const otherId = withTransaction((tx) =>
      createUserWithPasswordHash(tx, 'sync-other@homios.test', 'x', { isAdmin: true })
    );
    ownerSession = createSession(ownerId);
    otherSession = createSession(otherId);
  });

  const post = async (sessionId: string, body: any) => {
    const res = mockRes();
    await syncIndexHandler(mockReq({ method: 'POST', sessionId, body }), res);
    return res;
  };

  it('creates a plan and lists it back for its owner', async () => {
    const source = makeDir('api-src');
    const destination = makeDir('api-dst');
    const created = await post(ownerSession, { name: 'API plan', sources: [source], destinations: [destination] });
    expect(created.statusCode).toBe(201);

    const listed = mockRes();
    await syncIndexHandler(mockReq({ method: 'GET', sessionId: ownerSession }), listed);
    expect(listed.body.plans.map((plan: any) => plan.id)).toContain(created.body.id);
  });

  it('rejects a plan whose destination sits inside its source', async () => {
    const source = makeDir('api-nested');
    const res = await post(ownerSession, {
      name: 'nested', sources: [source], destinations: [path.join(source, 'inner')],
    });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/overlap/i);
  });

  it('hides another admin\'s personal plan from read, update and delete', async () => {
    const source = makeDir('api-private-src');
    const destination = makeDir('api-private-dst');
    const created = await post(ownerSession, { name: 'private', sources: [source], destinations: [destination] });
    const planId = created.body.id;

    // Only the owner's personal team knows about it.
    const otherList = mockRes();
    await syncIndexHandler(mockReq({ method: 'GET', sessionId: otherSession }), otherList);
    expect(otherList.body.plans.map((plan: any) => plan.id)).not.toContain(planId);

    for (const method of ['GET', 'PATCH', 'DELETE']) {
      const res = mockRes();
      await syncPlanHandler(mockReq({ method, sessionId: otherSession, query: { id: planId }, body: { name: 'stolen' } }), res);
      expect(res.statusCode).toBe(404);
    }

    // Still intact for its owner.
    const ownerRead = mockRes();
    await syncPlanHandler(mockReq({ method: 'GET', sessionId: ownerSession, query: { id: planId } }), ownerRead);
    expect(ownerRead.body.name).toBe('private');
    expect((await getSession(mockReq({ sessionId: ownerSession })))?.isAdmin).toBe(true);
  });
});
