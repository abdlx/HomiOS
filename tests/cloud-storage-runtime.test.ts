import { afterEach, describe, expect, it } from 'vitest';
import { applyCloudStorageEnvironment } from '../lib/cloud-storage-runtime.ts';

const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe('embedded cloud storage environment', () => {
  it('restores the HomiOS database after initializing the engine', () => {
    process.env.DATABASE_URL = './data/filemanager.db';
    const runtime = applyCloudStorageEnvironment();

    expect(process.env.DATABASE_URL).toContain('cloud-storage.db');
    runtime.restore();

    expect(process.env.DATABASE_URL).toBe('./data/filemanager.db');
  });
});
