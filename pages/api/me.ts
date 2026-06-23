import { withAuth } from '../../lib/api-auth.ts';

export default withAuth(async (req, res, session) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({
    server: {
      name: 'OpenFinder',
      version: process.env.npm_package_version || '0.0.0',
    },
    user: {
      id: session.userId,
      email: session.email,
      role: session.role,
      teamId: session.teamId,
      abilities: session.abilities,
      via: session.via,
    },
  });
});
