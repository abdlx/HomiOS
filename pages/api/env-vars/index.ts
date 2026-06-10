/**
 * /api/env-vars — scoped environment variables (team / project / app).
 * GET    ?scopeType=&scopeId=          — list (values decrypted for the UI)
 * POST   { scopeType, scopeId, key, value, isBuild? }
 * DELETE { scopeType, scopeId, key }
 */
import { getDb } from '../../../lib/db.ts';
import { withAuth } from '../../../lib/api-auth.ts';
import { listEnvVars, setEnvVar, deleteEnvVar, type EnvScope } from '../../../lib/env-resolve.ts';
import { logAudit } from '../../../lib/audit.ts';

const SCOPES: EnvScope[] = ['team', 'project', 'app'];

function authorizeScope(session: any, scopeType: EnvScope, scopeId: string): boolean {
  const db = getDb();
  if (scopeType === 'team') return scopeId === session.teamId;
  if (scopeType === 'project') {
    const p = db.prepare('SELECT team_id FROM docker_projects WHERE id = ?').get(scopeId) as any;
    return !!p && (p.team_id === session.teamId || p.team_id == null);
  }
  if (scopeType === 'app') {
    const a = db.prepare(`
      SELECT p.team_id FROM docker_apps a JOIN docker_projects p ON p.id = a.project_id WHERE a.id = ?
    `).get(scopeId) as any;
    return !!a && (a.team_id === session.teamId || a.team_id == null);
  }
  return false;
}

export default withAuth(async (req, res, session) => {
  const scopeType = String(req.method === 'GET' ? req.query.scopeType : req.body?.scopeType) as EnvScope;
  const scopeId = String(req.method === 'GET' ? req.query.scopeId : req.body?.scopeId);
  if (!SCOPES.includes(scopeType) || !scopeId) {
    return res.status(400).json({ error: 'scopeType (team|project|app) and scopeId are required' });
  }
  if (!authorizeScope(session, scopeType, scopeId)) {
    return res.status(404).json({ error: 'Scope not found' });
  }

  if (req.method === 'GET') {
    return res.json(listEnvVars(scopeType, scopeId));
  }

  if (req.method === 'POST') {
    const { key, value, isBuild = false } = req.body || {};
    if (!key || value === undefined) return res.status(400).json({ error: 'key and value are required' });
    try {
      setEnvVar(scopeType, scopeId, String(key), String(value), !!isBuild);
    } catch (e: any) {
      return res.status(400).json({ error: e.message });
    }
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'env.set', meta: { scopeType, scopeId, key } });
    return res.status(201).json({ ok: true });
  }

  if (req.method === 'DELETE') {
    const { key } = req.body || {};
    if (!deleteEnvVar(scopeType, scopeId, String(key))) return res.status(404).json({ error: 'Not found' });
    logAudit({ teamId: session.teamId, userId: session.userId, action: 'env.deleted', meta: { scopeType, scopeId, key } });
    return res.json({ ok: true });
  }

  res.setHeader('Allow', ['GET', 'POST', 'DELETE']);
  return res.status(405).end();
}, { ability: 'write' });
