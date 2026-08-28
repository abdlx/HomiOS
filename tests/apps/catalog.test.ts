import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { listCatalog } from '../../lib/apps/catalog.ts';

describe('HomiOS app catalog', () => {
  it('ships five verified metadata-only apps', () => {
    const apps = listCatalog();
    expect(apps).toHaveLength(5);
    expect(apps.map((app) => app.id)).toContain('uptime-kuma');
    expect(apps.every((app) => app.schemaVersion === 1 && app.verified && app.provider === 'coolify')).toBe(true);
  });

  it('does not embed Docker Compose in metadata', () => {
    const directory = path.join(process.cwd(), 'apps', 'catalog');
    for (const file of fs.readdirSync(directory)) {
      const value = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      expect(value).not.toHaveProperty('dockerCompose');
      expect(value).not.toHaveProperty('compose');
    }
  });
});
