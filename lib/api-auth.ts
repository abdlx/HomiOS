/**
 * Shared authentication/authorization for API routes, Socket.IO and Express.
 *
 * - withAuth(handler)              — any authenticated session or API token
 * - withAuth(handler, {ability})   — token must carry the ability (sessions always pass)
 * - withAuth(handler, {minRole})   — team role gate: member < admin < owner
 * - validateSessionCookie(header)  — raw Cookie header check (websocket path)
 */
import { getSession, type Session } from './auth.ts';
import {
  LEGACY_SESSION_COOKIE,
  SESSION_COOKIE,
  buildCsrfCookie,
  isMutatingMethod,
  shouldUseSecureCookies,
} from './request-security.ts';

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

export function isInstanceAdmin(session: Session | null | undefined): boolean {
  return !!session?.isAdmin;
}

/** Instance-admin gate for non-Next surfaces (Socket.IO, Express, TUS). */
export function requireAdmin(res: any, session: Session): boolean {
  if (session.isAdmin) return true;
  res.status(403).json({ error: 'Requires administrator privileges' });
  return false;
}

type AuthOpts = {
  ability?: 'read' | 'write' | 'deploy';
  /**
   * Instance-administrator gate — required for host-level power: filesystem,
   * terminal, drive mounts, SSH keys, Samba, system profile.
   */
  adminOnly?: boolean;
};

/*
 * There is deliberately NO `minRole` option here.
 *
 * It used to exist and was load-bearing on ~10 routes, but it compared against
 * session.role — the role in the *active* team. Every user owns a personal team and
 * primaryTeamFor() prefers owned teams, so session.role is 'owner' for literally every
 * account: `minRole: 'admin'` admitted everyone and gated nothing.
 *
 * Use instead:
 *   - host-level power        → { adminOnly: true }  (users.is_admin)
 *   - team-scoped power       → roleAtLeast(roleInTeam(session.userId, targetTeamId), 'admin')
 *     i.e. resolve the role in the team you are about to act on, not the ambient one.
 *     See pages/api/teams/[id]/members.ts and .../notifications.ts.
 */

/** Wrap a Next API handler so it only runs for an authenticated session. */
export function withAuth(
  handler: (req: any, res: any, session: Session) => any | Promise<any>,
  opts: AuthOpts = {}
) {
  return async (req: any, res: any) => {
    const session = await getSession(req);
    if (!session) {
      // getSession() marks CSRF rejections so they don't masquerade as "logged out".
      if (req.authFailure === 'csrf') {
        return res.status(403).json({ error: 'Invalid or missing CSRF token' });
      }
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session.via === 'session' && session.sessionId && !isMutatingMethod(req.method)) {
      res.setHeader('Set-Cookie', buildCsrfCookie(session.sessionId, req));
    }

    if (opts.adminOnly && !session.isAdmin) {
      return res.status(403).json({ error: 'Requires administrator privileges' });
    }
    if (opts.ability && !hasAbility(session, opts.ability)) {
      return res.status(403).json({ error: `Token missing '${opts.ability}' ability` });
    }
    return handler(req, res, session);
  };
}

/** Build a hardened session cookie. Secure is enabled when the request is HTTPS. */
export function buildSessionCookie(sessionId: string, req?: any): string {
  const secure = shouldUseSecureCookies(req) ? '; Secure' : '';
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

export function buildAuthCookies(sessionId: string, req?: any): string[] {
  return [buildSessionCookie(sessionId, req), buildCsrfCookie(sessionId, req)];
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function clearAuthCookies(): string[] {
  return [
    clearSessionCookie(),
    `${LEGACY_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
    'homios_csrf=; Path=/; SameSite=Lax; Max-Age=0',
  ];
}
