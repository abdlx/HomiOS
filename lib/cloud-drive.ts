import { Readable } from 'node:stream';
import { getCloudDriveIntegration } from './cloud-drive-settings.ts';

const CLOUD_ROOT = 'Cloud Drive';
const MARKER = '.homios-cloud';

export class CloudDriveError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'CloudDriveError';
  }
}

export function cloudDriveConfigured() {
  return getCloudDriveIntegration().configured;
}

function baseUrl() {
  const { baseUrl, apiKey } = getCloudDriveIntegration();
  if (!baseUrl || !apiKey) throw new CloudDriveError(503, 'Cloud storage is not configured. Add the service and Google OAuth credentials in Settings > Storage.');
  return baseUrl;
}

export async function cloudRequest(pathname: string, init: RequestInit = {}) {
  const { apiKey } = getCloudDriveIntegration();
  const response = await fetch(`${baseUrl()}/api/v1${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...init.headers,
    },
    redirect: 'manual',
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as any;
    throw new CloudDriveError(response.status, body.message || body.error || `Cloud storage returned HTTP ${response.status}`);
  }
  return response;
}

function cloudParts(input: string) {
  const parts = String(input || '').replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts[0] === CLOUD_ROOT) parts.shift();
  return parts;
}

function marker(input: string): { kind: 'file' | 'folder'; id: string } | null {
  const parts = cloudParts(input);
  const index = parts.indexOf(MARKER);
  if (index < 0 || (parts[index + 1] !== 'file' && parts[index + 1] !== 'folder') || !parts[index + 2]) return null;
  return { kind: parts[index + 1] as 'file' | 'folder', id: parts[index + 2] };
}

async function folders() {
  const response = await cloudRequest('/folders?all=1');
  return ((await response.json()) as any).folders as Array<any>;
}

export async function resolveCloudFolder(input: string): Promise<string | null> {
  const direct = marker(input);
  if (direct?.kind === 'folder') return direct.id;
  const parts = cloudParts(input);
  if (parts.length === 0) return null;
  const all = await folders();
  let parentId: string | null = null;
  for (const name of parts) {
    const match = all.find((folder) => folder.name === name && (folder.parentId ?? null) === parentId);
    if (!match) throw new CloudDriveError(404, 'Cloud folder not found');
    parentId = match.id;
  }
  return parentId;
}

export async function listCloudFiles(input: string) {
  const folderId = await resolveCloudFolder(input);
  const query = folderId ? `folderId=${encodeURIComponent(folderId)}` : 'folderId=__root__';
  const [folderResponse, fileResponse] = await Promise.all([
    cloudRequest(`/folders?${folderId ? `parentId=${encodeURIComponent(folderId)}` : ''}`),
    cloudRequest(`/files?${query}`),
  ]);
  const childFolders = ((await folderResponse.json()) as any).folders as Array<any>;
  const files = ((await fileResponse.json()) as any).files as Array<any>;
  return [
    ...childFolders.map((folder) => ({
      name: folder.name, isDir: true, size: 0, itemCount: null,
      modified: folder.updatedAt, path: `${CLOUD_ROOT}/${MARKER}/folder/${folder.id}`,
    })),
    ...files.map((file) => ({
      name: file.name, isDir: false, size: Number(file.sizeBytes), itemCount: null,
      modified: file.updatedAt || file.createdAt, path: `${CLOUD_ROOT}/${MARKER}/file/${file.id}`,
      mimeType: file.mimeType,
    })),
  ];
}

export async function createCloudFolder(parentPath: string, name: string) {
  const parentId = await resolveCloudFolder(parentPath);
  const response = await cloudRequest('/folders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parentId }),
  });
  return response.json();
}

export async function mutateCloudItem(input: string, method: 'PATCH' | 'DELETE', body?: object) {
  const item = marker(input);
  if (!item) throw new CloudDriveError(400, 'Invalid cloud item');
  const response = await cloudRequest(`/${item.kind === 'file' ? 'files' : 'folders'}/${encodeURIComponent(item.id)}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

export async function moveCloudItem(sourcePath: string, destinationPath: string) {
  const item = marker(sourcePath);
  if (!item) throw new CloudDriveError(400, 'Invalid cloud item');
  const parts = String(destinationPath).replace(/\\/g, '/').split('/').filter(Boolean);
  const name = parts.pop();
  const folderId = await resolveCloudFolder(parts.join('/'));
  return mutateCloudItem(sourcePath, 'PATCH', {
    ...(name ? { name } : {}),
    ...(item.kind === 'file' ? { folderId } : { parentId: folderId }),
  });
}

export async function uploadCloudStream(input: string, stream: AsyncIterable<Uint8Array>, size: number, mimeType = 'application/octet-stream') {
  const parts = cloudParts(input);
  const fileName = parts.pop();
  if (!fileName) throw new CloudDriveError(400, 'Missing cloud file name');
  const folderId = await resolveCloudFolder(parts.join('/'));
  const boundary = `homios-${crypto.randomUUID()}`;
  const meta = JSON.stringify([{ fieldName: 'file-0', fileName, mimeType, sizeBytes: String(size), ...(folderId ? { folderId } : {}) }]);
  const before = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="filesMeta"\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Disposition: form-data; name="file-0"; filename="${fileName.replace(/["\r\n]/g, '_')}"\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const after = Buffer.from(`\r\n--${boundary}--\r\n`);
  async function* body() { yield before; for await (const chunk of stream) yield chunk; yield after; }
  const response = await cloudRequest('/uploads', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': String(before.length + size + after.length) },
    body: Readable.from(body()) as any,
    duplex: 'half',
  } as any);
  return response.json();
}

export async function downloadCloudFile(input: string, range?: string) {
  const item = marker(input);
  if (!item || item.kind !== 'file') throw new CloudDriveError(400, 'Invalid cloud file');
  return cloudRequest(`/files/${encodeURIComponent(item.id)}/download`, { headers: range ? { Range: range } : undefined });
}

export async function cloudStorageSummary() {
  const response = await cloudRequest('/storage/summary');
  return response.json() as Promise<any>;
}

export async function cloudConnectUrl() {
  const response = await cloudRequest('/accounts/google/connect-url');
  return ((await response.json()) as any).url as string;
}

export { CLOUD_ROOT };
