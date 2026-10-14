import type { FileItem } from '../types';

export type FileClipboard = { action: 'copy' | 'cut'; items: readonly FileItem[] };
export type CollisionPolicy = 'error' | 'replace' | 'keep-both' | 'skip';
export const normalizePath = (path: string) => '/' + path.replace(/\\/g, '/').split('/').filter(Boolean).join('/');
export const parentPath = (path: string) => normalizePath(path).split('/').slice(0, -1).join('/') || '/';
export const pathParts = (path: string) => ['Root', ...normalizePath(path).split('/').filter(Boolean)];
export const partsPath = (parts: string[]) => normalizePath(parts[0] === 'Root' || parts[0] === 'Home' ? parts.slice(1).join('/') : parts.join('/'));
export const isCloudPath = (path: string) => /^\/Cloud Drive(?:\/|$)/.test(normalizePath(path));
export function operationUnavailable(items: readonly FileItem[], destination: string, action: 'copy' | 'move') {
  if (items.some(item => item.type === 'folder' && normalizePath(destination).startsWith(normalizePath(item.id) + '/'))) return 'A folder cannot be placed inside itself.';
  if (items.some(item => item.type === 'folder' && normalizePath(destination) === normalizePath(item.id))) return 'Choose a different destination folder.';
  if (items.some(item => isCloudPath(item.id) || isCloudPath(destination))) {
    if (action === 'copy') return 'Cloud copies are unavailable. Use upload or download instead.';
    if (items.some(item => !isCloudPath(item.id)) || !isCloudPath(destination)) return 'Move within Cloud Drive, or use upload and download between local and cloud storage.';
  }
  return null;
}
export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes)) return '—';
  const unit = bytes > 0 ? Math.min(4, Math.floor(Math.log(bytes) / Math.log(1024))) : 0;
  return `${Number((bytes / 1024 ** unit).toFixed(unit ? 1 : 0))} ${['B', 'KB', 'MB', 'GB', 'TB'][unit]}`;
}
export function toFileItem(file: any): FileItem {
  const extension = String(file.name).split('.').pop()?.toLowerCase() || '';
  const type = file.isDir ? 'folder' : /^(jpg|jpeg|png|gif|webp|svg|avif)$/.test(extension) ? 'image' : /^(mp4|webm|mkv|avi|mov|m4v)$/.test(extension) ? 'video' : extension === 'pdf' ? 'pdf' : /^(txt|md|markdown|json|jsonc|csv|log|js|jsx|cjs|mjs|ts|tsx|css|scss|html|xml|yml|yaml|toml|ini|conf|env|sh|bash|ps1|bat|cmd|py|go|rs|java|c|h|cpp|cs|php|rb|sql)$/.test(extension) ? 'text' : 'document';
  return { id: String(file.path || file.name).replace(/\\/g, '/').replace(/^\/+/, ''), name: file.name, type,
    size: file.isDir ? (file.itemCount == null ? 'Folder' : `${file.itemCount} items`) : formatBytes(file.size),
    sizeBytes: file.isDir ? undefined : file.size, updatedAt: file.modified || '', itemCount: file.itemCount,
    folderColor: 'blue', thumbnailUrl: ['image', 'video'].includes(type) ? `/api/thumbnails?variant=grid&path=${encodeURIComponent(file.path || file.name)}` : undefined };
}
