import Database from 'better-sqlite3';

export async function getSession(req: any) {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const sessionMatch = cookieHeader.match(/session=([^;]+)/);
    if (!sessionMatch) return null;
    const sessionId = sessionMatch[1];

    try {
      const db = new Database(process.env.DATABASE_URL || './data/filemanager.db');
      const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').get(sessionId) as {user_id: number, expires_at: string} | undefined;
      
      if (!session) return null;

      if (new Date(session.expires_at) < new Date()) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
        return null;
      }

      return { userId: session.user_id };
    } catch (dbErr) {
      return null;
    }
  } catch (err) {
    return null;
  }
}

export function isAppInitialized(): boolean {
  try {
    const db = new Database(process.env.DATABASE_URL || './data/filemanager.db');
    // Check if the initialized table exists
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='initialized'");
    if (!stmt.get()) return false;

    // Check if setup is marked complete
    const result = db.prepare('SELECT 1 FROM initialized WHERE key = ?').get('setup_complete');
    return !!result;
  } catch (err) {
    return false;
  }
}
