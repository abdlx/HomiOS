import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { DriveItem, HomiOSMe, RemoteFile, SearchResult, SharedItem } from '@/types';
import { basename, dirname, normalizeRemotePath } from '@/lib/path';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  rawBody?: Blob | ArrayBuffer | string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export class HomiOSError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'HomiOSError';
  }
}

export function normalizeBaseUrl(value: string): string {
  let trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';

  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `http://${trimmed}`;
  }

  try {
    const url = new URL(trimmed);
    // If user provided IP or hostname without port, default to 8740
    if (!url.port && (
      url.hostname === 'localhost' ||
      url.hostname.startsWith('192.168.') ||
      url.hostname.startsWith('10.') ||
      url.hostname.startsWith('172.') ||
      /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)
    )) {
      url.port = '8740';
      return url.toString().replace(/\/+$/, '');
    }
  } catch {
    // Keep trimmed fallback if URL parsing fails
  }

  return trimmed;
}

export async function probeInstance(rawUrl: string): Promise<{ ok: boolean; normalizedUrl: string; status: string }> {
  const normalizedUrl = normalizeBaseUrl(rawUrl);
  if (!normalizedUrl) {
    throw new HomiOSError('Please enter a server URL', 400);
  }

  const candidateUrls = [normalizedUrl];
  // If no port was specified, also try appending default 8740
  try {
    const parsed = new URL(normalizedUrl);
    if (!parsed.port) {
      parsed.port = '8740';
      candidateUrls.push(parsed.toString().replace(/\/+$/, ''));
    }
  } catch {}

  let lastError: any = null;

  for (const url of candidateUrls) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(`${url}/api/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data?.status === 'ok' || data?.status === 'running') {
          return { ok: true, normalizedUrl: url, status: data.status || 'ok' };
        }
      }
    } catch (err: any) {
      lastError = err;
    }
  }

  throw new HomiOSError(
    `No active HomiOS instance found at ${normalizedUrl}. Make sure HomiOS is running (default port 8740) and reachable from this network.`,
    503
  );
}

export type LoginResult =
  | { ok: true; token: string; sessionId?: string }
  | { ok: false; totpRequired: true }
  | { ok: false; error: string };

export async function loginToInstance(
  rawUrl: string,
  email: string,
  password: string,
  totp?: string
): Promise<LoginResult> {
  const baseUrl = normalizeBaseUrl(rawUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        email: email.trim(),
        password,
        totp: totp ? totp.trim() : undefined,
        createToken: true,
        tokenName: 'HomiFiles Mobile',
      }),
      signal: controller.signal,
    });

    const data = await res.json().catch(() => ({}));

    if (res.status === 429) {
      return { ok: false, error: 'Too many login attempts. Please wait a few minutes and try again.' };
    }

    if (res.status === 401) {
      if (data?.error?.includes('two-factor') || data?.error?.includes('code')) {
        return { ok: false, error: 'Invalid two-factor code. Try again.' };
      }
      return { ok: false, error: 'Invalid email or password.' };
    }

    if (data?.totpRequired) {
      return { ok: false, totpRequired: true };
    }

    if (!res.ok) {
      return { ok: false, error: data?.error || `Login failed with status ${res.status}` };
    }

    const token = data?.token || data?.sessionId;
    if (!token) {
      return { ok: false, error: 'Server did not return a session token.' };
    }

    return { ok: true, token, sessionId: data?.sessionId };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Connection timed out. Check your network connection.' };
    }
    return { ok: false, error: err?.message || 'Could not connect to HomiOS instance.' };
  } finally {
    clearTimeout(timeout);
  }
}

export class HomiOSClient {
  readonly baseUrl: string;
  private readonly token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.token = token.trim();
  }

  rawFileUrl(path: string, downloadZip = false) {
    const params = new URLSearchParams({ path: normalizeRemotePath(path) });
    if (downloadZip) params.set('downloadZip', 'true');
    else params.set('raw', 'true');
    return `${this.baseUrl}/api/files?${params.toString()}`;
  }

  thumbnailUrl(path: string) {
    const params = new URLSearchParams({ path: normalizeRemotePath(path), variant: 'grid' });
    return `${this.baseUrl}/api/thumbnails?${params.toString()}`;
  }

  imageHeaders() {
    return { Authorization: `Bearer ${this.token}` };
  }

  async health() {
    return this.request<{ status: string }>('/api/health', { timeoutMs: 8000, headers: {} }, false);
  }

  async me() {
    return this.request<HomiOSMe>('/api/me');
  }

  async validate() {
    await this.health();
    return this.me();
  }

  async listFiles(path: string) {
    return this.request<RemoteFile[]>(`/api/files?path=${encodeURIComponent(normalizeRemotePath(path))}`);
  }

  async drives() {
    return this.request<DriveItem[]>('/api/drives/available');
  }

  async shares() {
    return this.request<SharedItem[]>('/api/shares');
  }

  async search(query: string) {
    return this.request<SearchResult[]>(`/api/search?q=${encodeURIComponent(query)}&limit=50`);
  }

  async previewText(path: string) {
    return this.requestText(`/api/files?path=${encodeURIComponent(normalizeRemotePath(path))}&raw=true`);
  }

  async createFolder(path: string) {
    return this.request<{ ok: true; path: string }>('/api/files', {
      method: 'POST',
      body: { path: normalizeRemotePath(path), isDir: true },
    });
  }

  async rename(path: string, newPath: string) {
    return this.request<{ ok: true }>('/api/files', {
      method: 'PATCH',
      body: { path: normalizeRemotePath(path), newPath: normalizeRemotePath(newPath) },
    });
  }

  async delete(path: string) {
    return this.request<{ ok: true }>('/api/files', {
      method: 'DELETE',
      body: { path: normalizeRemotePath(path) },
    });
  }

  async copy(sourcePath: string, destinationPath: string) {
    return this.ndjsonOperation('/api/files/copy', sourcePath, destinationPath);
  }

  async move(sourcePath: string, destinationPath: string) {
    return this.ndjsonOperation('/api/files/move', sourcePath, destinationPath);
  }

  async compress(sourcePath: string, archiveName?: string, destinationDir?: string) {
    const finalName = archiveName || `${basename(sourcePath)}.zip`;
    const targetDir = destinationDir || dirname(sourcePath) || '/';
    return this.request('/api/files/zip', {
      method: 'POST',
      body: {
        sourcePaths: [normalizeRemotePath(sourcePath)],
        destinationDir: normalizeRemotePath(targetDir),
        archiveName: finalName,
      },
    });
  }

  async upload(uri: string, targetPath: string, onProgress?: (progress: number) => void) {
    const uploadUrl = `${this.baseUrl}/api/files?path=${encodeURIComponent(normalizeRemotePath(targetPath))}`;
    const result = await FileSystem.uploadAsync(
      uploadUrl,
      uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/octet-stream',
        },
        sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
      }
    );

    onProgress?.(100);
    if (result.status < 200 || result.status >= 300) {
      throw new HomiOSError(result.body || `Upload failed with HTTP ${result.status}`, result.status);
    }
  }

  async downloadAndShare(path: string, downloadZip = false) {
    const filename = downloadZip ? `${basename(path)}.zip` : basename(path);
    const target = `${FileSystem.cacheDirectory}${Date.now()}-${filename}`;
    const result = await FileSystem.downloadAsync(this.rawFileUrl(path, downloadZip), target, {
      headers: this.imageHeaders(),
    });
    if (result.status < 200 || result.status >= 300) {
      throw new HomiOSError(`Download failed with HTTP ${result.status}`, result.status);
    }
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri);
    }
    return result.uri;
  }

  private async ndjsonOperation(endpoint: string, sourcePath: string, destinationPath: string) {
    const text = await this.requestText(endpoint, {
      method: 'POST',
      body: {
        sourcePath: normalizeRemotePath(sourcePath),
        destinationPath: normalizeRemotePath(destinationPath),
      },
    });
    const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const event = JSON.parse(line);
      if (event.type === 'error') throw new Error(event.error || 'Operation failed');
    }
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}, authenticate = true): Promise<T> {
    const response = await this.fetchWithTimeout(endpoint, options, authenticate);
    if (!response.ok) throw await this.toError(response);
    return response.json() as Promise<T>;
  }

  private async requestText(endpoint: string, options: RequestOptions = {}, authenticate = true): Promise<string> {
    const response = await this.fetchWithTimeout(endpoint, options, authenticate);
    if (!response.ok) throw await this.toError(response);
    return response.text();
  }

  private async fetchWithTimeout(endpoint: string, options: RequestOptions, authenticate: boolean) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30000);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...options.headers,
    };

    if (authenticate) headers.Authorization = `Bearer ${this.token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    try {
      return await fetch(`${this.baseUrl}${endpoint}`, {
        method: options.method || 'GET',
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : options.rawBody,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private async toError(response: Response) {
    let message = `Request failed with HTTP ${response.status}`;
    try {
      const data = await response.json();
      if (data?.error) message = data.error;
    } catch {
      try {
        message = await response.text();
      } catch {
        // fallback
      }
    }
    return new HomiOSError(message, response.status);
  }
}
