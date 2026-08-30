import { Readable } from 'node:stream';
import { getCloudDriveIntegration } from './cloud-drive-settings.ts';
import { internalCloudHeaders } from './cloud-storage-runtime.ts';

const CLOUD_ROOT = 'Cloud Drive';
const MARKER = '.homios-cloud';

export class CloudDriveError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
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
      ...internalCloudHeaders(),
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

type CloudMarker = { kind: 'account' | 'file' | 'folder'; id: string };
type CloudLocation = { accountId: string | null; folderId: string | null };

export function cloudMarker(input: string): CloudMarker | null {
  const parts = cloudParts(input);
  const index = parts.indexOf(MARKER);
  const kind = parts[index + 1];
  if (index < 0 || (kind !== 'account' && kind !== 'file' && kind !== 'folder') || !parts[index + 2]) return null;
  return { kind, id: parts[index + 2] };
}

async function accounts() {
  const response = await cloudRequest('/accounts');
  return ((await response.json()) as any).accounts as Array<any>;
}

async function folders(accountId?: string) {
  const response = await cloudRequest(`/folders?all=1${accountId ? `&accountId=${encodeURIComponent(accountId)}` : ''}`);
  return ((await response.json()) as any).folders as Array<any>;
}

export async function resolveCloudLocation(input: string): Promise<CloudLocation> {
  const direct = cloudMarker(input);
  if (direct?.kind === 'account') {
    const account = (await accounts()).find((candidate) => candidate.id === direct.id);
    if (!account) throw new CloudDriveError(404, 'Cloud account not found');
    return { accountId: account.id, folderId: null };
  }
  if (direct?.kind === 'folder') {
    const folder = (await folders()).find((candidate) => candidate.id === direct.id);
    if (!folder?.connectedAccountId) throw new CloudDriveError(404, 'Cloud folder account not found');
    return { accountId: folder.connectedAccountId, folderId: folder.id };
  }
  const parts = cloudParts(input);
  if (parts.length === 0) return { accountId: null, folderId: null };
  const allAccounts = await accounts();
  const accountName = parts.shift();
  const account = allAccounts.find((candidate) => candidate.id === accountName || candidate.email === accountName || candidate.displayName === accountName);
  if (!account) throw new CloudDriveError(404, 'Cloud account not found');
  const all = await folders(account.id);
  let parentId: string | null = null;
  for (const name of parts) {
    const match = all.find((folder) => folder.name === name && (folder.parentId ?? null) === parentId);
    if (!match) throw new CloudDriveError(404, 'Cloud folder not found');
    parentId = match.id;
  }
  return { accountId: account.id, folderId: parentId };
}

export async function listCloudFiles(input: string) {
  const location = await resolveCloudLocation(input);
  if (!location.accountId) {
    return (await accounts()).map((account) => ({
      name: account.email || account.displayName || 'Cloud account',
      isDir: true,
      size: 0,
      itemCount: null,
      modified: account.updatedAt || account.createdAt,
      path: `${CLOUD_ROOT}/${MARKER}/account/${account.id}`,
    }));
  }

  const account = (await accounts()).find((candidate) => candidate.id === location.accountId);
  if (account?.provider === 'google_drive' && location.folderId === null) {
    await cloudRequest('/files/sync-google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ connectedAccountId: location.accountId }),
    });
  }

  const folderQuery = new URLSearchParams({ accountId: location.accountId });
  if (location.folderId) folderQuery.set('parentId', location.folderId);
  const fileQuery = new URLSearchParams({ accountId: location.accountId, folderId: location.folderId || '__root__' });
  const [folderResponse, fileResponse] = await Promise.all([
    cloudRequest(`/folders?${folderQuery}`),
    cloudRequest(`/files?${fileQuery}`),
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
  const location = await resolveCloudLocation(parentPath);
  if (!location.accountId) throw new CloudDriveError(400, 'Choose a cloud account before creating a folder');
  const response = await cloudRequest('/folders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parentId: location.folderId, connectedAccountId: location.accountId }),
  });
  return response.json();
}

export async function mutateCloudItem(input: string, method: 'PATCH' | 'DELETE', body?: object) {
  const item = cloudMarker(input);
  if (!item || item.kind === 'account') throw new CloudDriveError(400, 'Invalid cloud item');
  const response = await cloudRequest(`/${item.kind === 'file' ? 'files' : 'folders'}/${encodeURIComponent(item.id)}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return response.json();
}

export async function moveCloudItem(sourcePath: string, destinationPath: string) {
  const item = cloudMarker(sourcePath);
  if (!item || item.kind === 'account') throw new CloudDriveError(400, 'Invalid cloud item');
  const parts = String(destinationPath).replace(/\\/g, '/').split('/').filter(Boolean);
  const name = parts.pop();
  const location = await resolveCloudLocation(parts.join('/'));
  if (!location.accountId) throw new CloudDriveError(400, 'Choose a destination account');
  return mutateCloudItem(sourcePath, 'PATCH', {
    ...(name ? { name } : {}),
    ...(item.kind === 'file' ? { folderId: location.folderId } : { parentId: location.folderId }),
  });
}

export async function uploadCloudStream(input: string, stream: AsyncIterable<Uint8Array>, size: number, mimeType = 'application/octet-stream') {
  const parts = cloudParts(input);
  const fileName = parts.pop();
  if (!fileName) throw new CloudDriveError(400, 'Missing cloud file name');
  const location = await resolveCloudLocation(parts.join('/'));
  if (!location.accountId) throw new CloudDriveError(400, 'Choose a cloud account before uploading');
  const boundary = `homios-${crypto.randomUUID()}`;
  const meta = JSON.stringify([{ fieldName: 'file-0', fileName, mimeType, sizeBytes: String(size), targetAccountId: location.accountId, ...(location.folderId ? { folderId: location.folderId } : {}) }]);
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
  const item = cloudMarker(input);
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
