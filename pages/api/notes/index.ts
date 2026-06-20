import { getDb, buildAllowedUpdate, withTransaction } from '../../../lib/db.ts';
import { getSession } from '../../../lib/auth.ts';

/**
 * /api/notes
 *
 * GET    – list all notes owned by the current user
 * POST   – create a new note
 * PATCH  – update a note
 * DELETE – remove a note
 */
export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const db = getDb();

  try {
    if (req.method === 'GET') {
      const notes = db.prepare(
        'SELECT id, title, content, updated_at as updatedAt FROM notes WHERE user_id = ? ORDER BY updated_at DESC'
      ).all(session.userId) as any[];

      // Convert SQLite datetime strings or numbers to JS timestamps
      const formatted = notes.map(n => ({
        ...n,
        updatedAt: new Date(n.updatedAt + 'Z').getTime() || new Date(n.updatedAt).getTime()
      }));

      return res.json(formatted);
    }

    if (req.method === 'POST') {
      const { id, title, content } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });

      withTransaction((tx) => {
        tx.prepare(
          'INSERT INTO notes (id, user_id, title, content) VALUES (?, ?, ?, ?)'
        ).run(id, session.userId, title || '', content || '');
      });

      return res.status(201).json({ ok: true, id });
    }

    if (req.method === 'PATCH') {
      const { id, title, content } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });

      const { setSql, values } = buildAllowedUpdate({ title, content }, { title: 'title', content: 'content' });
      if (setSql) {
        withTransaction((tx) => {
          tx.prepare(`UPDATE notes SET ${setSql}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
            .run(...values, id, session.userId);
        });
      }

      return res.json({ ok: true });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'id required' });

      const deleted = withTransaction((tx) => tx.prepare(
        'DELETE FROM notes WHERE id = ? AND user_id = ?'
      ).run(id, session.userId));

      if (deleted.changes === 0) return res.status(404).json({ error: 'Note not found' });

      return res.json({ ok: true });
    }

    res.setHeader('Allow', ['GET', 'POST', 'PATCH', 'DELETE']);
    return res.status(405).end();
  } catch (err: any) {
    console.error('[/api/notes]', err);
    return res.status(500).json({ error: 'Notes operation failed' });
  }
}
