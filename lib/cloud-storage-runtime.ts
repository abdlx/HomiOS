import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { getAppEncryptionKey } from './crypto.ts';

export const CLOUD_ENGINE_MOUNT = '/_homios/cloud-storage';

function derive(label: string) {
  return crypto.createHmac('sha256', getAppEncryptionKey()).update(`homios:${label}`).digest('hex');
}

export function getCloudStorageRuntime() {
  const port = Number(process.env.HOMIOS_PORT || process.env.PORT || 8740);
  const databasePath = path.resolve(process.cwd(), 'data', 'cloud-storage.db').replace(/\\/g, '/');
  return {
    databasePath,
    baseUrl: `http://127.0.0.1:${port}${CLOUD_ENGINE_MOUNT}`,
    internalKey: derive('cloud-storage-internal-api'),
    environment: {
      DATABASE_URL: `file:${databasePath}`,
      APP_PORT: '0',
      FRONTEND_URL: `http://127.0.0.1:${port}`,
      JWT_ACCESS_SECRET: derive('cloud-storage-jwt'),
      TOKEN_ENCRYPTION_KEY: derive('cloud-storage-token-encryption'),
      HOMIOS_API_KEY: derive('cloud-storage-internal-api'),
      MAX_UPLOAD_BYTES: String(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024 * 1024),
    },
  };
}

export function applyCloudStorageEnvironment() {
  const runtime = getCloudStorageRuntime();
  Object.assign(process.env, runtime.environment);
  return runtime;
}

export function migrateCloudStorageDatabase() {
  const engineRoot = path.resolve(process.cwd(), 'internal', 'cloud-storage-engine');
  const migrationsRoot = path.join(engineRoot, 'prisma', 'migrations');
  const { databasePath } = getCloudStorageRuntime();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  try {
    db.exec('PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS _homios_cloud_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);');
    const applied = new Set((db.prepare('SELECT name FROM _homios_cloud_migrations').all() as Array<{ name: string }>).map((row) => row.name));
    const migrations = fs.readdirSync(migrationsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const name of migrations) {
      if (applied.has(name)) continue;
      const sql = fs.readFileSync(path.join(migrationsRoot, name, 'migration.sql'), 'utf8');
      db.exec('BEGIN IMMEDIATE');
      try {
        db.exec(sql);
        db.prepare('INSERT INTO _homios_cloud_migrations (name) VALUES (?)').run(name);
        db.exec('COMMIT');
      } catch (error) {
        try { db.exec('ROLLBACK'); } catch {}
        throw error;
      }
    }
  } finally {
    db.close();
  }
}

export function internalCloudHeaders() {
  return { 'X-HomiOS-Internal': getCloudStorageRuntime().internalKey };
}

export function validInternalCloudRequest(value: unknown) {
  const received = Buffer.from(String(value || ''));
  const expected = Buffer.from(getCloudStorageRuntime().internalKey);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
