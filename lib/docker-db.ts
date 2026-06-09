import Database from 'better-sqlite3';

const dbPath = process.env.DATABASE_URL || './data/filemanager.db';
const db = new Database(dbPath);

export function initDockerDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS docker_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS docker_apps (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES docker_projects(id),
        name TEXT NOT NULL,
        build_pack TEXT NOT NULL,
        docker_image TEXT,
        docker_image_tag TEXT DEFAULT 'latest',
        compose_content TEXT,
        ports TEXT,
        env_vars TEXT,
        status TEXT DEFAULT 'stopped',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS docker_deployments (
        id TEXT PRIMARY KEY,
        app_id TEXT REFERENCES docker_apps(id),
        status TEXT DEFAULT 'pending',
        logs TEXT DEFAULT '',
        started_at DATETIME,
        finished_at DATETIME
    );
  `);
}

// Ensure DB is initialized when this module is loaded
initDockerDB();

export function getProjects() {
  return db.prepare('SELECT * FROM docker_projects ORDER BY created_at DESC').all();
}

export function createProject(id: string, name: string, description: string) {
  const stmt = db.prepare('INSERT INTO docker_projects (id, name, description) VALUES (?, ?, ?)');
  stmt.run(id, name, description);
  return db.prepare('SELECT * FROM docker_projects WHERE id = ?').get(id);
}

export function getAppsByProject(projectId: string) {
  return db.prepare('SELECT * FROM docker_apps WHERE project_id = ? ORDER BY created_at DESC').all();
}

export function getAllApps() {
  return db.prepare(`
    SELECT a.*, p.name as project_name 
    FROM docker_apps a 
    LEFT JOIN docker_projects p ON a.project_id = p.id 
    ORDER BY a.created_at DESC
  `).all();
}

export function getApp(appId: string) {
  return db.prepare('SELECT * FROM docker_apps WHERE id = ?').get(appId);
}

export function createApp(
  id: string, projectId: string, name: string, build_pack: string, 
  docker_image: string | null, docker_image_tag: string | null, 
  compose_content: string | null, ports: string | null, env_vars: string | null
) {
  const stmt = db.prepare(`
    INSERT INTO docker_apps 
    (id, project_id, name, build_pack, docker_image, docker_image_tag, compose_content, ports, env_vars) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(id, projectId, name, build_pack, docker_image, docker_image_tag, compose_content, ports, env_vars);
  return getApp(id);
}

export function updateAppStatus(appId: string, status: string) {
  return db.prepare('UPDATE docker_apps SET status = ? WHERE id = ?').run(status, appId);
}

export function updateApp(appId: string, data: Partial<any>) {
  const keys = Object.keys(data);
  if (keys.length === 0) return getApp(appId);
  const setString = keys.map(k => `${k} = ?`).join(', ');
  const values = Object.values(data);
  db.prepare(`UPDATE docker_apps SET ${setString} WHERE id = ?`).run(...values, appId);
  return getApp(appId);
}

export function deleteApp(appId: string) {
  db.prepare('DELETE FROM docker_deployments WHERE app_id = ?').run(appId);
  return db.prepare('DELETE FROM docker_apps WHERE id = ?').run(appId);
}

export function createDeployment(id: string, appId: string) {
  db.prepare('INSERT INTO docker_deployments (id, app_id, started_at) VALUES (?, ?, CURRENT_TIMESTAMP)').run(id, appId);
  return db.prepare('SELECT * FROM docker_deployments WHERE id = ?').get(id);
}

export function updateDeployment(deploymentId: string, status: string, logs: string) {
  let query = 'UPDATE docker_deployments SET status = ?, logs = logs || ? ';
  if (status === 'success' || status === 'error') {
    query += ', finished_at = CURRENT_TIMESTAMP ';
  }
  query += 'WHERE id = ?';
  return db.prepare(query).run(status, logs, deploymentId);
}
