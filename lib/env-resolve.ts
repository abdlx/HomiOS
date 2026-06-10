/**
 * Multi-level environment variable resolution (Coolify scoping model):
 *   team  <  project  <  app-scoped rows  <  app's inline env_vars text
 * Later levels override earlier ones. Values are encrypted at rest.
 */
import crypto from 'crypto';
import { getDb } from './db.ts';
import { encryptSecret, decryptSecret } from './crypto.ts';
import { parseEnv } from './validate.ts';

export type EnvScope = 'team' | 'project' | 'app';

export function listEnvVars(scopeType: EnvScope, scopeId: string): Array<{ id: string; key: string; value: string; is_build: number }> {
  return getDb().prepare(
    'SELECT id, key, value_enc, is_build FROM env_vars WHERE scope_type = ? AND scope_id = ? ORDER BY key'
  ).all(scopeType, scopeId).map((r: any) => ({
    id: r.id, key: r.key, value: decryptSecret(r.value_enc), is_build: r.is_build,
  }));
}

export function setEnvVar(scopeType: EnvScope, scopeId: string, key: string, value: string, isBuild = false): void {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid env key: ${key}`);
  getDb().prepare(`
    INSERT INTO env_vars (id, scope_type, scope_id, key, value_enc, is_build)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(scope_type, scope_id, key) DO UPDATE SET value_enc = excluded.value_enc, is_build = excluded.is_build
  `).run(crypto.randomUUID(), scopeType, scopeId, key, encryptSecret(value), isBuild ? 1 : 0);
}

export function deleteEnvVar(scopeType: EnvScope, scopeId: string, key: string): boolean {
  const r = getDb().prepare('DELETE FROM env_vars WHERE scope_type = ? AND scope_id = ? AND key = ?')
    .run(scopeType, scopeId, key);
  return r.changes > 0;
}

/** Full merge chain for an app: team -> project -> app rows -> inline env text. */
export function resolveEnvForApp(app: { id: string; project_id: string; env_vars?: string | null }): Record<string, string> {
  const db = getDb();
  const merged: Record<string, string> = {};

  const project = db.prepare('SELECT team_id FROM docker_projects WHERE id = ?').get(app.project_id) as any;
  if (project?.team_id) {
    for (const v of listEnvVars('team', project.team_id)) merged[v.key] = v.value;
  }
  for (const v of listEnvVars('project', app.project_id)) merged[v.key] = v.value;
  for (const v of listEnvVars('app', app.id)) merged[v.key] = v.value;
  Object.assign(merged, parseEnv(app.env_vars ?? null)); // inline app text wins
  return merged;
}
