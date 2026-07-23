/**
 * The single shared SQLite connection and schema for OpenFinder.
 *
 * Backed by node:sqlite (built into Node since 22.13). Everything lives in one
 * WAL-mode connection with the full schema bootstrapped up front: auth,
 * teams/RBAC, servers/SSH, notifications, S3 storage settings, audit, and Samba.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

const DB_PATH = process.env.DATABASE_URL || './data/filemanager.db';

let db: any = null;

export function getDb(): any {
  if (db) return db;

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA synchronous = NORMAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      email          TEXT UNIQUE NOT NULL,
      password_hash  TEXT NOT NULL,
      totp_secret    TEXT,
      totp_enabled   INTEGER DEFAULT 0,
      recovery_codes TEXT,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id         TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      expires_at DATETIME NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS initialized (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS teams (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      personal_team INTEGER DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS team_users (
      team_id TEXT    NOT NULL,
      user_id INTEGER NOT NULL,
      role    TEXT    NOT NULL DEFAULT 'member',
      PRIMARY KEY (team_id, user_id),
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS team_invitations (
      id         TEXT PRIMARY KEY,
      team_id    TEXT NOT NULL,
      email      TEXT NOT NULL,
      role       TEXT NOT NULL DEFAULT 'member',
      token      TEXT NOT NULL UNIQUE,
      expires_at DATETIME NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS api_tokens (
      id           TEXT PRIMARY KEY,
      user_id      INTEGER NOT NULL,
      team_id      TEXT NOT NULL,
      name         TEXT NOT NULL,
      token_hash   TEXT NOT NULL UNIQUE,
      abilities    TEXT NOT NULL DEFAULT 'read',
      last_used_at DATETIME,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS private_keys (
      id              TEXT PRIMARY KEY,
      team_id         TEXT NOT NULL,
      name            TEXT NOT NULL,
      description     TEXT DEFAULT '',
      private_key_enc TEXT NOT NULL,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS servers (
      id             TEXT PRIMARY KEY,
      team_id        TEXT NOT NULL,
      name           TEXT NOT NULL,
      description    TEXT DEFAULT '',
      ip             TEXT NOT NULL,
      port           INTEGER DEFAULT 22,
      ssh_user       TEXT DEFAULT 'root',
      private_key_id TEXT,
      is_localhost   INTEGER DEFAULT 0,
      is_reachable   INTEGER DEFAULT 0,
      is_usable      INTEGER DEFAULT 0,
      proxy_status   TEXT DEFAULT 'stopped',
      last_check_at  DATETIME,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY(private_key_id) REFERENCES private_keys(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS notification_settings (
      team_id    TEXT NOT NULL,
      channel    TEXT NOT NULL,
      enabled    INTEGER DEFAULT 0,
      config     TEXT DEFAULT '{}',
      PRIMARY KEY (team_id, channel),
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS s3_storages (
      id             TEXT PRIMARY KEY,
      team_id        TEXT NOT NULL,
      name           TEXT NOT NULL,
      endpoint       TEXT,
      bucket         TEXT NOT NULL,
      region         TEXT DEFAULT 'us-east-1',
      access_key_enc TEXT NOT NULL,
      secret_key_enc TEXT NOT NULL,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id       TEXT,
      user_id       INTEGER,
      action        TEXT NOT NULL,
      resource_type TEXT,
      resource_id   TEXT,
      meta          TEXT DEFAULT '{}',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS shares (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id       INTEGER NOT NULL,
      name          TEXT    NOT NULL UNIQUE,
      path          TEXT    NOT NULL,
      read_only     INTEGER DEFAULT 0,
      comment       TEXT    DEFAULT '',
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS samba_users (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      username   TEXT NOT NULL UNIQUE,
      enabled    INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS share_users (
      share_id      INTEGER NOT NULL,
      samba_user_id INTEGER NOT NULL,
      PRIMARY KEY (share_id, samba_user_id),
      FOREIGN KEY(share_id)      REFERENCES shares(id)      ON DELETE CASCADE,
      FOREIGN KEY(samba_user_id) REFERENCES samba_users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id         TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      title      TEXT NOT NULL,
      content    TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id             TEXT PRIMARY KEY,
      team_id        TEXT,
      user_id        INTEGER,
      type           TEXT NOT NULL,
      status         TEXT NOT NULL DEFAULT 'queued',
      resource_class TEXT NOT NULL DEFAULT 'io',
      priority       INTEGER DEFAULT 0,
      progress       INTEGER DEFAULT 0,
      name           TEXT NOT NULL,
      payload        TEXT DEFAULT '{}',
      result         TEXT DEFAULT '{}',
      error          TEXT,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at     DATETIME,
      finished_at    DATETIME
    );

    CREATE TABLE IF NOT EXISTS job_events (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id     TEXT NOT NULL,
      type       TEXT NOT NULL,
      message    TEXT NOT NULL,
      data       TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS job_artifacts (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id     TEXT NOT NULL,
      kind       TEXT NOT NULL,
      path       TEXT,
      meta       TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS file_index (
      id          TEXT PRIMARY KEY,
      team_id     TEXT,
      path        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      kind        TEXT NOT NULL,
      size        INTEGER DEFAULT 0,
      modified    DATETIME,
      content     TEXT DEFAULT '',
      metadata    TEXT DEFAULT '{}',
      indexed_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS media_index (
      id          TEXT PRIMARY KEY,
      team_id     TEXT,
      path        TEXT NOT NULL UNIQUE,
      name        TEXT NOT NULL,
      media_type  TEXT NOT NULL,
      size        INTEGER DEFAULT 0,
      modified    DATETIME,
      width       INTEGER,
      height      INTEGER,
      duration    REAL,
      metadata    TEXT DEFAULT '{}',
      indexed_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS index_state (
      scope      TEXT PRIMARY KEY,
      status     TEXT NOT NULL DEFAULT 'idle',
      root_path  TEXT,
      last_run_at DATETIME,
      meta       TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS thumbnail_cache (
      id          TEXT PRIMARY KEY,
      source_path TEXT NOT NULL,
      variant     TEXT NOT NULL,
      cache_path  TEXT,
      source_mtime INTEGER DEFAULT 0,
      source_size INTEGER DEFAULT 0,
      status      TEXT NOT NULL DEFAULT 'missing',
      error       TEXT,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(source_path, variant)
    );

    CREATE TABLE IF NOT EXISTS backup_plans (
      id               TEXT PRIMARY KEY,
      team_id          TEXT,
      user_id          INTEGER,
      name             TEXT NOT NULL,
      source_path      TEXT NOT NULL,
      destination_type TEXT NOT NULL,
      destination      TEXT NOT NULL,
      schedule         TEXT,
      enabled          INTEGER DEFAULT 1,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS backup_runs (
      id           TEXT PRIMARY KEY,
      plan_id      TEXT,
      job_id       TEXT,
      status       TEXT NOT NULL DEFAULT 'queued',
      source_path  TEXT NOT NULL,
      destination  TEXT NOT NULL,
      bytes_total  INTEGER DEFAULT 0,
      bytes_copied INTEGER DEFAULT 0,
      error        TEXT,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at  DATETIME,
      FOREIGN KEY(plan_id) REFERENCES backup_plans(id) ON DELETE SET NULL,
      FOREIGN KEY(job_id) REFERENCES jobs(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS backup_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id      TEXT NOT NULL,
      source_path TEXT NOT NULL,
      backup_path TEXT NOT NULL,
      size        INTEGER DEFAULT 0,
      checksum    TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(run_id) REFERENCES backup_runs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_plans (
      id             TEXT PRIMARY KEY,
      team_id        TEXT,
      user_id        INTEGER,
      name           TEXT NOT NULL,
      sources        TEXT NOT NULL DEFAULT '[]',
      destinations   TEXT NOT NULL DEFAULT '[]',
      mirror_deletes INTEGER DEFAULT 0,
      schedule       TEXT NOT NULL DEFAULT 'manual',
      enabled        INTEGER DEFAULT 1,
      last_run_at    DATETIME,
      last_status    TEXT,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id            TEXT PRIMARY KEY,
      plan_id       TEXT,
      job_id        TEXT,
      status        TEXT NOT NULL DEFAULT 'running',
      files_copied  INTEGER DEFAULT 0,
      files_skipped INTEGER DEFAULT 0,
      files_deleted INTEGER DEFAULT 0,
      bytes_copied  INTEGER DEFAULT 0,
      pairs         TEXT DEFAULT '[]',
      error         TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      finished_at   DATETIME,
      FOREIGN KEY(plan_id) REFERENCES sync_plans(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id     TEXT,
      user_id     INTEGER,
      title       TEXT NOT NULL,
      message     TEXT NOT NULL,
      tone        TEXT NOT NULL DEFAULT 'info',
      source_type TEXT,
      source_id   TEXT,
      read_at     DATETIME,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_team    ON audit_logs(team_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_jobs_status   ON jobs(status, priority, created_at);
    CREATE INDEX IF NOT EXISTS idx_file_index_path ON file_index(path);
    CREATE INDEX IF NOT EXISTS idx_media_index_path ON media_index(path);
    CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_sync_runs_plan ON sync_runs(plan_id, created_at);
  `);

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS file_index_fts
      USING fts5(id UNINDEXED, name, path, content);
    `);
  } catch (e) {
    console.warn('[db] SQLite FTS5 unavailable; search will use fallback LIKE queries.');
  }

  ensureColumn('users', 'totp_secret', 'TEXT');
  ensureColumn('users', 'totp_enabled', 'INTEGER DEFAULT 0');
  ensureColumn('users', 'recovery_codes', 'TEXT');
  ensureColumn('users', 'is_admin', 'INTEGER DEFAULT 0');
  ensureColumn('users', 'last_totp_step', 'INTEGER DEFAULT 0');
  ensureColumn('shares', 'enabled', 'INTEGER DEFAULT 1');
  ensureColumn('shares', 'expires_at', 'DATETIME');
  ensureColumn('share_users', 'access', "TEXT DEFAULT 'write'");
  ensureColumn('api_tokens', 'expires_at', 'DATETIME');

  backfillInstanceAdmin();

  return db;
}

/**
 * Instance admin is NOT the same thing as team role.
 *
 * Every user owns a personal team, so `team_users.role` is 'owner' for everyone —
 * it can never gate host-level power (filesystem, terminal, mounts, SSH keys).
 * `users.is_admin` is that gate. On upgrade, the oldest account becomes the
 * instance admin so existing deployments keep exactly one working administrator.
 */
function backfillInstanceAdmin(): void {
  const anyAdmin = db.prepare('SELECT 1 FROM users WHERE is_admin = 1 LIMIT 1').get();
  if (anyAdmin) return;
  const first = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get() as { id: number } | undefined;
  if (!first) return;
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(first.id);
  console.warn(`[db] No instance admin found; promoted user id=${first.id} (oldest account) to admin.`);
}

export function runStartupIntegrityChecks(): void {
  const db = getDb();
  const quick = db.prepare('PRAGMA quick_check').get() as { quick_check?: string } | undefined;
  if (quick?.quick_check !== 'ok') {
    throw new Error(`SQLite quick_check failed: ${quick?.quick_check || 'unknown failure'}`);
  }

  for (const table of ['users', 'sessions', 'teams', 'team_users', 'api_tokens', 'shares']) {
    const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    if (!row) throw new Error(`SQLite schema missing required table: ${table}`);
  }
}

export function checkpointWal(): void {
  getDb().exec('PRAGMA wal_checkpoint(PASSIVE)');
}

/** Flush and release the connection on shutdown so the WAL is fully folded back in. */
export function closeDb(): void {
  if (!db) return;
  try { db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); } catch {}
  try { db.close(); } catch {}
  db = null;
}

export function withTransaction<T>(fn: (db: any) => T): T {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn(db);
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
}

export function buildAllowedUpdate(
  input: Record<string, any>,
  allowed: Record<string, string>
): { setSql: string; values: any[] } {
  const sets: string[] = [];
  const values: any[] = [];
  for (const [key, column] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
      sets.push(`${column} = ?`);
      values.push(input[key]);
    }
  }
  return { setSql: sets.join(', '), values };
}

function ensureColumn(table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
