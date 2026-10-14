import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { createHash } from 'node:crypto';

const isDev = process.env.NODE_ENV !== 'production';
const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');
const COPY_BUFFER_BYTES = 1024 * 1024;

export type FileTransferProgress = {
  progress: number;
  bytesTransferred: number;
  bytesTotal: number;
  filesTransferred: number;
  filesTotal: number;
  message: string;
};

type TransferOptions = {
  sourcePath: string;
  destinationPath: string;
  jobId: string;
  move?: boolean;
  collision?: 'error' | 'replace' | 'keep-both' | 'skip';
  onProgress?: (progress: number, message?: string, data?: Partial<FileTransferProgress>) => void;
  shouldCancel?: () => boolean;
  /** Test/embedded override; production jobs always use ROOT_DIR. */
  rootPath?: string;
};

type FileEntry = { source: string; relative: string; size: number; atime: Date; mtime: Date };

export class TransferCancelledError extends Error {
  constructor() {
    super('Transfer cancelled');
    this.name = 'TransferCancelledError';
  }
}

export class TransferConflictError extends Error {
  constructor() { super('Destination already exists. Choose Replace, Keep both, or Skip.'); this.name = 'TransferConflictError'; }
}

export function resolveTransferPath(input: string, rootPath = BASE_PATH): string {
  const parts = String(input || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean);
  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    throw new Error('Invalid path');
  }
  const resolved = path.resolve(rootPath, parts.join('/'));
  const relative = path.relative(path.resolve(rootPath), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Invalid path');
  return resolved;
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

async function collectFiles(source: string): Promise<{ files: FileEntry[]; directories: string[]; isDirectory: boolean }> {
  const sourceStat = await fsp.stat(source);
  if (!sourceStat.isDirectory()) {
    return {
      files: [{ source, relative: path.basename(source), size: sourceStat.size, atime: sourceStat.atime, mtime: sourceStat.mtime }],
      isDirectory: false, directories: [],
    };
  }

  const files: FileEntry[] = [];
  const directories: string[] = [];
  const walk = async (directory: string) => {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Folders containing symbolic links cannot be transferred');
      if (entry.isDirectory()) {
        directories.push(path.relative(source, fullPath));
        await walk(fullPath);
      } else if (entry.isFile()) {
        const stat = await fsp.stat(fullPath);
        files.push({
          source: fullPath,
          relative: path.relative(source, fullPath),
          size: stat.size,
          atime: stat.atime,
          mtime: stat.mtime,
        });
      }
    }
  };
  await walk(source);
  return { files, directories, isDirectory: true };
}

async function copyFileBuffered(
  source: string,
  destination: string,
  shouldCancel: () => boolean,
  onChunk: (bytes: number) => void,
) {
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  const reader = await fsp.open(source, 'r');
  const writer = await fsp.open(destination, 'wx');
  const buffer = Buffer.allocUnsafe(COPY_BUFFER_BYTES);
  try {
    let position = 0;
    while (true) {
      if (shouldCancel()) throw new TransferCancelledError();
      const { bytesRead } = await reader.read(buffer, 0, buffer.length, position);
      if (bytesRead === 0) break;
      await writer.write(buffer, 0, bytesRead, position);
      position += bytesRead;
      onChunk(bytesRead);
    }
    await writer.sync();
  } finally {
    await Promise.allSettled([reader.close(), writer.close()]);
  }
}

type TransferResult = { sourcePath: string; destinationPath: string; bytesTransferred: number; filesTransferred: number; skipped?: boolean };
type Journal = { source: string; destination: string; staging: string; backup: string; movedToStage: boolean; move: boolean; phase: 'staging' | 'ready' | 'backup' | 'installing' | 'committed'; result: TransferResult };
const commitLocks = new Map<string, Promise<void>>();
async function withCommitLock<T>(directory: string, action: () => Promise<T>): Promise<T> {
  const previous = commitLocks.get(directory) || Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => current);
  commitLocks.set(directory, tail);
  await previous;
  try { return await action(); } finally { release(); if (commitLocks.get(directory) === tail) commitLocks.delete(directory); }
}
function transferPaths(options: Pick<TransferOptions, 'destinationPath' | 'jobId' | 'rootPath'>) {
  const destination = resolveTransferPath(options.destinationPath, options.rootPath);
  const key = createHash('sha256').update(options.jobId).digest('hex').slice(0, 24);
  const base = path.join(path.dirname(destination), `.homios-transfer-${key}`);
  return { destination, staging: `${base}.stage`, backup: `${base}.backup`, journalPath: `${base}.journal.json` };
}
function exists(target: string) { try { fs.lstatSync(target); return true; } catch (error: any) { if (error.code === 'ENOENT') return false; throw error; } }
function syncDirectory(directory: string) {
  // Windows does not allow opening directories. Linux needs this for rename durability.
  if (process.platform === 'win32') return;
  const fd = fs.openSync(directory, 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
}
function writeJournal(journalPath: string, value: Journal) {
  const temp = `${journalPath}.tmp`;
  const fd = fs.openSync(temp, 'w', 0o600);
  try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, journalPath); syncDirectory(path.dirname(journalPath));
}
function readJournal(options: Pick<TransferOptions, 'sourcePath' | 'destinationPath' | 'jobId' | 'rootPath'>): Journal | null {
  const paths = transferPaths(options);
  if (!exists(paths.journalPath)) return null;
  const value: Journal = JSON.parse(fs.readFileSync(paths.journalPath, 'utf8'));
  const source = resolveTransferPath(options.sourcePath, options.rootPath);
  const root = path.resolve(options.rootPath || BASE_PATH);
  if (value.source !== source || value.staging !== paths.staging || value.backup !== paths.backup || !isInside(root, value.destination) || path.dirname(value.destination) !== path.dirname(paths.destination) || !['staging', 'ready', 'backup', 'installing', 'committed'].includes(value.phase)) throw new Error('Invalid transfer recovery journal');
  return value;
}
/** Recover a single abandoned job, without scanning or deleting unrelated user paths. */
export function recoverFileTransfer(options: Pick<TransferOptions, 'sourcePath' | 'destinationPath' | 'jobId' | 'rootPath'>): TransferResult | null {
  const paths = transferPaths(options);
  const journal = readJournal(options);
  if (!journal) return null;
  const installed = journal.phase === 'committed' || journal.phase === 'installing' && !exists(journal.staging) && exists(journal.destination);
  if (installed) {
    // Commit won: retain the installed item, complete source cleanup, then discard the backup.
    if (journal.move && !journal.movedToStage && exists(journal.source)) fs.rmSync(journal.source, { recursive: true });
    if (exists(journal.backup)) fs.rmSync(journal.backup, { recursive: true });
    journal.phase = 'committed'; writeJournal(paths.journalPath, journal);
    return journal.result;
  }
  // Commit did not happen: put both original items back. Never remove the destination.
  if (exists(journal.backup)) {
    if (exists(journal.destination)) throw new Error('Recovery needs attention: destination changed while transfer was interrupted. Original backup has been preserved.');
    fs.renameSync(journal.backup, journal.destination);
  }
  if (exists(journal.staging)) {
    if (journal.movedToStage) {
      if (exists(journal.source)) throw new Error('Recovery needs attention: source changed while transfer was interrupted. Staged data has been preserved.');
      fs.renameSync(journal.staging, journal.source);
    } else fs.rmSync(journal.staging, { recursive: true });
  }
  fs.rmSync(paths.journalPath, { force: true }); fs.rmSync(`${paths.journalPath}.tmp`, { force: true });
  syncDirectory(path.dirname(paths.journalPath));
  return null;
}
export function cleanupTransferJournal(options: Pick<TransferOptions, 'destinationPath' | 'jobId' | 'rootPath'>) {
  const { journalPath } = transferPaths(options);
  fs.rmSync(journalPath, { force: true }); fs.rmSync(`${journalPath}.tmp`, { force: true });
}
function uniqueDestination(destination: string) {
  const extension = path.extname(destination), stem = destination.slice(0, destination.length - extension.length);
  let candidate = destination, index = 2;
  while (exists(candidate)) candidate = `${stem} (${index++})${extension}`;
  return candidate;
}

export async function runFileTransfer(options: TransferOptions): Promise<TransferResult> {
  const paths = transferPaths(options);
  const source = resolveTransferPath(options.sourcePath, options.rootPath);
  const shouldCancel = options.shouldCancel || (() => false);
  const collision = options.collision || 'error';
  if (!['error', 'replace', 'keep-both', 'skip'].includes(collision)) throw new Error('Invalid collision policy');
  const recovered = recoverFileTransfer(options);
  if (recovered) return recovered;
  if (source === paths.destination && (options.move || collision !== 'keep-both')) throw new Error('Source and destination are the same');
  const sourceStat = await fsp.lstat(source);
  if (sourceStat.isSymbolicLink()) throw new Error('Symbolic links cannot be transferred');
  await fsp.mkdir(path.dirname(paths.destination), { recursive: true });
  const realSource = await fsp.realpath(source), realParent = await fsp.realpath(path.dirname(paths.destination));
  if (sourceStat.isDirectory() && (isInside(realSource, realParent) || isInside(source, paths.destination))) throw new Error('Destination cannot be inside the source folder');
  if (source !== paths.destination && isInside(paths.destination, source)) throw new Error('Destination cannot contain the source');
  if (exists(paths.destination) && collision === 'error') throw new TransferConflictError();
  const result: TransferResult = { sourcePath: options.sourcePath, destinationPath: options.destinationPath, bytesTransferred: 0, filesTransferred: 0 };
  if (exists(paths.destination) && collision === 'skip') return { ...result, skipped: true };
  if (shouldCancel()) throw new TransferCancelledError();
  const sameVolume = sourceStat.dev === (await fsp.stat(realParent)).dev;
  const journal: Journal = { source, ...paths, movedToStage: !!options.move && sameVolume, move: !!options.move, phase: 'staging', result };
  writeJournal(paths.journalPath, journal);
  let committed = false;
  try {
    if (journal.movedToStage) {
      try { await fsp.rename(source, paths.staging); }
      catch (error: any) { if (error.code !== 'EXDEV') throw error; journal.movedToStage = false; writeJournal(paths.journalPath, journal); }
    }
    if (journal.movedToStage) { result.bytesTransferred = sourceStat.size; result.filesTransferred = 1; }
    else {
      const { files, directories, isDirectory } = await collectFiles(source);
      const bytesTotal = files.reduce((sum, file) => sum + file.size, 0);
      if (isDirectory) { await fsp.mkdir(paths.staging); for (const directory of directories) await fsp.mkdir(path.join(paths.staging, directory), { recursive: true }); }
      let lastReport = 0;
      for (const file of files) {
        if (shouldCancel()) throw new TransferCancelledError();
        const target = isDirectory ? path.join(paths.staging, file.relative) : paths.staging;
        await copyFileBuffered(file.source, target, shouldCancel, bytes => {
          result.bytesTransferred += bytes;
          if (Date.now() - lastReport < 250) return;
          lastReport = Date.now();
          const progress = bytesTotal ? Math.min(99, Math.round(result.bytesTransferred / bytesTotal * 100)) : 0;
          options.onProgress?.(progress, `Copying ${result.filesTransferred} of ${files.length} files`, { ...result, bytesTotal, filesTotal: files.length });
        });
        await fsp.utimes(target, file.atime, file.mtime).catch(() => {}); result.filesTransferred++;
      }
    }
    journal.phase = 'ready'; writeJournal(paths.journalPath, journal);
    await withCommitLock(realParent, async () => {
      if (shouldCancel()) throw new TransferCancelledError();
      if (collision === 'keep-both') journal.destination = uniqueDestination(paths.destination);
      const destinationExists = exists(journal.destination);
      if (destinationExists && collision === 'skip') { result.skipped = true; return; }
      if (destinationExists && collision !== 'replace') throw new TransferConflictError();
      result.destinationPath = '/' + path.relative(path.resolve(options.rootPath || BASE_PATH), journal.destination).split(path.sep).join('/');
      if (destinationExists) {
        journal.phase = 'backup'; writeJournal(paths.journalPath, journal);
        await fsp.rename(journal.destination, journal.backup); syncDirectory(realParent);
      }
      journal.phase = 'installing'; writeJournal(paths.journalPath, journal);
      await fsp.rename(paths.staging, journal.destination); syncDirectory(realParent);
      journal.phase = 'committed'; writeJournal(paths.journalPath, journal); committed = true;
    });
    if (result.skipped) { recoverFileTransfer(options); return result; }
    // Keep the journal until the job result has been stored. Replays finish this commit.
    recoverFileTransfer(options);
    options.onProgress?.(100, `${options.move ? 'Moved' : 'Copied'} ${path.basename(journal.destination)}`, { progress: 100, ...result, bytesTotal: result.bytesTransferred, filesTotal: result.filesTransferred });
    return result;
  } catch (error) {
    if (!committed) recoverFileTransfer(options);
    throw error;
  }
}

