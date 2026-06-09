import Database from 'better-sqlite3';

export default function handler(req: any, res: any) {
  try {
     const dbPath = process.env.DATABASE_URL || './data/filemanager.db';
     const db = new Database(dbPath);
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
     res.status(200).json({ success: true });
  } catch (err: any) {
     res.status(200).json({ error: err.message });
  }
}
