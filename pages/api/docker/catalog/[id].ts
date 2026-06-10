import crypto from 'crypto';
import { withAuth } from '../../../../lib/api-auth.ts';
import { getCatalogEntry } from '../../../../lib/app-catalog.ts';
import { getProjects } from '../../../../lib/docker-db.ts';
import { createApp } from '../../../../lib/docker-db.ts';
import {
  validateName, validateBuildPack, validateImage, validateTag,
  parseDomains, parsePorts, parseEnv, parseVolumes, ValidationError,
} from '../../../../lib/validate.ts';

/**
 * Instantiate a catalog entry into a real app. Secrets are minted server-side
 * here (never in the browser) and baked into the stored config once.
 *
 * Body: { projectId, name?, domains? }
 */
export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }
  const { id } = req.query;
  const entry = getCatalogEntry(String(id));
  if (!entry) return res.status(404).json({ error: 'Unknown catalog app' });

  const { projectId, name, domains } = req.body || {};
  if (!projectId || !(getProjects() as any[]).some((p) => p.id === projectId)) {
    return res.status(400).json({ error: 'Valid projectId is required' });
  }
  if (entry.needsDomain && !domains) {
    return res.status(400).json({ error: `${entry.name} requires a domain` });
  }

  try {
    const tpl = entry.instantiate({ name, domains });
    const finalName = validateName(name || tpl.name);
    const build_pack = validateBuildPack(tpl.build_pack);

    // Re-run validation on the generated config so the catalog can't bypass it.
    if (build_pack === 'dockerimage' || build_pack === 'database') {
      validateImage(tpl.docker_image || '');
      validateTag(tpl.docker_image_tag);
    }
    parseDomains(domains);
    parsePorts(tpl.ports);
    parseEnv(tpl.env_vars);
    parseVolumes(tpl.volumes);

    const app = createApp({
      id: crypto.randomUUID(), projectId, name: finalName, build_pack,
      docker_image: tpl.docker_image ?? null, docker_image_tag: tpl.docker_image_tag ?? null,
      compose_content: tpl.compose_content ?? null, ports: tpl.ports ?? null,
      env_vars: tpl.env_vars ?? null, domains: domains || null,
      volumes: tpl.volumes ?? null, cpu_limit: tpl.cpu_limit ?? null, mem_limit: tpl.mem_limit ?? null,
    });
    return res.status(201).json(app);
  } catch (err: any) {
    const code = err instanceof ValidationError ? 400 : 500;
    return res.status(code).json({ error: err.message });
  }
});
