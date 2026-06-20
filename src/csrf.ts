const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
  return readCookie('openfinder_csrf');
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
      const token = readCookie('openfinder_csrf');
      if (token) {
        const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
        headers.set('X-OpenFinder-CSRF', token);
        init = { ...init, headers };
      }
    }

    return originalFetch(input, init);
  };
}
