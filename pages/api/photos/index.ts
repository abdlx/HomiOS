import { readdir, stat } from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { getSession } from '../../../lib/auth';

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

const MAX_MEDIA_RESULTS = 5000;
const SCAN_TIMEOUT_MS = 20000;

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
  media: any[];
  seenMedia: Set<string>;
  folders: Map<string, FolderSummary>;
  truncated: boolean;
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
  if (Date.now() > ctx.deadline || ctx.media.length >= MAX_MEDIA_RESULTS) {
    ctx.truncated = true;
    return;
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (Date.now() > ctx.deadline || ctx.media.length >= MAX_MEDIA_RESULTS) {
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
            const s = await stat(fullPath);
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
    // Ignore permissions errors etc.
  }
}

async function getScanRoots() {
  if (os.platform() === 'win32') {
    const { stdout } = await execAsync('wmic logicaldisk get name');
    return stdout
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length === 2 && line.endsWith(':'))
      .map(line => line + '\\');
  }

  if (os.platform() === 'linux') {
    try {
      const { stdout } = await execAsync('lsblk -J -o MOUNTPOINTS,MOUNTPOINT,TYPE,FSTYPE');
      const parsed = JSON.parse(stdout);
      const roots = new Set<string>(['/']);

      const visit = (devices: any[]) => {
        for (const dev of devices || []) {
          if (dev.type !== 'loop' && dev.fstype !== 'swap') {
            const mountpoints: (string | null)[] = dev.mountpoints || (dev.mountpoint ? [dev.mountpoint] : []);
            mountpoints.filter(Boolean).forEach((mount) => {
              if (mount && mount !== '[SWAP]') roots.add(mount);
            });
          }
          if (dev.children) visit(dev.children);
        }
      };

      visit(parsed.blockdevices || []);
      return Array.from(roots);
    } catch {
      return ['/'];
    }
  }

  return ['/'];
}

function getRequestedSources(req: any): string[] | null {
  const raw = req.query.sources;
  if (!raw || Array.isArray(raw)) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const sources = parsed
      .filter((source): source is string => typeof source === 'string')
      .map((source) => source.trim())
      .filter(Boolean);
    return sources.length > 0 ? Array.from(new Set(sources)) : null;
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  try {
    const ctx: ScanContext = {
      deadline: Date.now() + SCAN_TIMEOUT_MS,
      media: [],
      seenMedia: new Set(),
      folders: new Map(),
      truncated: false,
    };
    const requestedSources = getRequestedSources(req);
    const roots = requestedSources || await getScanRoots();
    await Promise.all(roots.map(root => findMediaInDir(root, ctx).catch(() => {})));

    // Sort by modified date descending
    ctx.media.sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    const folders = Array.from(ctx.folders.values())
      .sort((a, b) => new Date(b.modified).getTime() - new Date(a.modified).getTime());
    
    res.json({
      media: ctx.media,
      folders,
      roots,
      truncated: ctx.truncated,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}
