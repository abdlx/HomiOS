import { getApp, updateApp, deleteApp } from '../../../../../lib/docker-db.ts';
import { withAuth } from '../../../../../lib/api-auth.ts';
import { removeAppResources } from '../../../../../lib/deploy-engine.ts';
import {
  validateName, parseDomains, parsePorts, parseEnv, parseVolumes,
  validateImage, validateTag, validateGitRepo, validateBranch,
  validateCpuLimit, validateMemLimit, ValidationError,
} from '../../../../../lib/validate.ts';

/** Validate only the fields present in a PATCH body. */
function validatePatch(body: any) {
  if (body.name !== undefined) validateName(body.name);
  if (body.docker_image !== undefined && body.docker_image) validateImage(body.docker_image);
  if (body.docker_image_tag !== undefined) validateTag(body.docker_image_tag);
  if (body.git_repo !== undefined && body.git_repo) validateGitRepo(body.git_repo);
  if (body.git_branch !== undefined) validateBranch(body.git_branch);
  if (body.domains !== undefined) parseDomains(body.domains);
  if (body.ports !== undefined) parsePorts(body.ports);
  if (body.env_vars !== undefined) parseEnv(body.env_vars);
  if (body.volumes !== undefined) parseVolumes(body.volumes);
  if (body.cpu_limit !== undefined) validateCpuLimit(body.cpu_limit);
  if (body.mem_limit !== undefined) validateMemLimit(body.mem_limit);
}

export default withAuth(async (req: any, res: any) => {
  const { id } = req.query;
  try {
    if (req.method === 'GET') {
      const app = getApp(id);
      if (!app) return res.status(404).json({ error: 'App not found' });
      return res.status(200).json(app);
    }
    if (req.method === 'PATCH') {
      if (!getApp(id)) return res.status(404).json({ error: 'App not found' });
      validatePatch(req.body || {});
      return res.status(200).json(updateApp(id, req.body || {}));
    }
    if (req.method === 'DELETE') {
      if (getApp(id)) await removeAppResources(id); // stop/remove containers, networks, stack dir
      deleteApp(id);
      return res.status(200).json({ success: true });
    }
    res.setHeader('Allow', ['GET', 'PATCH', 'DELETE']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err: any) {
    const code = err instanceof ValidationError ? 400 : 500;
    return res.status(code).json({ error: err.message });
  }
});
