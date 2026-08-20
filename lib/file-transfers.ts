import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

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

async function collectFiles(source: string): Promise<{ files: FileEntry[]; isDirectory: boolean }> {
  const sourceStat = await fsp.stat(source);
  if (!sourceStat.isDirectory()) {
    return {
      files: [{ source, relative: path.basename(source), size: sourceStat.size, atime: sourceStat.atime, mtime: sourceStat.mtime }],
      isDirectory: false,
    };
  }

  const files: FileEntry[] = [];
  const walk = async (directory: string) => {
    const entries = await fsp.readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
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
  return { files, isDirectory: true };
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

/**
 * Durable, server-owned copy/move implementation used by the job worker.
 *
 * Data is written to a job-specific sibling path and renamed into place only
 * after every byte has reached disk. A cancelled or failed run never exposes a
 * half-written destination, and retries can safely discard their own staging
 * directory without touching user data.
 */
export async function runFileTransfer(options: TransferOptions) {
  const source = resolveTransferPath(options.sourcePath, options.rootPath);
  const destination = resolveTransferPath(options.destinationPath, options.rootPath);
  const shouldCancel = options.shouldCancel || (() => false);

  if (source === destination) throw new Error('Source and destination are the same');
  const sourceStat = await fsp.stat(source);
  if (sourceStat.isDirectory() && isInside(source, destination)) {
    throw new Error('Destination cannot be inside the source folder');
  }
  if (fs.existsSync(destination)) throw new Error('Destination already exists');

  // Same-volume moves are atomic and do not need a byte-copy phase.
  if (options.move) {
    try {
      await fsp.mkdir(path.dirname(destination), { recursive: true });
      await fsp.rename(source, destination);
      options.onProgress?.(100, `Moved ${path.basename(source)}`, {
        progress: 100,
        bytesTransferred: sourceStat.size,
        bytesTotal: sourceStat.size,
        filesTransferred: 1,
        filesTotal: 1,
      });
      return { sourcePath: options.sourcePath, destinationPath: options.destinationPath, bytesTransferred: sourceStat.size, filesTransferred: 1 };
    } catch (error: any) {
      if (error?.code !== 'EXDEV') throw error;
    }
  }

  const { files, isDirectory } = await collectFiles(source);
  const bytesTotal = files.reduce((total, file) => total + file.size, 0);
  const staging = path.join(
    path.dirname(destination),
    `.homios-transfer-${options.jobId}-${path.basename(destination)}`,
  );
  await fsp.rm(staging, { recursive: true, force: true });
  if (isDirectory) await fsp.mkdir(staging, { recursive: true });

  let bytesTransferred = 0;
  let filesTransferred = 0;
  let lastReport = 0;
  const report = (force = false) => {
    const now = Date.now();
    if (!force && now - lastReport < 250) return;
    lastReport = now;
    const progress = bytesTotal > 0
      ? Math.min(99, Math.round((bytesTransferred / bytesTotal) * 100))
      : Math.min(99, Math.round((filesTransferred / Math.max(1, files.length)) * 100));
    options.onProgress?.(progress, `${filesTransferred} of ${files.length} files · ${bytesTransferred} of ${bytesTotal} bytes`, {
      progress,
      bytesTransferred,
      bytesTotal,
      filesTransferred,
      filesTotal: files.length,
    });
  };

  try {
    for (const file of files) {
      if (shouldCancel()) throw new TransferCancelledError();
      const target = isDirectory ? path.join(staging, file.relative) : staging;
      await copyFileBuffered(file.source, target, shouldCancel, (bytes) => {
        bytesTransferred += bytes;
        report();
      });
      await fsp.utimes(target, file.atime, file.mtime).catch(() => {});
      filesTransferred += 1;
      report(true);
    }

    if (shouldCancel()) throw new TransferCancelledError();
    await fsp.rename(staging, destination);
    if (options.move) await fsp.rm(source, { recursive: true, force: true });
    options.onProgress?.(100, `${options.move ? 'Moved' : 'Copied'} ${path.basename(source)}`, {
      progress: 100,
      bytesTransferred,
      bytesTotal,
      filesTransferred,
      filesTotal: files.length,
    });
    return { sourcePath: options.sourcePath, destinationPath: options.destinationPath, bytesTransferred, filesTransferred };
  } catch (error) {
    await fsp.rm(staging, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}
