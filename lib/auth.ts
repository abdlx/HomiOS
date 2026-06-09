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
      const session = db.prepare(`
        SELECT s.user_id, s.expires_at, u.email 
        FROM sessions s 
        JOIN users u ON s.user_id = u.id 
        WHERE s.id = ?
      `).get(sessionId) as {user_id: number, expires_at: string, email: string} | undefined;
      
      if (!session) return null;

      if (new Date(session.expires_at) < new Date()) {
        db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
        return null;
      }

      return { userId: session.user_id, email: session.email };
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
    // Check if the users table exists
    const stmt = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
    if (!stmt.get()) return false;

    // Check if there is at least one user registered
    const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number } | undefined;
    return (result?.count ?? 0) > 0;
  } catch (err) {
    return false;
  }
}
