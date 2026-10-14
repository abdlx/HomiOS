import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runFileTransfer, recoverFileTransfer, TransferCancelledError } from '../lib/file-transfers.ts';
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'homios-collisions-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
function write(name: string, content = name) { fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true }); fs.writeFileSync(path.join(root, name), content); }
const read = (name: string) => fs.readFileSync(path.join(root, name), 'utf8');
const options = (jobId = 'transfer') => ({ sourcePath: '/source.txt', destinationPath: '/target.txt', jobId, rootPath: root });
describe('transfer collisions and commit recovery', () => {
  it('rejects default collisions and preserves both originals', async () => { write('source.txt', 'new'); write('target.txt', 'old'); await expect(runFileTransfer(options())).rejects.toThrow('already exists'); expect(read('source.txt')).toBe('new'); expect(read('target.txt')).toBe('old'); });
  it('skips without consuming the move source', async () => { write('source.txt', 'new'); write('target.txt', 'old'); expect(await runFileTransfer({ ...options(), move: true, collision: 'skip' })).toMatchObject({ skipped: true }); expect(read('source.txt')).toBe('new'); expect(read('target.txt')).toBe('old'); });
  it('allocates distinct server-owned names for concurrent keep-both copies', async () => { write('source.txt', 'new'); write('target.txt', 'old'); const results = await Promise.all([1, 2, 3].map(index => runFileTransfer({ ...options(`job-${index}`), collision: 'keep-both' }))); expect(new Set(results.map(result => result.destinationPath)).size).toBe(3); expect(read('target.txt')).toBe('old'); results.forEach(result => expect(read(result.destinationPath)).toBe('new')); });
  it('supports duplicating an item in its own directory', async () => { write('source.txt', 'new'); const result = await runFileTransfer({ ...options(), destinationPath: '/source.txt', collision: 'keep-both' }); expect(result.destinationPath).toBe('/source (2).txt'); expect(read('source.txt')).toBe('new'); });
  it('replaces whole directories while preserving empty source folders', async () => { write('source/new.txt', 'new'); fs.mkdirSync(path.join(root, 'source/empty')); write('target/old.txt', 'old'); await runFileTransfer({ ...options(), sourcePath: '/source', destinationPath: '/target', collision: 'replace' }); expect(read('target/new.txt')).toBe('new'); expect(fs.existsSync(path.join(root, 'target/old.txt'))).toBe(false); expect(fs.statSync(path.join(root, 'target/empty')).isDirectory()).toBe(true); });
  it('rolls back an interrupted replacement and restores an atomic move source', async () => { write('source.txt', 'new'); write('target.txt', 'old'); const original = fsp.rename.bind(fsp); vi.spyOn(fsp, 'rename').mockImplementation(async (from, to) => { if (String(from).endsWith('.stage') && String(to).endsWith('target.txt')) throw new Error('simulated commit failure'); return original(from, to); }); await expect(runFileTransfer({ ...options(), move: true, collision: 'replace' })).rejects.toThrow('simulated commit failure'); expect(read('source.txt')).toBe('new'); expect(read('target.txt')).toBe('old'); expect(fs.readdirSync(root).filter(name => name.startsWith('.homios-transfer'))).toEqual([]); });
  it('falls back to staged copy on EXDEV and removes the source only after commit', async () => { write('source.txt', 'new'); write('target.txt', 'old'); const original = fsp.rename.bind(fsp); vi.spyOn(fsp, 'rename').mockImplementation(async (from, to) => { if (String(from) === path.join(root, 'source.txt')) throw Object.assign(new Error('cross-device'), { code: 'EXDEV' }); return original(from, to); }); await runFileTransfer({ ...options(), move: true, collision: 'replace' }); expect(read('target.txt')).toBe('new'); expect(fs.existsSync(path.join(root, 'source.txt'))).toBe(false); });
  it('preserves the old destination when copying is cancelled', async () => { write('source.txt', 'new'); write('target.txt', 'old'); let cancel = false; await expect(runFileTransfer({ ...options(), collision: 'replace', shouldCancel: () => cancel, onProgress: progress => { if (progress < 100) cancel = true; } })).rejects.toBeInstanceOf(TransferCancelledError); expect(read('target.txt')).toBe('old'); expect(read('source.txt')).toBe('new'); });
  it('replays a committed transfer without allocating another keep-both name', async () => { write('source.txt', 'new'); write('target.txt', 'old'); const first = await runFileTransfer({ ...options(), collision: 'keep-both' }); const again = await runFileTransfer({ ...options(), collision: 'keep-both' }); expect(again).toEqual(first); expect(fs.existsSync(path.join(root, 'target (3).txt'))).toBe(false); });
  it('rejects self-descendant and ancestor replacements', async () => { write('source/nested/file.txt'); await expect(runFileTransfer({ ...options(), sourcePath: '/source', destinationPath: '/source/nested/new', collision: 'replace' })).rejects.toThrow('inside'); await expect(runFileTransfer({ ...options(), sourcePath: '/source/nested', destinationPath: '/source', collision: 'replace' })).rejects.toThrow('contain'); });
  for (const committed of [false, true]) it(`recovers a crash ${committed ? 'after' : 'before'} the install rename`, () => {
    const key = createHash('sha256').update('transfer').digest('hex').slice(0, 24); const base = path.join(root, `.homios-transfer-${key}`);
    write(`${path.basename(base)}.backup`, 'old'); write(committed ? 'target.txt' : `${path.basename(base)}.stage`, 'new');
    const journal = { source: path.join(root, 'source.txt'), destination: path.join(root, 'target.txt'), staging: `${base}.stage`, backup: `${base}.backup`, movedToStage: true, move: true, phase: 'installing', result: { sourcePath: '/source.txt', destinationPath: '/target.txt', bytesTransferred: 3, filesTransferred: 1 } };
    fs.writeFileSync(`${base}.journal.json`, JSON.stringify(journal)); const result = recoverFileTransfer(options());
    expect(read('target.txt')).toBe(committed ? 'new' : 'old');
    if (committed) expect(result?.destinationPath).toBe('/target.txt'); else expect(read('source.txt')).toBe('new');
    expect(fs.existsSync(`${base}.backup`)).toBe(false);
  });
});
