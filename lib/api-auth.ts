/**
 * Shared authentication/authorization for API routes, Socket.IO and Express.
 *
 * - withAuth(handler)              — any authenticated session or API token
 * - withAuth(handler, {ability})   — token must carry the ability (sessions always pass)
 * - withAuth(handler, {minRole})   — team role gate: member < admin < owner
 * - validateSessionCookie(header)  — raw Cookie header check (websocket path)
 */
import { getSession, type Session } from './auth.ts';
import { buildCsrfCookie, isMutatingMethod, shouldUseSecureCookies } from './request-security.ts';

export type { Session };

const ROLE_RANK: Record<string, number> = { member: 1, admin: 2, owner: 3 };

export function roleAtLeast(role: string | undefined, min: string): boolean {
  return (ROLE_RANK[role || ''] || 0) >= (ROLE_RANK[min] || 0);
}

export function hasAbility(session: Session, ability: 'read' | 'write' | 'deploy'): boolean {
  return session.via === 'session' || session.abilities.includes(ability);
}

export function requireAbility(res: any, session: Session, ability: 'read' | 'write' | 'deploy'): boolean {
  if (hasAbility(session, ability)) return true;
  res.status(403).json({ error: `Token missing '${ability}' ability` });
  return false;
}

/** Validate a raw Cookie header (used by the websocket / express handlers). */
export async function validateSessionCookie(cookieHeader: string | undefined): Promise<Session | null> {
  if (!cookieHeader) return null;
  return getSession({ headers: { cookie: cookieHeader } } as any);
}

type AuthOpts = {
  ability?: 'read' | 'write' | 'deploy';
  minRole?: 'member' | 'admin' | 'owner';
};

/** Wrap a Next API handler so it only runs for an authenticated session. */
export function withAuth(
  handler: (req: any, res: any, session: Session) => any | Promise<any>,
  opts: AuthOpts = {}
) {
  return async (req: any, res: any) => {
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Unauthorized' });
    if (session.via === 'session' && session.sessionId && !isMutatingMethod(req.method)) {
      res.setHeader('Set-Cookie', buildCsrfCookie(session.sessionId, req));
    }

    if (opts.ability && !hasAbility(session, opts.ability)) {
      return res.status(403).json({ error: `Token missing '${opts.ability}' ability` });
    }
    if (opts.minRole && !roleAtLeast(session.role, opts.minRole)) {
      return res.status(403).json({ error: `Requires ${opts.minRole} role` });
    }
    return handler(req, res, session);
  };
}

/** Build a hardened session cookie. Secure is enabled when the request is HTTPS. */
export function buildSessionCookie(sessionId: string, req?: any): string {
  const secure = shouldUseSecureCookies(req) ? '; Secure' : '';
  return `session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

export function buildAuthCookies(sessionId: string, req?: any): string[] {
  return [buildSessionCookie(sessionId, req), buildCsrfCookie(sessionId, req)];
}

export function clearSessionCookie(): string {
  return 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

export function clearAuthCookies(): string[] {
  return [
    clearSessionCookie(),
    'openfinder_csrf=; Path=/; SameSite=Lax; Max-Age=0',
  ];
}
