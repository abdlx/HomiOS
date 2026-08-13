import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { runFileTransfer, TransferCancelledError } from '../lib/file-transfers.ts';

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'openfinder-transfer-'));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function write(relative: string, contents: string) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

describe('server-owned file transfers', () => {
  it('copies a directory tree and reports persisted byte progress', async () => {
    write('source/a.txt', 'alpha');
    write('source/nested/b.txt', 'bravo');
    const reports: any[] = [];
    const result = await runFileTransfer({
      sourcePath: '/source',
      destinationPath: '/destination',
      jobId: 'copy-test',
      rootPath: root,
      onProgress: (progress, _message, data) => reports.push({ progress, ...data }),
    });

    expect(fs.readFileSync(path.join(root, 'destination/a.txt'), 'utf8')).toBe('alpha');
    expect(fs.readFileSync(path.join(root, 'destination/nested/b.txt'), 'utf8')).toBe('bravo');
    expect(result.filesTransferred).toBe(2);
    expect(reports.at(-1)).toMatchObject({ progress: 100, bytesTransferred: 10, bytesTotal: 10 });
  });

  it('moves across the copy path only after the destination is complete', async () => {
    write('source/file.txt', 'durable');
    await runFileTransfer({
      sourcePath: '/source',
      destinationPath: '/destination',
      jobId: 'move-test',
      rootPath: root,
      move: true,
    });
    expect(fs.existsSync(path.join(root, 'source'))).toBe(false);
    expect(fs.readFileSync(path.join(root, 'destination/file.txt'), 'utf8')).toBe('durable');
  });

  it('removes its staging data when cancellation is requested', async () => {
    write('source/file.txt', 'cancel me');
    await expect(runFileTransfer({
      sourcePath: '/source',
      destinationPath: '/destination',
      jobId: 'cancel-test',
      rootPath: root,
      shouldCancel: () => true,
    })).rejects.toBeInstanceOf(TransferCancelledError);
    expect(fs.existsSync(path.join(root, 'destination'))).toBe(false);
    expect(fs.readdirSync(root).some((name) => name.startsWith('.openfinder-transfer-'))).toBe(false);
  });
});
