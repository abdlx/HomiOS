import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    // The suite drives real SQLite files; parallel forks would race on them.
    fileParallelism: false,
    testTimeout: 20_000,
    env: {
      NODE_ENV: 'test',
      // lib/crypto.ts needs a stable key; lib/db.ts reads DATABASE_URL at import time.
      APP_KEY: '0'.repeat(64),
      // bcrypt cost 12 is ~250ms per hash — fine in prod, far too slow for a suite.
      BCRYPT_COST: '4',
    },
  },
});
