import { expect, test, type Page } from '@playwright/test';

const catalog = ['Atlas', 'Beacon', 'Canvas', 'Dock', 'Echo', 'Forge'].map((name, index) => ({ id: name.toLowerCase(), name, category: index % 2 ? 'Tools' : 'Media', description: `${name} helps you organize your home server with a clear and approachable interface.`, verified: index < 3, source: 'homios', icon: '', storage: [] }));
async function mocks(page: Page) {
  await page.route('**/api/drives/available', route => route.fulfill({ json: [] }));
  await page.route('**/api/apps/catalog*', route => route.fulfill({ json: { apps: catalog, catalogAvailable: true } }));
  await page.route('**/api/integrations/coolify/status*', route => route.fulfill({ json: { appStoreState: 'available', connected: true, authenticated: true, reachable: true, mode: 'managed', storageAware: true } }));
  await page.route('**/api/apps/storage-mounts', route => route.fulfill({ json: { mounts: [] } }));
  await page.route('**/api/apps/installed*', route => route.fulfill({ json: { apps: [{ id: 'installed-atlas', catalogId: 'atlas', name: 'Atlas', status: 'running', primaryUrl: 'http://atlas.test', managedByHomiOS: true }] } }));
  await page.route('**/api/apps/*/icon', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" rx="16" fill="#3b82f6"/><circle cx="32" cy="32" r="16" fill="#b8dcff"/></svg>' }));
}
test.beforeEach(async ({ page }) => { await mocks(page); });
async function openFolder(page: Page, name: string, touch: boolean) { const node = page.getByRole('option', { name, exact: true }); if (touch) await node.tap(); else await node.dblclick(); }

test('folder loading never shows previous-path data and errors have retry', async ({ page }, info) => {
  await page.goto(`/files?path=/${info.project.name}/Source`);
  await expect(page.getByRole('option', { name: 'alpha.txt', exact: true })).toBeVisible();
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/files?*', async route => { if (new URL(route.request().url()).searchParams.get('path')?.endsWith('/Source/Nested')) { await gate; await route.fulfill({ json: [{ name: 'inside.txt', path: `${info.project.name}/Source/Nested/inside.txt`, size: 1 }] }); } else await route.continue(); });
  await openFolder(page, 'Nested', info.project.name !== 'desktop');
  await expect(page.getByRole('status', { name: 'Loading folder' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'alpha.txt', exact: true })).toHaveCount(0);
  release(); await expect(page.getByRole('option', { name: 'inside.txt', exact: true })).toBeVisible();
  await page.goBack(); await expect(page.getByRole('option', { name: 'alpha.txt', exact: true })).toBeVisible();
  await page.goto('/files?path=/does-not-exist'); await expect(page.getByRole('alert').filter({ hasText: 'no longer exists' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Retry', exact: true })).toBeVisible(); await expect(page.getByText('This folder is empty')).toHaveCount(0);
});

test('bulk copy uses a destination sheet and supports filename conflicts', async ({ page }, info) => {
  await page.goto(`/files?path=/${info.project.name}/Source`);
  await page.getByRole('checkbox', { name: 'Select alpha.txt', exact: true }).check();
  await page.getByRole('checkbox', { name: 'Select bravo.txt', exact: true }).check();
  await page.getByRole('button', { name: 'Copy to…', exact: true }).click();
  const dialog = page.getByRole('dialog'); await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Parent destination folder' }).click();
  await dialog.getByRole('button', { name: 'Target', exact: true }).click();
  await dialog.getByRole('button', { name: 'Copy here', exact: true }).click();
  await expect(page.getByLabel('File operation batches')).toContainText('2 completed', { timeout: 30000 });
  await page.getByRole('button', { name: 'Copy to…', exact: true }).click();
  await dialog.getByRole('button', { name: 'Parent destination folder' }).click(); await dialog.getByRole('button', { name: 'Target', exact: true }).click(); await dialog.getByRole('button', { name: 'Copy here', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'An item with this name already exists' })).toBeVisible();
  await page.getByRole('checkbox', { name: 'Apply to remaining conflicts' }).check(); await page.getByRole('button', { name: 'Keep both', exact: true }).click();
  await expect(page.getByLabel('File operation batches')).toContainText('2 completed', { timeout: 30000 });
});

test('app details, logs, history, and independent action states', async ({ page }) => {
  await page.route('**/api/apps/installed-atlas/logs', route => route.fulfill({ json: { logs: [{ message: 'Server is ready' }, { message: 'Request completed' }] } }));
  await page.goto('/dashboard?view=app-store');
  await page.getByLabel('Search apps').fill('Atlas'); await page.getByRole('button').filter({ has: page.getByRole('heading', { name: 'Atlas', exact: true }) }).last().click();
  await expect(page.getByRole('heading', { name: 'About this app' })).toBeVisible();
  await page.getByRole('button', { name: 'Logs', exact: true }).click(); await expect(page.getByLabel('Application log output')).toContainText('Server is ready');
  await page.getByLabel('Search logs').fill('Request'); await expect(page.getByLabel('Application log output')).not.toContainText('Server is ready');
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible(); await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goBack(); await expect(page.getByLabel('Search apps')).toHaveValue('Atlas'); await page.goForward(); await expect(page.getByRole('heading', { name: 'About this app' })).toBeVisible();
  await page.reload(); await expect(page.getByRole('heading', { name: 'About this app' })).toBeVisible();
});

test('responsive light and dark layouts, reduced motion, and bounded listings', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/files?*', async route => { if (new URL(route.request().url()).searchParams.get('path') === '/large') await route.fulfill({ json: Array.from({ length: 10000 }, (_, index) => ({ name: `Long descriptive filename number ${index}.txt`, path: `large/file-${index}.txt`, size: index })) }); else await route.continue(); });
  await page.goto('/files?path=/large'); await expect(page.getByRole('listbox', { name: 'Files' }).getByRole('option').first()).toBeVisible(); await expect(page.getByRole('listbox', { name: 'Files' }).getByRole('option')).toHaveCount(await page.getByRole('listbox', { name: 'Files' }).getByRole('option').count()); expect(await page.getByRole('listbox', { name: 'Files' }).getByRole('option').count()).toBeLessThan(120);
  for (const theme of ['light', 'dark']) for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 }); await page.evaluate(value => { document.documentElement.classList.toggle('dark', value === 'dark'); }, theme);
    await page.screenshot({ path: `.cache/screenshots/${info.project.name}-${theme}-${width}-files.png` });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.goto('/dashboard?view=app-store'); await expect(page.getByLabel('Search apps')).toBeVisible(); await page.screenshot({ path: `.cache/screenshots/${info.project.name}-store.png` });
});

test('settings overview, customization, and direct navigation', async ({ page }, info) => {
  await page.goto('/settings');
  await expect(page.getByLabel('Search settings')).toBeVisible();
  await page.getByLabel('Search settings').fill('appearance');
  await page.getByRole('button', { name: /Appearance.*Wallpaper/ }).click();
  await expect(page.getByRole('heading', { name: 'Make HomiOS feel like you' })).toBeVisible();
  await page.getByRole('button', { name: 'violet accent' }).click();
  await page.getByLabel('Interface spacing').selectOption('compact');
  await page.getByLabel('Desktop icon size').selectOption('large');
  await expect(page.locator('html')).toHaveAttribute('data-accent', 'violet');
  await expect(page.locator('html')).toHaveAttribute('data-density', 'compact');
  await page.reload(); await expect(page.getByLabel('Interface spacing')).toHaveValue('compact');
  await expect(page.getByLabel('Desktop icon size')).toHaveValue('large');
  for (const theme of ['light', 'dark']) {
    await page.evaluate(value => document.documentElement.classList.toggle('dark', value === 'dark'), theme);
    await page.screenshot({ path: `.cache/screenshots/${info.project.name}-${theme}-appearance.png` });
  }
  await page.goto('/settings'); await expect(page.getByLabel('Search settings')).toBeVisible();
  await expect(page.getByText('Reading system information…')).toHaveCount(0);
  await page.screenshot({ path: `.cache/screenshots/${info.project.name}-settings.png` });
  await page.goto('/dashboard'); await page.screenshot({ path: `.cache/screenshots/${info.project.name}-desktop.png` });
});
