/**
 * Give every test FILE its own SQLite database.
 *
 * lib/db.ts reads HOMIOS_DATABASE_PATH at module-import time and caches the
 * connection, so
 * this must run before any test file imports it — which is exactly what setupFiles
 * guarantees. Vitest isolates the module registry per file, so each file gets a
 * fresh schema bootstrap against a fresh path.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { afterAll } from 'vitest';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'homios-test-'));
const dbPath = path.join(dir, `${crypto.randomUUID()}.db`);

process.env.HOMIOS_DATABASE_PATH = dbPath;

afterAll(async () => {
  // Windows refuses to unlink a file while SQLite still holds the handle.
  try {
    const { closeDb } = await import('../lib/db.ts');
    closeDb();
  } catch {}
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // A leftover file in the OS temp dir is not worth failing a suite over.
  }
});
