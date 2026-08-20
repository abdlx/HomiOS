/** Minimal Next-style req/res doubles so route handlers can be driven in-process. */
import { csrfTokenForSession } from '../lib/request-security.ts';

export type MockRes = {
  statusCode: number;
  body: any;
  headers: Record<string, any>;
  ended: boolean;
  status(code: number): MockRes;
  json(payload: any): MockRes;
  send(payload: any): MockRes;
  end(payload?: any): MockRes;
  setHeader(key: string, value: any): void;
  getHeader(key: string): any;
  redirect(code: number, url: string): MockRes;
  destroy(): void;
  headersSent: boolean;
};

export function mockRes(): MockRes {
  const res: MockRes = {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    headersSent: false,
    status(code) { res.statusCode = code; return res; },
    json(payload) { res.body = payload; res.ended = true; res.headersSent = true; return res; },
    send(payload) { res.body = payload; res.ended = true; res.headersSent = true; return res; },
    end(payload) { if (payload !== undefined) res.body = payload; res.ended = true; res.headersSent = true; return res; },
    setHeader(key, value) { res.headers[key.toLowerCase()] = value; },
    getHeader(key) { return res.headers[key.toLowerCase()]; },
    redirect(code, url) { res.statusCode = code; res.headers.location = url; res.ended = true; return res; },
    destroy() { res.ended = true; },
  };
  return res;
}

type ReqInit = {
  method?: string;
  query?: Record<string, any>;
  body?: any;
  sessionId?: string;   // sets a valid session cookie + matching CSRF pair
  bearer?: string;
  headers?: Record<string, string>;
  origin?: string | null; // null = omit Origin entirely
};

export function mockReq(init: ReqInit = {}): any {
  const method = init.method || 'GET';
  const headers: Record<string, string> = {
    host: 'homios.test',
    ...(init.headers || {}),
  };

  if (init.origin !== null) headers.origin = init.origin || 'http://homios.test';

  if (init.sessionId) {
    const csrf = csrfTokenForSession(init.sessionId);
    headers.cookie = `session=${init.sessionId}; homios_csrf=${csrf}`;
    headers['x-homios-csrf'] = csrf;
  }
  if (init.bearer) headers.authorization = `Bearer ${init.bearer}`;

  return {
    method,
    url: '/',
    query: init.query || {},
    body: init.body,
    headers,
    socket: { remoteAddress: '10.0.0.1' },
    ip: '10.0.0.1',
  };
}
