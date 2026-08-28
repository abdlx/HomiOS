import { describe, expect, it } from 'vitest';
import { mapCoolifyCatalog } from '../../lib/apps/coolify-catalog.ts';

describe('Coolify catalog import', () => {
  it('keeps only browser-safe metadata and categorizes templates', () => {
    const [app] = mapCoolifyCatalog({
      actualbudget: { slogan: 'Local-first finance.', category: 'finance', tags: ['budget'], logo: 'svgs/actualbudget.png', compose: 'secret-compose-payload', port: 5006 },
    });
    expect(app).toMatchObject({ id: 'actualbudget', name: 'Actualbudget', providerType: 'actualbudget', category: 'Finance', source: 'coolify', port: '5006' });
    expect(app?.icon).toBe('https://raw.githubusercontent.com/coollabsio/coolify/refs/heads/main/public/svgs/actualbudget.png');
    expect(app).not.toHaveProperty('compose');
  });

  it('marks Coolify templates with persistent volumes as storage-aware without exposing Compose', () => {
    const compose = Buffer.from('services:\n  app:\n    image: example/app\n    volumes:\n      - app-data:/data\n').toString('base64');
    const [app] = mapCoolifyCatalog({ files: { slogan: 'Files', category: 'storage', compose } });
    expect(app?.storage).toEqual([{ id: 'homios-storage', label: 'HomiOS Storage', required: false, protectable: false }]);
    expect(app).not.toHaveProperty('compose');
  });
});
