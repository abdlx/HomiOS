import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', globalSetup: './tests/e2e/global-setup.ts', fullyParallel: false, workers: 1,
  timeout: 60000, expect: { timeout: 15000 }, outputDir: '.cache/playwright-results',
  reporter: [['list'], ['html', { outputFolder: '.cache/playwright-report', open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:3217', storageState: '.cache/e2e-auth.json', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'node tests/e2e/server.mjs', url: 'http://127.0.0.1:3217/login', reuseExistingServer: false, timeout: 180000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, hasTouch: true } },
  ],
});
