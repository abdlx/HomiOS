import { getAppsByProject, createApp } from '../../../../../lib/docker-db.ts';
import { withAuth } from '../../../../../lib/api-auth.ts';
import {
  validateName, validateBuildPack, validateImage, validateTag,
  parseDomains, parsePorts, parseEnv, parseVolumes,
  validateGitRepo, validateBranch, validateCpuLimit, validateMemLimit, ValidationError,
} from '../../../../../lib/validate.ts';
import crypto from 'crypto';

/** Validate every config field up-front so bad input never reaches the engine. */
function validateAppInput(body: any) {
  const name = validateName(body?.name || '');
  const build_pack = validateBuildPack(body?.build_pack || 'dockerimage');

  if (build_pack === 'dockerimage' || build_pack === 'database') {
    if (!body?.docker_image) throw new ValidationError('Docker image is required');
    validateImage(body.docker_image);
    validateTag(body.docker_image_tag);
  }
  if (build_pack === 'github') {
    validateGitRepo(body?.git_repo || '');
    validateBranch(body?.git_branch);
  }
  if (build_pack === 'dockercompose' && !body?.compose_content) {
    throw new ValidationError('Compose content is required');
  }
  // These throw on malformed input; we store the original strings and re-parse at deploy.
  parseDomains(body?.domains);
  parsePorts(body?.ports);
  parseEnv(body?.env_vars);
  parseVolumes(body?.volumes);
  validateCpuLimit(body?.cpu_limit);
  validateMemLimit(body?.mem_limit);

  return { name, build_pack };
}

export default withAuth(async (req: any, res: any) => {
  const { id } = req.query; // project id
  try {
    if (req.method === 'GET') {
      return res.status(200).json(getAppsByProject(id));
    }
    if (req.method === 'POST') {
      const { name, build_pack } = validateAppInput(req.body);
      const b = req.body;
      const app = createApp({
        id: crypto.randomUUID(), projectId: id, name, build_pack,
        docker_image: b.docker_image || null, docker_image_tag: b.docker_image_tag || null,
        compose_content: b.compose_content || null, ports: b.ports || null, env_vars: b.env_vars || null,
        domains: b.domains || null, git_repo: b.git_repo || null, git_branch: b.git_branch || null,
        volumes: b.volumes || null, cpu_limit: b.cpu_limit || null, mem_limit: b.mem_limit || null,
        server_id: b.server_id || null,
      });
      return res.status(201).json(app);
    }
    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  } catch (err: any) {
    const code = err instanceof ValidationError ? 400 : 500;
    return res.status(code).json({ error: err.message });
  }
});
