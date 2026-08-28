import { describe, expect, it } from 'vitest';
import { mapCoolifyCatalog } from '../../lib/apps/coolify-catalog.ts';

describe('Coolify catalog import', () => {
  it('keeps only browser-safe metadata and categorizes templates', () => {
    const [app] = mapCoolifyCatalog({
      actualbudget: { slogan: 'Local-first finance.', category: 'finance', tags: ['budget'], logo: 'svgs/actualbudget.png', compose: 'secret-compose-payload', port: 5006 },
    });
    expect(app).toMatchObject({ id: 'actualbudget', name: 'Actualbudget', providerType: 'actualbudget', category: 'Finance', source: 'coolify', port: '5006' });
    expect(app).not.toHaveProperty('compose');
  });
});
