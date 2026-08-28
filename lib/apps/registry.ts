import fs from 'fs';
import path from 'path';
import type { AppTemplate } from './types.ts';

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

export function getCatalogApp(id: string) {
  return listCatalog().find((item) => item.id === id) || null;
}

export function clearCatalogCache() { cached = null; }
