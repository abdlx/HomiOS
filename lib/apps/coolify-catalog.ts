import fs from 'fs';
import path from 'path';
import type { AppTemplate } from './types.ts';

const SOURCE_URL = 'https://raw.githubusercontent.com/coollabsio/coolify/refs/heads/main/templates/service-templates-latest.json';
const CACHE_PATH = path.join(process.cwd(), 'data', 'coolify-service-catalog.json');
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
let memoryCache: AppTemplate[] | null = null;

function humanize(id: string) {
  return id.split(/[-_]/).filter(Boolean).map((part) => part.length <= 3 ? part.toUpperCase() : part[0].toUpperCase() + part.slice(1)).join(' ');
}

function readDiskCache(): AppTemplate[] {
  if (memoryCache) return memoryCache;
  try {
    const value = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    memoryCache = Array.isArray(value) ? value : [];
  } catch { memoryCache = []; }
  return memoryCache;
}

export function getCachedCoolifyCatalog() { return readDiskCache(); }

export function mapCoolifyCatalog(raw: Record<string, any>): AppTemplate[] {
  return Object.entries(raw).map(([id, item]): AppTemplate => ({
    schemaVersion: 1,
    id,
    name: humanize(id),
    provider: 'coolify',
    providerType: id,
    category: humanize(String(item?.category || 'other')),
    description: String(item?.slogan || 'A Coolify one-click service.'),
    verified: false,
    source: 'coolify',
    tags: Array.isArray(item?.tags) ? item.tags.map(String).slice(0, 20) : [],
    documentation: typeof item?.documentation === 'string' ? item.documentation : undefined,
    port: item?.port == null ? undefined : String(item.port),
    icon: item?.logo ? `https://raw.githubusercontent.com/coollabsio/coolify/refs/heads/main/templates/compose/${String(item.logo).replace(/^\/+/, '')}` : '',
    storage: [],
    desktop: { enabled: true, openMode: 'external-url' },
  })).sort((a, b) => a.name.localeCompare(b.name));
}

export async function refreshCoolifyCatalog(force = false): Promise<AppTemplate[]> {
  try {
    const stat = fs.statSync(CACHE_PATH);
    if (!force && Date.now() - stat.mtimeMs < MAX_AGE_MS) return readDiskCache();
  } catch {}

  try {
    const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(10_000), headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`Coolify catalog returned ${response.status}`);
    const text = await response.text();
    if (text.length > 5_000_000) throw new Error('Coolify catalog is unexpectedly large');
    const raw = JSON.parse(text) as Record<string, any>;
    const apps = mapCoolifyCatalog(raw);
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    const temp = `${CACHE_PATH}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(apps), { mode: 0o600 });
    fs.renameSync(temp, CACHE_PATH);
    memoryCache = apps;
    return apps;
  } catch (error) {
    const cached = readDiskCache();
    if (cached.length) return cached;
    throw error;
  }
}
