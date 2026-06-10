/**
 * Single shared SQLite connection for the deployment engine.
 *
 * Replaces the old data/docker.json file (full-file read+rewrite on every call,
 * no locking, unbounded growth). One WAL-mode connection, prepared statements,
 * foreign keys, transactions. Lives in the same DB file as users/sessions so
 * there is a single source of truth.
 */
import Database from 'better-sqlite3';
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

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  db.exec(`
    CREATE TABLE IF NOT EXISTS docker_projects (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at  TEXT NOT NULL
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

    CREATE INDEX IF NOT EXISTS idx_apps_project ON docker_apps(project_id);
    CREATE INDEX IF NOT EXISTS idx_deploys_app  ON docker_deployments(app_id);
  `);

  // Additive migrations for installs created before these columns existed.
  ensureColumn('docker_apps', 'cpu_limit', 'TEXT');
  ensureColumn('docker_apps', 'mem_limit', 'TEXT');

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
    const importAll = db.transaction(() => {
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
    });
    importAll();
    fs.renameSync(LEGACY_JSON, LEGACY_JSON + '.migrated');
    console.log(`[db] migrated ${(legacy.apps || []).length} apps from docker.json -> SQLite`);
  } catch (e) {
    console.error('[db] legacy migration failed (continuing):', e);
  }
}
