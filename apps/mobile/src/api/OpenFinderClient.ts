import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { DriveItem, OpenFinderMe, RemoteFile, SearchResult } from '@/types';
import { basename, normalizeRemotePath } from '@/lib/path';

type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  rawBody?: Blob | ArrayBuffer | string;
  headers?: Record<string, string>;
  timeoutMs?: number;
};

export class OpenFinderError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function normalizeBaseUrl(value: string) {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(trimmed)) return `http://${trimmed}`;
  return trimmed;
}

export class OpenFinderClient {
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
    return this.request<OpenFinderMe>('/api/me');
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

  async upload(uri: string, targetPath: string, onProgress?: (progress: number) => void) {
    const result = await FileSystem.uploadAsync(
      `${this.baseUrl}/api/files?path=${encodeURIComponent(normalizeRemotePath(targetPath))}`,
      uri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/octet-stream',
        },
        sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
      }
    );

    onProgress?.(100);
    if (result.status < 200 || result.status >= 300) {
      throw new OpenFinderError(result.body || `Upload failed with HTTP ${result.status}`, result.status);
    }
  }

  async downloadAndShare(path: string, downloadZip = false) {
    const filename = downloadZip ? `${basename(path)}.zip` : basename(path);
    const target = `${FileSystem.cacheDirectory}${Date.now()}-${filename}`;
    const result = await FileSystem.downloadAsync(this.rawFileUrl(path, downloadZip), target, {
      headers: this.imageHeaders(),
    });
    if (result.status < 200 || result.status >= 300) {
      throw new OpenFinderError(`Download failed with HTTP ${result.status}`, result.status);
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
        // keep fallback
      }
    }
    return new OpenFinderError(message, response.status);
  }
}
