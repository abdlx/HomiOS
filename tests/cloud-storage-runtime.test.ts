import { afterEach, describe, expect, it } from 'vitest';
import { applyCloudStorageEnvironment } from '../lib/cloud-storage-runtime.ts';

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalHomiDatabasePath = process.env.HOMIOS_DATABASE_PATH;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalHomiDatabasePath === undefined) delete process.env.HOMIOS_DATABASE_PATH;
  else process.env.HOMIOS_DATABASE_PATH = originalHomiDatabasePath;
});

describe('embedded cloud storage environment', () => {
  it('restores the HomiOS database after initializing the engine', () => {
    process.env.DATABASE_URL = './data/filemanager.db';
    process.env.HOMIOS_DATABASE_PATH = './data/filemanager.db';
    const runtime = applyCloudStorageEnvironment();

    expect(process.env.DATABASE_URL).toContain('cloud-storage.db');
    expect(process.env.HOMIOS_DATABASE_PATH).toBe('./data/filemanager.db');
    runtime.restore();

    expect(process.env.DATABASE_URL).toBe('./data/filemanager.db');
    expect(process.env.HOMIOS_DATABASE_PATH).toBe('./data/filemanager.db');
  });
});
