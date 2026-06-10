/**
 * THE single shared SQLite connection and schema for all of OpenFinder.
 *
 * Backed by node:sqlite (built into Node since 22.13) — no native module to
 * compile, so a Node upgrade can never silently kill the data layer again
 * (which is exactly what happened with better-sqlite3 + bcrypt prebuilds).
 *
 * Previously users/sessions were created ad-hoc inside auth API routes, samba
 * tables in lib/samba.ts, and docker tables here — with five separate
 * connections (no shared pragmas, leaked handles, races on first boot).
 * Everything now lives in ONE WAL-mode connection with the full schema
 * bootstrapped up front: auth, teams/RBAC, servers/SSH, deployment engine,
 * env scoping, notifications, scheduled tasks, backups, audit, samba.
 */
import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { containerSlug } from './validate.ts';

const DB_PATH = process.env.DATABASE_URL || './data/filemanager.db';
const LEGACY_JSON = './data/docker.json';

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
    -- ── Auth ──────────────────────────────────────────────────────────────
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

    -- ── Teams / RBAC ──────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS teams (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      personal_team INTEGER DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS team_users (
      team_id TEXT    NOT NULL,
      user_id INTEGER NOT NULL,
      role    TEXT    NOT NULL DEFAULT 'member', -- owner | admin | member
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
      abilities    TEXT NOT NULL DEFAULT 'read', -- csv: read,write,deploy
      last_used_at DATETIME,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    -- ── Servers / SSH ─────────────────────────────────────────────────────
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
      docker_version TEXT,
      last_check_at  DATETIME,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
      FOREIGN KEY(private_key_id) REFERENCES private_keys(id) ON DELETE SET NULL
    );

    -- ── Deployment engine ─────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS docker_projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      team_id     TEXT,
      created_at  TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS environments (
      id         TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name       TEXT NOT NULL DEFAULT 'production',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(project_id) REFERENCES docker_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS docker_apps (
      id               TEXT PRIMARY KEY,
      project_id       TEXT NOT NULL,
      name             TEXT NOT NULL,
      build_pack       TEXT NOT NULL,
      docker_image     TEXT,
      docker_image_tag TEXT DEFAULT 'latest',
      compose_content  TEXT,
      ports            TEXT,
      env_vars         TEXT,
      domains          TEXT,
      git_repo         TEXT,
      git_branch       TEXT DEFAULT 'main',
      volumes          TEXT,
      status           TEXT NOT NULL DEFAULT 'stopped',
      health           TEXT DEFAULT 'unknown',
      container_name   TEXT,
      image_ref        TEXT,
      webhook_secret   TEXT,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES docker_projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS docker_deployments (
      id          TEXT PRIMARY KEY,
      app_id      TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'queued',
      logs        TEXT DEFAULT '',
      image_ref   TEXT,
      started_at  TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY (app_id) REFERENCES docker_apps(id) ON DELETE CASCADE
    );

    -- ── Env var scoping (team < project < environment < app overrides) ────
    CREATE TABLE IF NOT EXISTS env_vars (
      id          TEXT PRIMARY KEY,
      scope_type  TEXT NOT NULL,  -- team | project | environment | app
      scope_id    TEXT NOT NULL,
      key         TEXT NOT NULL,
      value_enc   TEXT NOT NULL,
      is_build    INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(scope_type, scope_id, key)
    );

    -- ── Notifications ─────────────────────────────────────────────────────
    CREATE TABLE IF NOT EXISTS notification_settings (
      team_id    TEXT NOT NULL,
      channel    TEXT NOT NULL,  -- email|discord|slack|telegram|pushover|webhook
      enabled    INTEGER DEFAULT 0,
      config     TEXT DEFAULT '{}',
      PRIMARY KEY (team_id, channel),
      FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE
    );

    -- ── Scheduled tasks (cron, per app) ───────────────────────────────────
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id          TEXT PRIMARY KEY,
      app_id      TEXT NOT NULL,
      name        TEXT NOT NULL,
      command     TEXT NOT NULL,
      frequency   TEXT NOT NULL,           -- cron expression
      enabled     INTEGER DEFAULT 1,
      last_run_at DATETIME,
      last_status TEXT,
      last_output TEXT,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(app_id) REFERENCES docker_apps(id) ON DELETE CASCADE
    );

    -- ── Scheduled backups + S3 ────────────────────────────────────────────
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

    CREATE TABLE IF NOT EXISTS scheduled_backups (
      id            TEXT PRIMARY KEY,
      app_id        TEXT NOT NULL,
      frequency     TEXT NOT NULL,        -- cron expression
      retention     INTEGER DEFAULT 7,    -- keep N most recent
      s3_storage_id TEXT,
      enabled       INTEGER DEFAULT 1,
      last_run_at   DATETIME,
      last_status   TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(app_id) REFERENCES docker_apps(id) ON DELETE CASCADE,
      FOREIGN KEY(s3_storage_id) REFERENCES s3_storages(id) ON DELETE SET NULL
    );

    -- ── Audit log ─────────────────────────────────────────────────────────
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

    -- ── Samba ─────────────────────────────────────────────────────────────
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

    CREATE INDEX IF NOT EXISTS idx_apps_project   ON docker_apps(project_id);
    CREATE INDEX IF NOT EXISTS idx_deploys_app    ON docker_deployments(app_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user  ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_envvars_scope  ON env_vars(scope_type, scope_id);
    CREATE INDEX IF NOT EXISTS idx_audit_team     ON audit_logs(team_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_app      ON scheduled_tasks(app_id);
  `);

  // Additive migrations for installs created before these columns existed.
  ensureColumn('docker_apps', 'cpu_limit', 'TEXT');
  ensureColumn('docker_apps', 'mem_limit', 'TEXT');
  ensureColumn('docker_apps', 'server_id', 'TEXT');
  ensureColumn('docker_apps', 'environment_id', 'TEXT');
  ensureColumn('docker_apps', 'hc_enabled', 'INTEGER DEFAULT 0');
  ensureColumn('docker_apps', 'hc_path', "TEXT DEFAULT '/'");
  ensureColumn('docker_apps', 'hc_port', 'INTEGER');
  ensureColumn('docker_apps', 'hc_interval', 'INTEGER DEFAULT 60');
  ensureColumn('docker_apps', 'hc_status', "TEXT DEFAULT 'unknown'");
  ensureColumn('docker_apps', 'hc_checked_at', 'TEXT');
  ensureColumn('docker_projects', 'team_id', 'TEXT');
  ensureColumn('users', 'totp_secret', 'TEXT');
  ensureColumn('users', 'totp_enabled', 'INTEGER DEFAULT 0');
  ensureColumn('users', 'recovery_codes', 'TEXT');

  migrateLegacyJson();
  return db;
}

/** Add a column only if it isn't already present (SQLite has no ADD COLUMN IF NOT EXISTS). */
function ensureColumn(table: string, column: string, type: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

/** One-time import of the old data/docker.json, then mark it migrated. */
function migrateLegacyJson(): void {
  try {
    if (!fs.existsSync(LEGACY_JSON)) return;
    const count = db.prepare('SELECT COUNT(*) AS c FROM docker_apps').get() as { c: number };
    if (count.c > 0) return; // already have data; don't double-import

    const legacy = JSON.parse(fs.readFileSync(LEGACY_JSON, 'utf-8'));
    const now = new Date().toISOString();
    // node:sqlite has no transaction() helper — manual BEGIN/COMMIT.
    const importAll = () => {
      db.exec('BEGIN');
      try {
        runImport();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    };
    const runImport = () => {
      for (const p of legacy.projects || []) {
        db.prepare('INSERT OR IGNORE INTO docker_projects (id,name,description,created_at) VALUES (?,?,?,?)')
          .run(p.id, p.name, p.description || '', p.created_at || now);
      }
      for (const a of legacy.apps || []) {
        db.prepare(`INSERT OR IGNORE INTO docker_apps
          (id,project_id,name,build_pack,docker_image,docker_image_tag,compose_content,ports,env_vars,domains,git_repo,git_branch,volumes,status,health,container_name,image_ref,webhook_secret,created_at,updated_at)
          VALUES (@id,@project_id,@name,@build_pack,@docker_image,@docker_image_tag,@compose_content,@ports,@env_vars,@domains,@git_repo,@git_branch,@volumes,@status,'unknown',@container_name,NULL,@webhook_secret,@created_at,@updated_at)`)
          .run({
            id: a.id, project_id: a.project_id, name: a.name, build_pack: a.build_pack === 'template' ? 'dockercompose' : a.build_pack,
            docker_image: a.docker_image ?? null, docker_image_tag: a.docker_image_tag ?? 'latest',
            compose_content: a.compose_content ?? null, ports: a.ports ?? null, env_vars: a.env_vars ?? null,
            domains: a.domains ?? null, git_repo: a.git_repo ?? null, git_branch: a.git_branch ?? 'main',
            volumes: a.volumes ?? null, status: 'stopped',
            container_name: containerSlug(a.id), webhook_secret: crypto.randomBytes(24).toString('hex'),
            created_at: a.created_at || now, updated_at: now,
          });
      }
    };
    importAll();
    fs.renameSync(LEGACY_JSON, LEGACY_JSON + '.migrated');
    console.log(`[db] migrated ${(legacy.apps || []).length} apps from docker.json -> SQLite`);
  } catch (e) {
    console.error('[db] legacy migration failed (continuing):', e);
  }
}
