/**
 * Shared authentication for API routes and the Socket.IO / Express server.
 *
 * Before this, the entire /api/docker/* surface and the server.js deploy/stop/
 * terminal endpoints had NO real auth (the socket check was a literal
 * cookie.includes('session=')). withAuth() and validateSessionCookie() close
 * that hole with a single, consistent session check backed by the sessions table.
 */
import { getSession } from './auth.ts';

export type Session = { userId: number; email: string };

/** Validate a raw Cookie header (used by the websocket / express handlers). */
export async function validateSessionCookie(cookieHeader: string | undefined): Promise<Session | null> {
  if (!cookieHeader) return null;
  return getSession({ headers: { cookie: cookieHeader } } as any);
}

/** Wrap a Next API handler so it only runs for an authenticated session. */
export function withAuth(
  handler: (req: any, res: any, session: Session) => any | Promise<any>
) {
  return async (req: any, res: any) => {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    return handler(req, res, session);
  };
}

/** Build a hardened session cookie. Secure is enabled outside development. */
export function buildSessionCookie(sessionId: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}
