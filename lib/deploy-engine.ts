/**
 * The deployment engine — the Coolify-style orchestrator.
 *
 * - Persisted, serial deployment queue (one build at a time; cancel-safe).
 * - Full lifecycle: deploy / start / stop / restart / redeploy / rollback / remove.
 * - Per-deployment image tags → real one-click rollback.
 * - Traefik reverse proxy with optional Let's Encrypt HTTPS.
 * - Multi-server: apps with server_id deploy over SSH (lib/ssh.ts executors).
 * - Scoped env vars (team < project < app) resolved at deploy time.
 * - Team notifications on success/failure (lib/notify.ts).
 * - State reconciliation against `docker inspect` (DB status is derived, never trusted blindly).
 * - Zero shell strings: all Docker/git calls use spawn arg-arrays or quoted SSH.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  getApp, updateAppStatus, createDeployment, updateDeployment, setAppImageRef,
  setDeploymentImageRef, getLatestSuccessfulDeployment, getDeploymentsByApp,
  listAppsForReconcile,
} from './docker-db.ts';
import {
  docker, inspect, statusFromInspect, ensureNetwork, stopContainer,
  startContainer, restartContainer, removeContainer, composeArgs,
  getExecutor, type DockerExecutor,
} from './docker.ts';
import {
  validateImage, validateTag, parseDomains, parsePorts, parseVolumes,
  validateGitRepo, validateBranch, validateBuildPack, validateCpuLimit, validateMemLimit,
  containerSlug, composeProject,
} from './validate.ts';
import { resolveEnvForApp } from './env-resolve.ts';
import { getDb } from './db.ts';
import { notifyTeam } from './notify.ts';

const PROXY_NET = 'openfinder-proxy';
const PROXY_NAME = 'openfinder-proxy-traefik';
const ACME_EMAIL = process.env.ACME_EMAIL || '';
const HTTPS_ENABLED = !!ACME_EMAIL;
const HTTP_PORT = process.env.PROXY_HTTP_PORT || '80';
const HTTPS_PORT = process.env.PROXY_HTTPS_PORT || '443';
const STACKS_DIR = path.join(process.cwd(), 'data', 'stacks');

function teamIdForApp(app: any): string | null {
  try {
    const p = getDb().prepare('SELECT team_id FROM docker_projects WHERE id = ?').get(app.project_id) as any;
    return p?.team_id ?? null;
  } catch { return null; }
}

function notifyAppEvent(app: any, event: 'deploy.success' | 'deploy.failed', detail: string): void {
  const teamId = teamIdForApp(app);
  if (teamId) void notifyTeam(teamId, event, detail);
}

// ── Socket log emit ──────────────────────────────────────────────────────────
function emit(deploymentId: string, text: string, status = 'in_progress'): void {
  updateDeployment(deploymentId, status, text);
  const io = (globalThis as any).io;
  if (io) io.to(`deployment:${deploymentId}`).emit('log', text);
}

// ── Traefik proxy (executor-aware: runs on the app's target server) ─────────
export async function ensureProxy(log: (s: string) => void, exec?: DockerExecutor): Promise<void> {
  const d = exec ? exec.docker.bind(exec) : docker;
  if (exec) {
    const net = await d(['network', 'inspect', PROXY_NET]);
    if (net.code !== 0) await d(['network', 'create', PROXY_NET]);
  } else {
    await ensureNetwork(PROXY_NET);
  }
  const info = exec ? await exec.inspect(PROXY_NAME) : await inspect(PROXY_NAME);
  if (info?.State?.Running) { log(`Proxy ${PROXY_NAME} is running.\n`); return; }
  if (info) await d(['rm', '-f', PROXY_NAME]);

  const args = [
    'run', '-d', '--name', PROXY_NAME, '--restart', 'unless-stopped',
    '--network', PROXY_NET,
    '-p', `${HTTP_PORT}:80`, '-p', `${HTTPS_PORT}:443`,
    '-v', '/var/run/docker.sock:/var/run/docker.sock:ro',
    '-v', 'openfinder-traefik-certs:/letsencrypt',
    'traefik:v3.0',
    '--providers.docker=true',
    '--providers.docker.exposedbydefault=false',
    '--entrypoints.web.address=:80',
    '--entrypoints.websecure.address=:443',
  ];
  if (HTTPS_ENABLED) {
    args.push(
      '--certificatesresolvers.le.acme.tlschallenge=true',
      `--certificatesresolvers.le.acme.email=${ACME_EMAIL}`,
      '--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json',
      '--entrypoints.web.http.redirections.entrypoint.to=websecure',
      '--entrypoints.web.http.redirections.entrypoint.scheme=https',
    );
    log('HTTPS enabled (Let\'s Encrypt). HTTP will redirect to HTTPS.\n');
  } else {
    log('HTTPS disabled (set ACME_EMAIL to enable automatic certificates). Serving on HTTP.\n');
  }
  const res = await d(args, log);
  log(res.code === 0 ? 'Reverse proxy started.\n' : `Warning: proxy failed to start (code ${res.code}).\n`);
}

function buildProxyLabels(slug: string, domains: string[], routePort: number): string[] {
  if (!domains.length) return [];
  const rule = domains.map((d) => `Host(\`${d}\`)`).join(' || ');
  const labels = [
    'traefik.enable=true',
    `traefik.docker.network=${PROXY_NET}`,
    `traefik.http.routers.${slug}.rule=${rule}`,
    `traefik.http.services.${slug}.loadbalancer.server.port=${routePort}`,
  ];
  if (HTTPS_ENABLED) {
    labels.push(
      `traefik.http.routers.${slug}.entrypoints=websecure`,
      `traefik.http.routers.${slug}.tls.certresolver=le`,
    );
  } else {
    labels.push(`traefik.http.routers.${slug}.entrypoints=web`);
  }
  return labels.flatMap((l) => ['-l', l]);
}

// ── Build a `docker run` arg array from validated config ──────────────────────
function buildRunArgs(slug: string, imageRef: string, cfg: {
  domains: string[]; ports: ReturnType<typeof parsePorts>;
  env: Record<string, string>; volumes: ReturnType<typeof parseVolumes>;
  cpuLimit?: string | null; memLimit?: string | null;
}): string[] {
  const routePort = cfg.ports[0]?.container ?? 80;
  const args = [
    'run', '-d', '--name', slug, '--restart', 'unless-stopped',
    '--network', PROXY_NET,
    ...buildProxyLabels(slug, cfg.domains, routePort),
  ];
  if (cfg.cpuLimit) args.push('--cpus', cfg.cpuLimit);
  if (cfg.memLimit) args.push('--memory', cfg.memLimit);
  for (const p of cfg.ports) args.push('-p', `${p.host}:${p.container}/${p.proto}`);
  for (const v of cfg.volumes) args.push('-v', `${v.source}:${v.target}${v.readOnly ? ':ro' : ''}`);
  for (const [k, val] of Object.entries(cfg.env)) args.push('-e', `${k}=${val}`);
  args.push(imageRef);
  return args;
}

async function executorForApp(app: any): Promise<DockerExecutor> {
  return getExecutor(app.server_id || null, STACKS_DIR);
}

// ── Deployment queue (serial) ──────────────────────────────────────────────────
type Job = { deploymentId: string; appId: string; rollbackImage?: string };
const queue: Job[] = [];
let processing = false;

export function enqueueDeploy(appId: string, rollbackImage?: string): string {
  const app = getApp(appId) as any;
  if (!app) throw new Error('App not found');
  const deploymentId = crypto.randomUUID();
  createDeployment(deploymentId, appId);
  updateAppStatus(appId, 'deploying');
  queue.push({ deploymentId, appId, rollbackImage });
  void processQueue();
  return deploymentId;
}

async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    while (queue.length) {
      const job = queue.shift()!;
      try { await runDeployment(job); }
      catch (e: any) {
        emit(job.deploymentId, `\nFATAL: ${e?.message || e}\n`, 'error');
        updateAppStatus(job.appId, 'error');
        const app = getApp(job.appId) as any;
        if (app) notifyAppEvent(app, 'deploy.failed', `${app.name}: ${e?.message || e}`);
      }
    }
  } finally {
    processing = false;
  }
}

async function runDeployment(job: Job): Promise<void> {
  const { deploymentId, appId, rollbackImage } = job;
  const app = getApp(appId) as any;
  if (!app) { emit(deploymentId, 'App no longer exists.\n', 'error'); return; }

  const slug = app.container_name || containerSlug(app.id);
  const log = (s: string) => emit(deploymentId, s);
  log(`Starting deployment for ${app.name} (${slug})...\n`);

  const buildPack = validateBuildPack(app.build_pack);
  const exec = await executorForApp(app);
  if (exec.isRemote) log(`Target: remote server over SSH.\n`);
  await ensureProxy(log, exec);

  if (rollbackImage) { await deployImage(exec, slug, rollbackImage, app, deploymentId, log); return; }

  if (buildPack === 'dockerimage' || buildPack === 'database') {
    const image = validateImage(app.docker_image);
    const tag = validateTag(app.docker_image_tag);
    const imageRef = `${image}:${tag}`;
    log(`Pulling ${imageRef}...\n`);
    await exec.docker(['pull', imageRef], log);
    await deployImage(exec, slug, imageRef, app, deploymentId, log);
  } else if (buildPack === 'dockercompose') {
    await deployCompose(exec, slug, app, deploymentId, log);
  } else if (buildPack === 'github') {
    await deployGithub(exec, slug, app, deploymentId, log);
  }
}

async function deployImage(exec: DockerExecutor, slug: string, imageRef: string, app: any, deploymentId: string, log: (s: string) => void): Promise<void> {
  const cfg = {
    domains: parseDomains(app.domains),
    ports: parsePorts(app.ports),
    env: resolveEnvForApp(app), // merged team < project < app scopes
    volumes: parseVolumes(app.volumes),
    cpuLimit: validateCpuLimit(app.cpu_limit),
    memLimit: validateMemLimit(app.mem_limit),
  };
  await exec.docker(['rm', '-f', slug]); // replace any previous container
  const res = await exec.docker(buildRunArgs(slug, imageRef, cfg), log);
  finish(res.code, app.id, deploymentId, imageRef, log);
}

async function deployCompose(exec: DockerExecutor, slug: string, app: any, deploymentId: string, log: (s: string) => void): Promise<void> {
  const dir = exec.isRemote ? `${exec.stacksDir}/${slug}` : path.join(exec.stacksDir, slug);
  const file = exec.isRemote ? `${dir}/docker-compose.yml` : path.join(dir, 'docker-compose.yml');
  const firstDomain = parseDomains(app.domains)[0] || `${slug}.local`;
  const content = (app.compose_content || '')
    .replace(/{{DOMAIN}}/g, firstDomain)
    .replace(/{{APP_ID}}/g, slug);
  await exec.writeFile(file, content);
  log(`Wrote compose stack to ${file}\n`);
  const res = await exec.docker(composeArgs(file, composeProject(app.id), ['up', '-d', '--remove-orphans']), log);
  finish(res.code, app.id, deploymentId, `compose:${slug}`, log);
}

async function deployGithub(exec: DockerExecutor, slug: string, app: any, deploymentId: string, log: (s: string) => void): Promise<void> {
  const repo = validateGitRepo(app.git_repo);
  const branch = validateBranch(app.git_branch);
  const buildDir = exec.isRemote ? `${exec.stacksDir}/${slug}/src` : path.join(exec.stacksDir, slug, 'src');

  if (exec.isRemote) {
    await exec.run('rm', ['-rf', buildDir], log);
    await exec.run('mkdir', ['-p', buildDir], log);
  } else {
    fs.rmSync(buildDir, { recursive: true, force: true });
    fs.mkdirSync(buildDir, { recursive: true });
  }

  log(`Cloning ${repo} (${branch})...\n`);
  const clone = await exec.run('git', ['clone', '--depth', '1', '--branch', branch, '--', repo, buildDir], log);
  if (clone.code !== 0) { finish(1, app.id, deploymentId, '', log); return; }

  const imageRef = `openfinder/${slug}:${deploymentId.slice(0, 8)}`;
  log(`Building image with Nixpacks → ${imageRef}\n`);
  const build = await exec.docker([
    'run', '--rm',
    '-v', '/var/run/docker.sock:/var/run/docker.sock',
    '-v', `${buildDir}:/app`,
    'ghcr.io/railwayapp/nixpacks:latest', 'build', '/app', '--name', imageRef,
  ], log);
  if (build.code !== 0) { finish(1, app.id, deploymentId, '', log); return; }

  await deployImage(exec, slug, imageRef, app, deploymentId, log);
}

function finish(code: number, appId: string, deploymentId: string, imageRef: string, log: (s: string) => void): void {
  const app = getApp(appId) as any;
  if (code === 0) {
    if (imageRef) { setAppImageRef(appId, imageRef); setDeploymentImageRef(deploymentId, imageRef); }
    log('\n✓ Deployment successful.\n');
    emit(deploymentId, '', 'success');
    updateAppStatus(appId, 'running');
    if (app) notifyAppEvent(app, 'deploy.success', `${app.name} deployed successfully${imageRef ? ` (${imageRef})` : ''}.`);
  } else {
    log(`\n✗ Deployment failed (exit ${code}).\n`);
    emit(deploymentId, '', 'error');
    updateAppStatus(appId, 'error');
    if (app) notifyAppEvent(app, 'deploy.failed', `${app.name} deployment failed (exit ${code}). Check the deployment logs.`);
  }
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
export async function startApp(appId: string): Promise<void> {
  const app = getApp(appId) as any; if (!app) throw new Error('App not found');
  const slug = app.container_name || containerSlug(app.id);
  const exec = await executorForApp(app);
  if (app.build_pack === 'dockercompose') {
    const file = exec.isRemote ? `${exec.stacksDir}/${slug}/docker-compose.yml` : path.join(exec.stacksDir, slug, 'docker-compose.yml');
    await exec.docker(composeArgs(file, composeProject(app.id), ['start']));
  } else {
    await exec.docker(['start', slug]);
  }
  await reconcileApp(app);
}

export async function stopApp(appId: string): Promise<void> {
  const app = getApp(appId) as any; if (!app) throw new Error('App not found');
  const slug = app.container_name || containerSlug(app.id);
  const exec = await executorForApp(app);
  if (app.build_pack === 'dockercompose') {
    const file = exec.isRemote ? `${exec.stacksDir}/${slug}/docker-compose.yml` : path.join(exec.stacksDir, slug, 'docker-compose.yml');
    await exec.docker(composeArgs(file, composeProject(app.id), ['stop']));
  } else {
    await exec.docker(['stop', slug]); // STOP, not destroy — data + container preserved
  }
  updateAppStatus(appId, 'stopped');
}

export async function restartApp(appId: string): Promise<void> {
  const app = getApp(appId) as any; if (!app) throw new Error('App not found');
  const slug = app.container_name || containerSlug(app.id);
  const exec = await executorForApp(app);
  if (app.build_pack === 'dockercompose') {
    const file = exec.isRemote ? `${exec.stacksDir}/${slug}/docker-compose.yml` : path.join(exec.stacksDir, slug, 'docker-compose.yml');
    await exec.docker(composeArgs(file, composeProject(app.id), ['restart']));
  } else {
    await exec.docker(['restart', slug]);
  }
  await reconcileApp(app);
}

/** Roll back to the image of the previous successful (non-current) deployment. */
export function rollbackApp(appId: string): string {
  const deployments = getDeploymentsByApp(appId) as any[];
  const successes = deployments.filter((d) => d.status === 'success' && d.image_ref);
  // index 0 is the current/latest success; the previous one is index 1
  const target = successes[1] || successes[0];
  if (!target) throw new Error('No previous successful deployment to roll back to');
  return enqueueDeploy(appId, target.image_ref);
}

export async function removeAppResources(appId: string): Promise<void> {
  const app = getApp(appId) as any; if (!app) return;
  const slug = app.container_name || containerSlug(app.id);
  const exec = await executorForApp(app);
  if (app.build_pack === 'dockercompose') {
    const file = exec.isRemote ? `${exec.stacksDir}/${slug}/docker-compose.yml` : path.join(exec.stacksDir, slug, 'docker-compose.yml');
    if (exec.isRemote) {
      await exec.docker(composeArgs(file, composeProject(app.id), ['down', '--remove-orphans']));
      await exec.run('rm', ['-rf', `${exec.stacksDir}/${slug}`]);
    } else {
      if (fs.existsSync(file)) await exec.docker(composeArgs(file, composeProject(app.id), ['down', '--remove-orphans']));
      fs.rmSync(path.join(exec.stacksDir, slug), { recursive: true, force: true });
    }
  } else {
    await exec.docker(['rm', '-f', slug]);
    if (app.build_pack === 'github' && app.image_ref) await exec.docker(['rmi', '-f', app.image_ref]);
    if (exec.isRemote) await exec.run('rm', ['-rf', `${exec.stacksDir}/${slug}`]);
    else fs.rmSync(path.join(exec.stacksDir, slug), { recursive: true, force: true });
  }
}

// ── Volume backups ────────────────────────────────────────────────────────────
function backupsDir(slug: string): string {
  return path.resolve(process.cwd(), 'data', 'backups', slug);
}

/** Named (non-host-path) volumes are the ones we can snapshot. */
function namedVolumes(app: any): string[] {
  return parseVolumes(app.volumes).map((v) => v.source).filter((s) => !s.startsWith('/'));
}

export async function listBackups(appId: string): Promise<Array<{ file: string; size: number; created: string }>> {
  const app = getApp(appId) as any; if (!app) return [];
  const dir = backupsDir(app.container_name || containerSlug(app.id));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.tar.gz')).map((file) => {
    const st = fs.statSync(path.join(dir, file));
    return { file, size: st.size, created: st.mtime.toISOString() };
  }).sort((a, b) => b.created.localeCompare(a.created));
}

/** Snapshot every named volume of an app into data/backups/<slug>/. */
export async function backupApp(appId: string): Promise<{ ok: boolean; files: string[]; message?: string }> {
  const app = getApp(appId) as any; if (!app) throw new Error('App not found');
  const slug = app.container_name || containerSlug(app.id);
  const vols = namedVolumes(app);
  if (!vols.length) return { ok: false, files: [], message: 'No named volumes to back up' };

  const dir = backupsDir(slug);
  fs.mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  for (const vol of vols) {
    const file = `${vol}__${ts}.tar.gz`;
    // Throwaway alpine container: mount the volume read-only + the backups dir, tar it up.
    const res = await docker([
      'run', '--rm',
      '-v', `${vol}:/data:ro`,
      '-v', `${dir}:/backup`,
      'alpine', 'sh', '-c', `tar czf /backup/${file} -C /data .`,
    ]);
    if (res.code === 0) files.push(file);
  }
  return { ok: files.length > 0, files };
}

// ── State reconciliation ──────────────────────────────────────────────────────
async function reconcileApp(app: { id: string; container_name?: string; build_pack?: string; status?: string; server_id?: string | null }): Promise<void> {
  const slug = app.container_name || containerSlug(app.id);
  if (app.build_pack === 'dockercompose') return; // compose status handled by its own up/down
  const exec = await getExecutor((app as any).server_id || null, STACKS_DIR);
  const info = await exec.inspect(slug);
  if (!info) {
    if (app.status === 'running') updateAppStatus(app.id, 'stopped', 'unknown');
    return;
  }
  const { status, health } = statusFromInspect(info);
  updateAppStatus(app.id, status, health);
}

/** Periodic sweep: make the DB reflect real container state (local apps only —
 *  remote apps are reconciled on demand to avoid SSH storms every 10s). */
export async function reconcileAll(): Promise<void> {
  const apps = listAppsForReconcile() as any[];
  for (const app of apps) {
    if (app.status === 'deploying') continue; // a build is in flight; don't fight it
    if (app.server_id) continue;              // remote: reconciled on lifecycle actions
    try { await reconcileApp(app); } catch { /* ignore per-app errors */ }
  }
}
