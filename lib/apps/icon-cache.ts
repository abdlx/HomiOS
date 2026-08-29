import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { AppTemplate } from './types.ts';

export const COOLIFY_ICON_ORIGIN = 'https://raw.githubusercontent.com';
export const COOLIFY_ICON_PREFIX = '/coollabsio/coolify/refs/heads/main/public/';
export const CODE_SERVER_ICON_URL = `${COOLIFY_ICON_ORIGIN}${COOLIFY_ICON_PREFIX}svgs/code-server.svg`;

const CACHE_DIR = path.join(process.cwd(), 'data', 'app-icon-cache');
const CONTENT_TYPES = new Set(['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_ICON_BYTES = 1_000_000;

export type CachedIcon = { bytes: Buffer; contentType: string };

function contentTypeFor(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.png') return 'image/png';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.gif') return 'image/gif';
  return 'image/jpeg';
}

function validatedIconUrl(value: string) {
  try {
    const url = new URL(value);
    return url.origin === COOLIFY_ICON_ORIGIN && url.pathname.startsWith(COOLIFY_ICON_PREFIX) ? url : null;
  } catch {
    return null;
  }
}

export function readBundledIcon(value: string): CachedIcon | null {
  const iconUrl = validatedIconUrl(value);
  if (!iconUrl) return null;
  const relative = iconUrl.pathname.slice(COOLIFY_ICON_PREFIX.length);
  const publicRoot = path.resolve(process.cwd(), 'coolify', 'public');
  const candidate = path.resolve(publicRoot, relative);
  if (!candidate.startsWith(`${publicRoot}${path.sep}`) || !fs.existsSync(candidate)) return null;
  return { bytes: fs.readFileSync(candidate), contentType: contentTypeFor(candidate) };
}

function cachePaths(value: string) {
  const key = createHash('sha256').update(value).digest('hex');
  return {
    data: path.join(CACHE_DIR, `${key}.bin`),
    metadata: path.join(CACHE_DIR, `${key}.json`),
  };
}

function readDownloadedIcon(value: string): CachedIcon | null {
  const paths = cachePaths(value);
  try {
    const metadata = JSON.parse(fs.readFileSync(paths.metadata, 'utf8'));
    if (!CONTENT_TYPES.has(metadata.contentType)) return null;
    const bytes = fs.readFileSync(paths.data);
    if (!bytes.length || bytes.length > MAX_ICON_BYTES) return null;
    return { bytes, contentType: metadata.contentType };
  } catch {
    return null;
  }
}

export function readCachedIcon(value: string): CachedIcon | null {
  return readBundledIcon(value) || readDownloadedIcon(value);
}

export async function ensureIconCached(value: string): Promise<CachedIcon | null> {
  const existing = readCachedIcon(value);
  if (existing) return existing;
  const iconUrl = validatedIconUrl(value);
  if (!iconUrl) return null;

  try {
    const response = await fetch(iconUrl, { signal: AbortSignal.timeout(10_000) });
    const contentType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
    if (!response.ok || !CONTENT_TYPES.has(contentType)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_ICON_BYTES) return null;

    fs.mkdirSync(CACHE_DIR, { recursive: true, mode: 0o700 });
    const paths = cachePaths(value);
    fs.writeFileSync(paths.data, bytes, { mode: 0o600 });
    fs.writeFileSync(paths.metadata, JSON.stringify({ contentType }), { mode: 0o600 });
    return { bytes, contentType };
  } catch {
    return null;
  }
}

export async function warmCoolifyIconCache(apps: AppTemplate[]) {
  const urls = [...new Set(apps.map((app) => app.icon).filter((icon): icon is string => !!icon))];
  let cursor = 0;
  const workers = Array.from({ length: Math.min(8, urls.length) }, async () => {
    while (cursor < urls.length) {
      const url = urls[cursor++];
      await ensureIconCached(url);
    }
  });
  await Promise.all(workers);
}
