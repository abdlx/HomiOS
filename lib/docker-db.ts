/**
 * Data-access layer for the deployment engine. SQLite-backed (see lib/db.ts).
 *
 * Exposes the same function names the rest of the app already imports, so the
 * switch from the old JSON file is transparent — plus new lifecycle helpers.
 */
import crypto from 'crypto';
import { getDb } from './db.ts';
import { containerSlug } from './validate.ts';

const MAX_LOG_BYTES = 256 * 1024; // cap stored deploy logs so the DB can't balloon

export function initDockerDB() {
  getDb(); // ensures schema + migration run
}

// ── Projects ─────────────────────────────────────────────────────────────────
export function getProjects() {
  return getDb().prepare('SELECT * FROM docker_projects ORDER BY created_at DESC').all();
}

export function createProject(id: string, name: string, description: string) {
  const created_at = new Date().toISOString();
  getDb().prepare('INSERT INTO docker_projects (id,name,description,created_at) VALUES (?,?,?,?)')
    .run(id, name, description, created_at);
  return { id, name, description, created_at };
}

export function deleteProject(id: string) {
  getDb().prepare('DELETE FROM docker_projects WHERE id = ?').run(id); // cascades to apps/deployments
}

// ── Apps ─────────────────────────────────────────────────────────────────────
export function getAppsByProject(projectId: string) {
  return getDb().prepare('SELECT * FROM docker_apps WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
}

export function getAllApps() {
  return getDb().prepare(`
    SELECT a.*, p.name AS project_name
    FROM docker_apps a
    LEFT JOIN docker_projects p ON p.id = a.project_id
    ORDER BY a.created_at DESC
  `).all();
}

export function getApp(appId: string) {
  return getDb().prepare('SELECT * FROM docker_apps WHERE id = ?').get(appId);
}

export type NewAppInput = {
  id: string; projectId: string; name: string; build_pack: string;
  docker_image?: string | null; docker_image_tag?: string | null;
  compose_content?: string | null; ports?: string | null; env_vars?: string | null;
  domains?: string | null; git_repo?: string | null; git_branch?: string | null;
  volumes?: string | null; cpu_limit?: string | null; mem_limit?: string | null;
  server_id?: string | null;
};

export function createApp(input: NewAppInput) {
  const now = new Date().toISOString();
  const app = {
    id: input.id, project_id: input.projectId, name: input.name, build_pack: input.build_pack,
    docker_image: input.docker_image ?? null, docker_image_tag: input.docker_image_tag || 'latest',
    compose_content: input.compose_content ?? null, ports: input.ports ?? null,
    env_vars: input.env_vars ?? null, domains: input.domains ?? null,
    git_repo: input.git_repo ?? null, git_branch: input.git_branch || 'main', volumes: input.volumes ?? null,
    cpu_limit: input.cpu_limit ?? null, mem_limit: input.mem_limit ?? null,
    server_id: input.server_id ?? null,
    status: 'stopped', health: 'unknown',
    container_name: containerSlug(input.id), image_ref: null,
    webhook_secret: crypto.randomBytes(24).toString('hex'),
    created_at: now, updated_at: now,
  };
  getDb().prepare(`INSERT INTO docker_apps
    (id,project_id,name,build_pack,docker_image,docker_image_tag,compose_content,ports,env_vars,domains,git_repo,git_branch,volumes,cpu_limit,mem_limit,server_id,status,health,container_name,image_ref,webhook_secret,created_at,updated_at)
    VALUES (@id,@project_id,@name,@build_pack,@docker_image,@docker_image_tag,@compose_content,@ports,@env_vars,@domains,@git_repo,@git_branch,@volumes,@cpu_limit,@mem_limit,@server_id,@status,@health,@container_name,@image_ref,@webhook_secret,@created_at,@updated_at)`)
    .run(app);
  return app;
}

const MUTABLE_FIELDS = new Set([
  'name', 'docker_image', 'docker_image_tag', 'compose_content',
  'ports', 'env_vars', 'domains', 'git_repo', 'git_branch', 'volumes',
  'cpu_limit', 'mem_limit', 'server_id',
  'hc_enabled', 'hc_path', 'hc_port', 'hc_interval',
]);

/** Patch user-editable config fields (whitelisted). Returns the updated row. */
export function updateApp(appId: string, data: Record<string, any>) {
  const entries = Object.entries(data).filter(([k]) => MUTABLE_FIELDS.has(k));
  if (entries.length) {
    const sets = entries.map(([k]) => `${k} = @${k}`).join(', ');
    const params: Record<string, any> = { id: appId, updated_at: new Date().toISOString() };
    for (const [k, v] of entries) params[k] = v;
    getDb().prepare(`UPDATE docker_apps SET ${sets}, updated_at = @updated_at WHERE id = @id`).run(params);
  }
  return getApp(appId);
}

export function updateAppStatus(appId: string, status: string, health?: string) {
  const now = new Date().toISOString();
  if (health !== undefined) {
    getDb().prepare('UPDATE docker_apps SET status = ?, health = ?, updated_at = ? WHERE id = ?')
      .run(status, health, now, appId);
  } else {
    getDb().prepare('UPDATE docker_apps SET status = ?, updated_at = ? WHERE id = ?').run(status, now, appId);
  }
}

export function setAppImageRef(appId: string, imageRef: string) {
  getDb().prepare('UPDATE docker_apps SET image_ref = ?, updated_at = ? WHERE id = ?')
    .run(imageRef, new Date().toISOString(), appId);
}

export function deleteApp(appId: string) {
  getDb().prepare('DELETE FROM docker_apps WHERE id = ?').run(appId); // cascades to deployments
}

// ── Deployments ──────────────────────────────────────────────────────────────
export function createDeployment(id: string, appId: string) {
  const started_at = new Date().toISOString();
  getDb().prepare('INSERT INTO docker_deployments (id,app_id,status,logs,started_at) VALUES (?,?,?,?,?)')
    .run(id, appId, 'queued', '', started_at);
  return { id, app_id: appId, status: 'queued', logs: '', started_at, finished_at: null };
}

export function getDeployment(id: string) {
  return getDb().prepare('SELECT * FROM docker_deployments WHERE id = ?').get(id);
}

export function getDeploymentsByApp(appId: string) {
  return getDb().prepare('SELECT id,status,image_ref,started_at,finished_at FROM docker_deployments WHERE app_id = ? ORDER BY started_at DESC LIMIT 50').all(appId);
}

export function getLatestSuccessfulDeployment(appId: string) {
  return getDb().prepare(`SELECT * FROM docker_deployments WHERE app_id = ? AND status = 'success' AND image_ref IS NOT NULL ORDER BY started_at DESC LIMIT 1`).get(appId);
}

export function updateDeployment(deploymentId: string, status: string, appendLog: string) {
  const d = getDeployment(deploymentId) as any;
  if (!d) return;
  let logs = (d.logs || '') + (appendLog || '');
  if (logs.length > MAX_LOG_BYTES) logs = logs.slice(logs.length - MAX_LOG_BYTES); // keep tail
  const finished = status === 'success' || status === 'error' ? new Date().toISOString() : d.finished_at;
  getDb().prepare('UPDATE docker_deployments SET status = ?, logs = ?, finished_at = ? WHERE id = ?')
    .run(status, logs, finished, deploymentId);
}

export function setDeploymentImageRef(deploymentId: string, imageRef: string) {
  getDb().prepare('UPDATE docker_deployments SET image_ref = ? WHERE id = ?').run(imageRef, deploymentId);
}

export function listAppsForReconcile() {
  return getDb().prepare(`SELECT id, container_name, build_pack, status, server_id FROM docker_apps`).all();
}
