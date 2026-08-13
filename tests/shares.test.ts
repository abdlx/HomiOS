import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDb, withTransaction } from '../lib/db.ts';
import { createSession, createUserWithPasswordHash } from '../lib/auth.ts';
import sharesHandler from '../pages/api/shares/index.ts';
import { resolveWithinRoot } from '../lib/safe-paths.ts';
import { mockReq, mockRes } from './helpers.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openfinder-samba-'));
const sambaRoot = path.join(root, 'storage');
const additionalRoot = path.join(root, 'additional-shares');
const confPath = path.join(root, 'smb.conf');
const okCommand = process.platform === 'win32' ? 'cmd.exe' : 'true';

let sessionId: string;
let sambaUserId: number;

beforeAll(() => {
  fs.mkdirSync(sambaRoot, { recursive: true });
  fs.mkdirSync(additionalRoot, { recursive: true });
  process.env.OPENFINDER_SAMBA_ROOT = sambaRoot;
  process.env.OPENFINDER_SAMBA_ALLOWED_ROOTS = additionalRoot;
  process.env.SAMBA_CONF_PATH = confPath;
  process.env.SAMBA_TESTPARM_BIN = okCommand;
  process.env.SAMBA_CONTROL_BIN = okCommand;
  process.env.SAMBA_SYSTEMCTL_BIN = okCommand;
  process.env.SAMBA_PKILL_BIN = okCommand;
  const userId = withTransaction((db) => createUserWithPasswordHash(db, 'shares@openfinder.test', 'x', { isAdmin: true }));
  sessionId = createSession(userId);
  sambaUserId = Number(getDb().prepare("INSERT INTO samba_users (username, enabled) VALUES ('sharetest', 1)").run().lastInsertRowid);
});

beforeEach(() => {
  getDb().prepare('DELETE FROM shares').run();
  try { fs.unlinkSync(confPath); } catch {}
});

afterAll(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

async function post(body: any) {
  const response = mockRes();
  await sharesHandler(mockReq({ method: 'POST', sessionId, body: { userIds: [sambaUserId], ...body } }), response);
  return response;
}

describe('/api/shares', () => {
  it.skipIf(process.platform === 'win32')('allows folders in standard host data locations', () => {
    expect(resolveWithinRoot('/home/openfinder-share-test')).toBe('/home/openfinder-share-test');
    expect(resolveWithinRoot('/srv/openfinder-share-test')).toBe('/srv/openfinder-share-test');
  });

  it('creates a Samba share, validates the config, and installs it', async () => {
    const sharePath = path.join(sambaRoot, 'photos');
    const response = await post({ name: 'Photos', path: sharePath });

    expect(response.statusCode).toBe(201);
    expect(response.body.uncPath).toBe('\\\\server\\Photos');
    expect(fs.readFileSync(confPath, 'utf8')).toContain(`[Photos]\n  path = ${sharePath}`);
    expect(getDb().prepare('SELECT COUNT(*) as count FROM shares').get().count).toBe(1);
  });

  it('allows a share inside an explicitly configured additional root', async () => {
    const sharePath = path.join(additionalRoot, 'documents');
    const response = await post({ name: 'Documents', path: sharePath });

    expect(response.statusCode).toBe(201);
    expect(fs.readFileSync(confPath, 'utf8')).toContain(`[Documents]\n  path = ${sharePath}`);
  });

  it('returns an actionable 400 instead of 500 for paths outside every allowed root', async () => {
    const response = await post({ name: 'Unsafe', path: path.join(root, 'outside') });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain('allowed root');
    expect(response.body.error).toContain(sambaRoot);
    expect(response.body.error).toContain(additionalRoot);
  });

  it('refuses to publish a share that no Samba user can authenticate to', async () => {
    const response = await post({ name: 'LockedOut', path: path.join(sambaRoot, 'locked-out'), userIds: [] });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toMatch(/select at least one/i);
    expect(getDb().prepare("SELECT id FROM shares WHERE name = 'LockedOut'").get()).toBeUndefined();
  });

  it('returns 409 for a duplicate share name', async () => {
    const firstPath = path.join(sambaRoot, 'first');
    const secondPath = path.join(sambaRoot, 'second');
    expect((await post({ name: 'Media', path: firstPath })).statusCode).toBe(201);
    const duplicate = await post({ name: 'Media', path: secondPath });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.body.error).toMatch(/already exists/i);
  });

  it('rolls the database insert back when Samba tooling is unavailable', async () => {
    process.env.SAMBA_TESTPARM_BIN = path.join(root, 'missing-testparm');
    const response = await post({ name: 'Broken', path: path.join(sambaRoot, 'broken') });
    process.env.SAMBA_TESTPARM_BIN = okCommand;

    expect(response.statusCode).toBe(503);
    expect(response.body.error).toMatch(/not installed|not available/i);
    expect(getDb().prepare("SELECT id FROM shares WHERE name = 'Broken'").get()).toBeUndefined();
  });

  it('repairs an old database-only share when the same name and path are retried', async () => {
    const sharePath = path.join(sambaRoot, 'legacy');
    fs.mkdirSync(sharePath, { recursive: true });
    const userId = getDb().prepare('SELECT user_id as userId FROM sessions WHERE id = ?').get(sessionId).userId;
    getDb().prepare('INSERT INTO shares (user_id, name, path) VALUES (?, ?, ?)').run(userId, 'Legacy', sharePath);

    const response = await post({ name: 'Legacy', path: sharePath });
    expect(response.statusCode).toBe(200);
    expect(response.body.repaired).toBe(true);
    expect(fs.readFileSync(confPath, 'utf8')).toContain('[Legacy]');
  });

  it('marks a legacy invalid-path share as not published instead of claiming it is active', async () => {
    const userId = getDb().prepare('SELECT user_id as userId FROM sessions WHERE id = ?').get(sessionId).userId;
    const shareId = getDb().prepare('INSERT INTO shares (user_id, name, path, enabled) VALUES (?, ?, ?, 1)')
      .run(userId, 'DATA', path.join(root, 'legacy-outside')).lastInsertRowid;
    getDb().prepare('INSERT INTO share_users (share_id, samba_user_id, access) VALUES (?, ?, ?)')
      .run(shareId, sambaUserId, 'write');

    const response = mockRes();
    await sharesHandler(mockReq({ method: 'GET', sessionId }), response);
    const dataShare = response.body.find((share: any) => share.name === 'DATA');
    expect(dataShare.published).toBe(false);
    expect(dataShare.publishError).toContain(sambaRoot);
  });
});
