import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'homios-browser-'));
process.env.HOMIOS_DATABASE_PATH = path.join(root, 'test.db');
process.env.ROOT_DIR = path.join(root, 'files');
process.env.APP_KEY = '0'.repeat(64);
process.env.BCRYPT_COST = '4';
process.env.HOMIOS_PORT = '3217';
process.env.HOST = '127.0.0.1';
process.env.HOMIOS_NEXT_DIST_DIR = '.next-e2e';
process.env.HOMIOS_DISABLE_PWA = 'true';
for (const project of ['desktop', 'mobile', 'tablet']) {
  for (const folder of ['Source', 'Target', 'Empty']) fs.mkdirSync(path.join(process.env.ROOT_DIR, project, folder), { recursive: true });
  for (const name of ['alpha.txt', 'bravo.txt']) fs.writeFileSync(path.join(process.env.ROOT_DIR, project, 'Source', name), `Test ${name}`);
  fs.mkdirSync(path.join(process.env.ROOT_DIR, project, 'Source', 'Nested'));
}
// This server uses an OS-temporary database and filesystem; it never opens user data.
await import('../../server.js');
