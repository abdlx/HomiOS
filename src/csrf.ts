const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let cachedCsrfToken = '';
let csrfRequest: Promise<string> | null = null;

function readCookie(name: string): string {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  return document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length) || '';
}

export function getCsrfToken(): string {
  return readCookie('openfinder_csrf') || cachedCsrfToken;
}

export async function ensureCsrfToken(): Promise<string> {
  const existing = getCsrfToken();
  if (existing) return existing;
  if (typeof window === 'undefined') return '';

  if (!csrfRequest) {
    csrfRequest = fetch('/api/auth/csrf', { credentials: 'same-origin' })
      .then(async (res) => {
        if (!res.ok) return '';
        const data = await res.json().catch(() => null);
        cachedCsrfToken = String(data?.csrfToken || '');
        return getCsrfToken();
      })
      .catch(() => '')
      .finally(() => {
        csrfRequest = null;
      });
  }

  return csrfRequest;
}

export function installCsrfFetch(): void {
  if (typeof window === 'undefined') return;
  const marker = '__openfinderCsrfFetchInstalled';
  if ((window as any)[marker]) return;
  (window as any)[marker] = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const sameOrigin = url.startsWith('/') || new URL(url, window.location.href).origin === window.location.origin;

    if (sameOrigin && MUTATING.has(method)) {
      const token = getCsrfToken();
      if (token) {
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        headers.set('X-OpenFinder-CSRF', token);
        init = { ...init, headers };
      }
    }

    return originalFetch(input, init);
  };
}
