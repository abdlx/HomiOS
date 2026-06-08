import Database from 'better-sqlite3';

export async function getSession(req: any) {
  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const sessionMatch = cookieHeader.match(/session=([^;]+)/);
    if (!sessionMatch) return null;
    const sessionId = sessionMatch[1];

    const db = new Database('/app/data/filemanager.db');
    
    const session = db.prepare('SELECT user_id, expires_at FROM sessions WHERE id = ?').get(sessionId) as {user_id: number, expires_at: string} | undefined;
    
    if (!session) return null;

    if (new Date(session.expires_at) < new Date()) {
      db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
      return null;
    }

    return { userId: session.user_id };
  } catch (err) {
    return null;
  }
}
