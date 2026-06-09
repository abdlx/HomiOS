import fs from 'fs';
import path from 'path';

const dbPath = './data/docker.json';

// Ensure data directory exists
if (!fs.existsSync('./data')) {
  fs.mkdirSync('./data', { recursive: true });
}

// Ensure db file exists
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ projects: [], apps: [], deployments: [] }, null, 2));
}

function readDB() {
  const data = fs.readFileSync(dbPath, 'utf-8');
  return JSON.parse(data);
}

function writeDB(data: any) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

export function initDockerDB() {
  // DB is initialized on module load
}

export function getProjects() {
  const db = readDB();
  return db.projects.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function createProject(id: string, name: string, description: string) {
  const db = readDB();
  const newProject = { id, name, description, created_at: new Date().toISOString() };
  db.projects.push(newProject);
  writeDB(db);
  return newProject;
}

export function getAppsByProject(projectId: string) {
  const db = readDB();
  return db.apps
    .filter((a: any) => a.project_id === projectId)
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function getAllApps() {
  const db = readDB();
  return db.apps
    .map((a: any) => {
      const proj = db.projects.find((p: any) => p.id === a.project_id);
      return { ...a, project_name: proj ? proj.name : null };
    })
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export function getApp(appId: string) {
  const db = readDB();
  return db.apps.find((a: any) => a.id === appId);
}

export function createApp(
  id: string, projectId: string, name: string, build_pack: string, 
  docker_image: string | null, docker_image_tag: string | null, 
  compose_content: string | null, ports: string | null, env_vars: string | null,
  domains: string | null, git_repo: string | null, git_branch: string | null,
  volumes: string | null
) {
  const db = readDB();
  const newApp = {
    id, project_id: projectId, name, build_pack, 
    docker_image, docker_image_tag: docker_image_tag || 'latest', 
    compose_content, ports, env_vars, domains, 
    git_repo, git_branch: git_branch || 'main',
    volumes, status: 'stopped', 
    created_at: new Date().toISOString()
  };
  db.apps.push(newApp);
  writeDB(db);
  return newApp;
}

export function updateAppStatus(appId: string, status: string) {
  const db = readDB();
  const app = db.apps.find((a: any) => a.id === appId);
  if (app) {
    app.status = status;
    writeDB(db);
  }
}

export function updateApp(appId: string, data: Partial<any>) {
  const db = readDB();
  const appIndex = db.apps.findIndex((a: any) => a.id === appId);
  if (appIndex !== -1) {
    db.apps[appIndex] = { ...db.apps[appIndex], ...data };
    writeDB(db);
    return db.apps[appIndex];
  }
  return null;
}

export function deleteApp(appId: string) {
  const db = readDB();
  db.deployments = db.deployments.filter((d: any) => d.app_id !== appId);
  db.apps = db.apps.filter((a: any) => a.id !== appId);
  writeDB(db);
}

export function createDeployment(id: string, appId: string) {
  const db = readDB();
  const newDeployment = { id, app_id: appId, status: 'pending', logs: '', started_at: new Date().toISOString(), finished_at: null };
  db.deployments.push(newDeployment);
  writeDB(db);
  return newDeployment;
}

export function getDeployment(id: string) {
  const db = readDB();
  return db.deployments.find((d: any) => d.id === id);
}

export function updateDeployment(deploymentId: string, status: string, logs: string) {
  const db = readDB();
  const deployment = db.deployments.find((d: any) => d.id === deploymentId);
  if (deployment) {
    deployment.status = status;
    deployment.logs = (deployment.logs || '') + logs;
    if (status === 'success' || status === 'error') {
      deployment.finished_at = new Date().toISOString();
    }
    writeDB(db);
  }
}
