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

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_team    ON audit_logs(team_id, created_at);
  `);

  ensureColumn('users', 'totp_secret', 'TEXT');
  ensureColumn('users', 'totp_enabled', 'INTEGER DEFAULT 0');
  ensureColumn('users', 'recovery_codes', 'TEXT');

  return db;
}

function ensureColumn(table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}
