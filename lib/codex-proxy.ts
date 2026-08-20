/**
 * Reverse proxy for the Codex internal app (codex-web-ui).
 *
 * codex-web-ui runs as a loopback-only service (default 127.0.0.1:5900) with its own
 * password auth disabled (--no-password). HomiOS fronts it the same way nginx fronts
 * code-server, but through the Node process so every request is gated on the HomiOS
 * session cookie instead of being open to anyone who can reach the box:
 *
 *   /codex            → 302 → /codex/
 *   /codex/<x>        → upstream /<x>       (frontend is built with --base=/codex/)
 *   /codex-api/*      → upstream, unchanged (incl. the /codex-api/ws websocket)
 *   /codex-local-*    → upstream, unchanged
 *
 * Codex can run arbitrary commands as the service user, so access requires an
 * instance admin — the same bar as the built-in terminal.
 */
import httpProxy from 'http-proxy';
import { validateSessionCookie } from './api-auth.ts';
import { isMutatingMethod } from './request-security.ts';

export const CODEX_UPSTREAM = process.env.CODEX_UPSTREAM || 'http://127.0.0.1:5900';

const CODEX_PREFIX = '/codex';

export function isCodexPath(pathname: string): boolean {
  return (
    pathname === CODEX_PREFIX ||
    pathname.startsWith(`${CODEX_PREFIX}/`) ||
    pathname.startsWith(`${CODEX_PREFIX}-`)
  );
}

type OriginCheck = (origin: string | undefined, hostHeader: string | undefined) => boolean;

type Denial = { status: number; message: string } | null;

async function denialFor(req: any, originAllowed: OriginCheck): Promise<Denial> {
  // Raw cookie validation, deliberately without HomiOS's CSRF token dance —
  // codex-web-ui's frontend knows nothing about it. Cross-site writes are stopped
  // by the SameSite=Lax session cookie plus the Origin check below.
  const session = await validateSessionCookie(req.headers?.cookie);
  if (!session) return { status: 401, message: 'Sign in to HomiOS to use Codex' };
  if (!session.isAdmin) return { status: 403, message: 'Codex requires administrator privileges' };
  if (
    isMutatingMethod(req.method) &&
    !originAllowed(req.headers?.origin, req.headers?.['x-forwarded-host'] || req.headers?.host)
  ) {
    return { status: 403, message: 'Cross-origin request rejected' };
  }
  return null;
}

function wantsHtml(req: any): boolean {
  return String(req.headers?.accept || '').includes('text/html');
}

function deny(req: any, res: any, denial: { status: number; message: string }): void {
  if (wantsHtml(req)) {
    res.writeHead(denial.status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(
      `<!doctype html><html><head><title>Codex — HomiOS</title></head>` +
      `<body style="font-family:system-ui;background:#0a0a0a;color:#e5e5e5;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0">` +
      `<div style="text-align:center"><h1 style="font-size:1.2rem">${denial.message}</h1>` +
      `<p><a href="/" style="color:#3b82f6">Open HomiOS</a></p></div></body></html>`
    );
    return;
  }
  res.writeHead(denial.status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: denial.message }));
}

/** Strip the /codex prefix for app/asset requests; /codex-api and /codex-local-* pass through as-is. */
function rewriteUrl(url: string): string {
  if (url.startsWith(`${CODEX_PREFIX}/`)) {
    return url.slice(CODEX_PREFIX.length);
  }
  return url;
}

export function createCodexProxy(options: { originAllowed: OriginCheck }) {
  const { originAllowed } = options;

  const proxy = httpProxy.createProxyServer({
    target: CODEX_UPSTREAM,
    ws: true,
    xfwd: true,
  });

  proxy.on('error', (err: any, req: any, res: any) => {
    if (!res) return;
    // res is a Socket on failed websocket proxying, a ServerResponse otherwise.
    if (typeof res.writeHead !== 'function') {
      try { res.destroy(); } catch {}
      return;
    }
    if (res.headersSent) {
      try { res.end(); } catch {}
      return;
    }
    const upstreamDown = err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND';
    deny(req, res, {
      status: 503,
      message: upstreamDown
        ? `Codex Web UI is not running on ${CODEX_UPSTREAM}`
        : 'Codex Web UI proxy error',
    });
  });

  /** Express middleware: proxies codex traffic, passes everything else through. */
  const handleRequest = async (req: any, res: any, next: () => void) => {
    if (!isCodexPath(req.path)) return next();

    try {
      const denial = await denialFor(req, originAllowed);
      if (denial) return deny(req, res, denial);
    } catch (e) {
      console.error('[codex-proxy] auth check failed:', e);
      return deny(req, res, { status: 500, message: 'Codex proxy auth check failed' });
    }

    // Land /codex (no trailing slash) on the canonical app URL.
    if (req.path === CODEX_PREFIX) {
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      res.writeHead(302, { Location: `${CODEX_PREFIX}/${query}` });
      return res.end();
    }

    req.url = rewriteUrl(req.url);
    proxy.web(req, res);
  };

  /** HTTP upgrade handler for /codex-api/ws. Caller routes only codex paths here. */
  const handleUpgrade = async (req: any, socket: any, head: Buffer) => {
    const destroyWith = (status: number, label: string) => {
      try {
        socket.write(`HTTP/1.1 ${status} ${label}\r\nConnection: close\r\n\r\n`);
      } catch {}
      socket.destroy();
    };

    try {
      // Same cross-site websocket hijacking concern as the terminal's Socket.IO check.
      if (!originAllowed(req.headers?.origin, req.headers?.['x-forwarded-host'] || req.headers?.host)) {
        return destroyWith(403, 'Forbidden');
      }
      const session = await validateSessionCookie(req.headers?.cookie);
      if (!session) return destroyWith(401, 'Unauthorized');
      if (!session.isAdmin) return destroyWith(403, 'Forbidden');
    } catch (e) {
      console.error('[codex-proxy] websocket auth check failed:', e);
      return destroyWith(500, 'Internal Server Error');
    }

    req.url = rewriteUrl(req.url);
    proxy.ws(req, socket, head);
  };

  return { handleRequest, handleUpgrade };
}
