import { withAuth } from '../../lib/api-auth.ts';
import { getDb } from '../../lib/db.ts';

export default withAuth(async (req, res, session) => {
  const db = getDb();
  const users = db.prepare(`
    SELECT u.id, u.email, tu.role
    FROM users u JOIN team_users tu ON tu.user_id = u.id
    WHERE tu.team_id = ?
  `).all(session.teamId);
  res.status(200).json({ me: { id: session.userId, email: session.email, role: session.role, teamId: session.teamId }, users });
});
