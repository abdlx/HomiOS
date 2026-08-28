import { withAuth } from '../../../lib/api-auth.ts';
import { enqueueJob } from '../../../lib/jobs.ts';
import { createInstallJobRecord, findActiveInstall, listManagedApps } from '../../../lib/apps/app-service.ts';
import { getCatalogApp } from '../../../lib/apps/catalog.ts';
import { logAudit } from '../../../lib/audit.ts';

export default withAuth(async (req: any, res: any, session: any) => {
  if (req.method !== 'POST') return res.status(405).end();
  const appId = String(req.body?.appId || '');
  const template = getCatalogApp(appId);
  if (!template) return res.status(404).json({ error: 'App not found in catalog' });
  if (listManagedApps().some((app) => app.catalogId === appId)) return res.status(409).json({ error: `${template.name} is already installed` });
  const active = findActiveInstall(appId);
  if (active) return res.status(202).json({ jobId: active.id, appId, existing: true });
  const jobId = enqueueJob({
    type: 'app.install', name: `Install ${template.name}`,
    payload: { appId, storage: req.body?.storage || {}, serverUuid: req.body?.serverUuid },
    teamId: session.teamId, userId: session.userId, maxAttempts: 1,
  });
  try { createInstallJobRecord(jobId, appId); } catch {}
  logAudit({ teamId: session.teamId, userId: session.userId, action: 'app.install.started', resourceType: 'app_catalog', resourceId: appId, meta: { jobId } });
  return res.status(202).json({ jobId, appId });
}, { adminOnly: true, ability: 'deploy' });
