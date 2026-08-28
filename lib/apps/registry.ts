import fs from 'fs';
import path from 'path';
import type { AppTemplate } from './types.ts';
import { getCachedCoolifyCatalog } from './coolify-catalog.ts';

let cached: AppTemplate[] | null = null;

export function listCatalog(): AppTemplate[] {
  if (cached) return cached;
  const dir = path.join(process.cwd(), 'apps', 'catalog');
  cached = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).sort().map((name) => {
    const item = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')) as AppTemplate;
    if (item.schemaVersion !== 1 || !item.id || item.provider !== 'coolify' || !item.providerType) {
      throw new Error(`Invalid app catalog entry: ${name}`);
    }
    return item;
  });
  return cached;
}

export function listFullCatalog(): AppTemplate[] {
  const coolify = getCachedCoolifyCatalog();
  const coolifyById = new Map(coolify.map((item) => [item.id, item]));
  const homios = listCatalog().map((item) => ({
    ...item,
    // The verified manifest owns HomiOS metadata while Coolify remains the
    // canonical source for the app's real artwork.
    icon: coolifyById.get(item.id)?.icon || item.icon,
    source: 'homios' as const,
  }));
  const localIds = new Set(homios.map((item) => item.id));
  return [...homios, ...coolify.filter((item) => !localIds.has(item.id))]
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getCatalogApp(id: string) {
  return listFullCatalog().find((item) => item.id === id) || null;
}

export function clearCatalogCache() { cached = null; }
