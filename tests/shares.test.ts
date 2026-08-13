import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { getDb, withTransaction } from '../lib/db.ts';
import { createSession, createUserWithPasswordHash } from '../lib/auth.ts';
import sharesHandler from '../pages/api/shares/index.ts';
import { mockReq, mockRes } from './helpers.ts';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openfinder-samba-'));
const sambaRoot = path.join(root, 'storage');
const confPath = path.join(root, 'smb.conf');
const okCommand = process.platform === 'win32' ? 'cmd.exe' : 'true';

let sessionId: string;

beforeAll(() => {
  fs.mkdirSync(sambaRoot, { recursive: true });
  process.env.OPENFINDER_SAMBA_ROOT = sambaRoot;
  process.env.SAMBA_CONF_PATH = confPath;
  process.env.SAMBA_TESTPARM_BIN = okCommand;
  process.env.SAMBA_CONTROL_BIN = okCommand;
  process.env.SAMBA_SYSTEMCTL_BIN = okCommand;
  process.env.SAMBA_PKILL_BIN = okCommand;
  const userId = withTransaction((db) => createUserWithPasswordHash(db, 'shares@openfinder.test', 'x', { isAdmin: true }));
  sessionId = createSession(userId);
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
  await sharesHandler(mockReq({ method: 'POST', sessionId, body }), response);
  return response;
}

describe('/api/shares', () => {
  it('creates a Samba share, validates the config, and installs it', async () => {
    const sharePath = path.join(sambaRoot, 'photos');
    const response = await post({ name: 'Photos', path: sharePath });

    expect(response.statusCode).toBe(201);
    expect(response.body.uncPath).toBe('\\\\server\\Photos');
    expect(fs.readFileSync(confPath, 'utf8')).toContain(`[Photos]\n  path = ${sharePath}`);
    expect(getDb().prepare('SELECT COUNT(*) as count FROM shares').get().count).toBe(1);
  });

  it('returns an actionable 400 instead of 500 for paths outside the Samba jail', async () => {
    const response = await post({ name: 'Unsafe', path: path.join(root, 'outside') });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toContain(sambaRoot);
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
});
