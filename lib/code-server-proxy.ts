/** Dedicated reverse proxy for the host's loopback-only code-server process. */
import httpProxy from 'http-proxy';

const CODE_SERVER_PREFIX = '/code';

export const CODE_SERVER_UPSTREAM =
  process.env.CODE_SERVER_UPSTREAM ||
  `http://127.0.0.1:${process.env.CODE_SERVER_PORT || '8080'}`;

export function isCodeServerPath(pathname: string): boolean {
  return pathname === CODE_SERVER_PREFIX || pathname.startsWith(`${CODE_SERVER_PREFIX}/`);
}

export function rewriteCodeServerUrl(url: string): string {
  if (url === CODE_SERVER_PREFIX) return '/';
  if (url.startsWith(`${CODE_SERVER_PREFIX}/`)) {
    return url.slice(CODE_SERVER_PREFIX.length) || '/';
  }
  return url;
}

function proxyError(err: any, res: any): void {
  if (!res) return;
  if (typeof res.writeHead !== 'function') {
    try { res.destroy(); } catch {}
    return;
  }
  if (res.headersSent) {
    try { res.end(); } catch {}
    return;
  }

  const upstreamDown = err?.code === 'ECONNREFUSED' || err?.code === 'ENOTFOUND';
  res.writeHead(upstreamDown ? 503 : 502, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    error: upstreamDown
      ? `Code Server is not running on ${CODE_SERVER_UPSTREAM}`
      : 'Code Server proxy error',
  }));
}

export function createCodeServerProxy() {
  const proxy = httpProxy.createProxyServer({
    target: CODE_SERVER_UPSTREAM,
    ws: true,
    xfwd: true,
  });

  proxy.on('error', (err: any, _req: any, res: any) => proxyError(err, res));

  const handleRequest = (req: any, res: any, next: () => void) => {
    if (!isCodeServerPath(req.path)) return next();

    if (req.path === CODE_SERVER_PREFIX) {
      const query = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
      res.writeHead(302, { Location: `${CODE_SERVER_PREFIX}/${query}` });
      return res.end();
    }

    req.url = rewriteCodeServerUrl(req.url);
    proxy.web(req, res);
  };

  const handleUpgrade = (req: any, socket: any, head: Buffer) => {
    req.url = rewriteCodeServerUrl(req.url || '/');
    proxy.ws(req, socket, head);
  };

  return { handleRequest, handleUpgrade };
}
