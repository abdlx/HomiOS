import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { withAuth } from '../../../lib/api-auth.ts';
import { getDb } from '../../../lib/db.ts';

const runtimeImport = new Function('specifier', 'return import(specifier)') as <T = any>(specifier: string) => Promise<T>;

async function runtimeReaddir(dir: string) {
  const { readdir } = await runtimeImport<typeof import('fs/promises')>('fs/promises');
  return readdir(dir, { withFileTypes: true });
}

async function runtimeStat(filePath: string) {
  const { stat } = await runtimeImport<typeof import('fs/promises')>('fs/promises');
  return stat(filePath);
}

const execAsync = (cmd: string): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.heic', '.heif', '.tif', '.tiff']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.avi']);
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'windows', 'program files', 'program files (x86)',
  'programdata', 'appdata', '$recycle.bin', 'system volume information',
  'temp', 'tmp', 'proc', 'sys', 'dev', 'run', 'snap', 'var'
]);

const DEFAULT_MAX_MEDIA_RESULTS = 1500;
const HARD_MAX_MEDIA_RESULTS = 5000;
const DEFAULT_SCAN_TIMEOUT_MS = Number(process.env.PHOTOS_SCAN_TIMEOUT_MS || 12000);
const SELECTED_SOURCE_SCAN_TIMEOUT_MS = Number(process.env.PHOTOS_SELECTED_SCAN_TIMEOUT_MS || 60000);
const PHOTO_ROOT_SCAN_CONCURRENCY = Number(process.env.PHOTO_ROOT_SCAN_CONCURRENCY || 2);

interface FolderSummary {
  id: string;
  name: string;
  path: string;
  type: 'folder';
  size: number;
  modified: string;
  mediaCount: number;
  imageCount: number;
  videoCount: number;
  coverPath?: string;
}

interface ScanContext {
  deadline: number;
  maxResults: number;
  media: any[];
  seenMedia: Set<string>;
  folders: Map<string, FolderSummary>;
  truncated: boolean;
  skipped: number;
}

function isMediaFile(filename: string): 'image' | 'video' | null {
  const ext = path.extname(filename).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return null;
}

function addFolderMedia(ctx: ScanContext, folderPath: string, mediaType: 'image' | 'video', modified: string, coverPath: string) {
  const existing = ctx.folders.get(folderPath);
  const current = existing || {
    id: folderPath,
    name: path.basename(folderPath) || folderPath,
    path: folderPath,
    type: 'folder' as const,
    size: 0,
    modified,
    mediaCount: 0,
    imageCount: 0,
    videoCount: 0,
    coverPath,
  };

  current.mediaCount += 1;
  current.size = current.mediaCount;
  if (mediaType === 'image') current.imageCount += 1;
  if (mediaType === 'video') current.videoCount += 1;
  if (new Date(modified).getTime() > new Date(current.modified).getTime()) {
    current.modified = modified;
    current.coverPath = coverPath;
  }
  ctx.folders.set(folderPath, current);
}

async function findMediaInDir(dir: string, ctx: ScanContext): Promise<void> {
  if (Date.now() > ctx.deadline || ctx.media.length >= ctx.maxResults) {
    ctx.truncated = true;
    return;
  }

  try {
    const entries = await runtimeReaddir(dir);
    for (const entry of entries) {
      if (Date.now() > ctx.deadline || ctx.media.length >= ctx.maxResults) {
        ctx.truncated = true;
        return;
      }

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name.toLowerCase())) {
          await findMediaInDir(path.join(dir, entry.name), ctx).catch(() => {});
        }
      } else if (entry.isFile()) {
        const mediaType = isMediaFile(entry.name);
        if (mediaType) {
          const fullPath = path.join(dir, entry.name);
          if (ctx.seenMedia.has(fullPath)) continue;
          ctx.seenMedia.add(fullPath);
          try {
            const s = await runtimeStat(fullPath);
            const modified = s.mtime.toISOString();
            ctx.media.push({
              id: fullPath,
              name: entry.name,
              path: fullPath,
              type: mediaType,
              size: s.size,
              modified,
              folderPath: dir,
              folderName: path.basename(dir) || dir,
            });
            addFolderMedia(ctx, dir, mediaType, modified, fullPath);
          } catch {
            // ignore
          }
        }
      }
    }
  } catch (err) {
    ctx.skipped += 1;
  }
}

async function filterExistingRoots(roots: string[]) {
  const existing: string[] = [];
  for (const root of roots) {
    try {
      const s = await runtimeStat(root);
      if (s.isDirectory()) existing.push(root);
    } catch {
      // Ignore stale Settings paths, unmounted drives, and deleted folders.
    }
  }
  return existing;
}

async function scanRootsWithConcurrency(roots: string[], ctx: ScanContext) {
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, PHOTO_ROOT_SCAN_CONCURRENCY), roots.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < roots.length && !ctx.truncated) {
      const index = nextIndex++;
      await findMediaInDir(roots[index], ctx).catch(() => {});
    }
  }));
}

async function getScanRoots() {
  if (os.platform() === 'win32') {
    const roots = new Set<string>();
    const home = os.homedir();
    ['Pictures', 'Videos', 'Downloads', 'OneDrive\\Pictures', 'OneDrive\\Videos'].forEach((folder) => {
      roots.add(path.join(home, folder));
    });

    try {
      const { stdout } = await execAsync('wmic logicaldisk get deviceid,drivetype');
      stdout
        .split('\n')
        .map(line => line.trim().replace(/\s+/g, ' '))
        .forEach((line) => {
          const match = line.match(/^([A-Z]:)\s+(\d+)$/i);
          if (!match) return;
          const drive = `${match[1]}\\`;
          const driveType = Number(match[2]);
          const isRemovable = driveType === 2;
          const isNonSystemFixed = driveType === 3 && drive.toLowerCase() !== 'c:\\';
          if (isRemovable || isNonSystemFixed) roots.add(drive);
        });
    } catch {
      // Keep user media folders if drive discovery fails.
    }

    return Array.from(roots);
  }

  if (os.platform() === 'linux') {
    try {
      const { stdout } = await execAsync('lsblk -J -o MOUNTPOINTS,MOUNTPOINT,TYPE,FSTYPE');
      const parsed = JSON.parse(stdout);
      const roots = new Set<string>();
      const home = os.homedir();
      ['Pictures', 'Videos', 'Downloads', 'Media'].forEach((folder) => {
        roots.add(path.join(home, folder));
      });

      const visit = (devices: any[]) => {
        for (const dev of devices || []) {
          if (dev.type !== 'loop' && dev.fstype !== 'swap') {
            const mountpoints: (string | null)[] = dev.mountpoints || (dev.mountpoint ? [dev.mountpoint] : []);
            mountpoints.filter(Boolean).forEach((mount) => {
              if (mount && mount !== '[SWAP]' && mount !== '/' && mount !== '/boot' && mount !== '/boot/efi') {
                roots.add(mount);
              }
            });
          }
          if (dev.children) visit(dev.children);
        }
      };

      visit(parsed.blockdevices || []);
      return Array.from(roots);
    } catch {
      const home = os.homedir();
      return ['Pictures', 'Videos', 'Downloads', 'Media'].map((folder) => path.join(home, folder));
    }
  }

  const home = os.homedir();
  return ['Pictures', 'Movies', 'Downloads'].map((folder) => path.join(home, folder));
}

/** Roots an admin has explicitly configured in setup (app_settings['photos.sources']). */
function allowedSources(): string[] {
  try {
    const row = getDb()
      .prepare("SELECT value FROM app_settings WHERE key = 'photos.sources'")
      .get() as { value?: string } | undefined;
    const parsed = row?.value ? JSON.parse(row.value) : [];
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

function isWithin(root: string, candidate: string): boolean {
  const rel = path.relative(path.resolve(root), path.resolve(candidate));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/**
 * `sources` used to be taken verbatim, so any caller could point the recursive scanner
 * at an arbitrary host directory and enumerate its filenames. Requested sources must now
 * sit inside a root the admin configured during setup.
 */
function getRequestedSources(req: any): string[] | null {
  const raw = req.query.sources;
  if (!raw || Array.isArray(raw)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const roots = allowedSources();
  if (roots.length === 0) return null; // nothing approved → fall back to default roots

  const sources = parsed
    .filter((source): source is string => typeof source === 'string')
    .map((source) => source.trim())
    .filter(Boolean)
    .filter((source) => roots.some((root) => isWithin(root, source)));

  return sources.length > 0 ? Array.from(new Set(sources)) : null;
}

function getRequestedLimit(req: any) {
  const raw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_MEDIA_RESULTS;
  return Math.min(HARD_MAX_MEDIA_RESULTS, Math.max(100, Math.floor(parsed)));
}

export default withAuth(async function handler(req: any, res: any) {
  try {
    const requestedSources = getRequestedSources(req);
    const maxResults = getRequestedLimit(req);
    if (req.query.live !== 'true') {
      const db = getDb();
      const cached = db.prepare(`
        SELECT path, name, media_type as type, size, modified, metadata
        FROM media_index
        ORDER BY datetime(modified) DESC
        LIMIT ?
      `).all(maxResults) as any[];
      if (cached.length > 0) {
        const media = cached
          .map((row) => ({
            id: row.path,
            name: row.name,
            path: row.path,
            type: row.type,
            size: row.size,
            modified: row.modified,
            folderPath: path.dirname(row.path),
            folderName: path.basename(path.dirname(row.path)),
          }));
        const folders = Array.from(media.reduce((map, item) => {
          const existing = map.get(item.folderPath) || {
            id: item.folderPath,
            name: item.folderName,
            path: item.folderPath,
            type: 'folder',
            size: 0,
            modified: item.modified,
            mediaCount: 0,
            imageCount: 0,
            videoCount: 0,
            coverPath: item.path,
          };
          existing.size += 1;
          existing.mediaCount += 1;
          if (item.type === 'image') existing.imageCount += 1;
          if (item.type === 'video') existing.videoCount += 1;
          map.set(item.folderPath, existing);
          return map;
        }, new Map<string, any>()).values());
        return res.json({ media, folders, roots: requestedSources || [], truncated: cached.length >= maxResults, skipped: 0, limit: maxResults, cached: true });
      }
    }

    const ctx: ScanContext = {
      deadline: Date.now() + (requestedSources ? SELECTED_SOURCE_SCAN_TIMEOUT_MS : DEFAULT_SCAN_TIMEOUT_MS),
      maxResults,
      media: [],
      seenMedia: new Set(),
      folders: new Map(),
      truncated: false,
      skipped: 0,
    };
    const roots = await filterExistingRoots(requestedSources || await getScanRoots());
    await scanRootsWithConcurrency(roots, ctx);

    // Sort by modified date descending
    ctx.media.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    const folders = Array.from(ctx.folders.values())
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    
    res.json({
      media: ctx.media,
      folders,
      roots,
      truncated: ctx.truncated,
      skipped: ctx.skipped,
      limit: maxResults,
    });
  } catch (err: any) {
    console.error('[/api/photos]', err);
    res.status(500).json({ error: 'Failed to load photos' });
  }
}, { adminOnly: true });
