export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); this.name = 'ApiError'; }
}
/** The CSRF fetch adapter remains the authority for credentials and mutation headers. */
export async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const value = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(value?.error || `Request failed (${response.status})`, response.status, value?.code);
  if (value === null) throw new ApiError('The server returned an invalid response.', response.status);
  return value as T;
}
