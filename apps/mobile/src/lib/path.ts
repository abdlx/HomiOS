export function normalizeRemotePath(value: string) {
  const parts = String(value || '/')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  return `/${parts.join('/')}`;
}

export function joinRemotePath(parent: string, name: string) {
  return normalizeRemotePath(`${normalizeRemotePath(parent)}/${name}`);
}

export function parentRemotePath(value: string) {
  const parts = normalizeRemotePath(value).split('/').filter(Boolean);
  parts.pop();
  return normalizeRemotePath(parts.join('/'));
}

export function basename(value: string) {
  const parts = normalizeRemotePath(value).split('/').filter(Boolean);
  return parts.at(-1) || 'Root';
}

export function extension(name: string) {
  const index = name.lastIndexOf('.');
  return index >= 0 ? name.slice(index + 1).toLowerCase() : '';
}

export function classifyFile(name: string) {
  const ext = extension(name);
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
  if (['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'].includes(ext)) return 'video';
  if (ext === 'pdf') return 'pdf';
  if (['txt', 'md', 'json', 'js', 'ts', 'tsx', 'css', 'html', 'log', 'yml', 'yaml'].includes(ext)) return 'text';
  return 'file';
}
