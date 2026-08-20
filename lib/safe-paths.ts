import fs from 'fs';
import path from 'path';
import { ValidationError } from './validate.ts';

export function getSambaRoot(): string {
  return path.resolve(process.env.HOMIOS_SAMBA_ROOT || '/mnt/homios-storage');
}

/**
 * Directories an administrator may publish through Samba. In addition to normal
 * data locations and configured roots, mounted volumes are discovered from the
 * host so drives do not have to live below HOMIOS_SAMBA_ROOT.
 */
export function getSambaAllowedRoots(): string[] {
  const standardDataRoots = process.platform === 'win32'
    ? []
    : ['/home', '/media', '/mnt', '/srv', '/data', '/storage'];
  const configured = String(process.env.HOMIOS_SAMBA_ALLOWED_ROOTS || '')
    .split(path.delimiter)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => path.isAbsolute(value))
    .map((value) => path.resolve(value));
  const mounted = getMountedShareRoots();
  return [...new Set([getSambaRoot(), ...standardDataRoots, ...mounted, ...configured])];
}

const blockedMountRoots = ['/boot', '/dev', '/etc', '/proc', '/root', '/run', '/snap', '/sys', '/usr', '/var'];

function decodeMountPath(value: string): string {
  return value.replace(/\\040/g, ' ').replace(/\\011/g, '\t').replace(/\\134/g, '\\');
}

function getMountedShareRoots(): string[] {
  if (process.platform !== 'linux') return [];
  try {
    return fs.readFileSync('/proc/self/mountinfo', 'utf8')
      .split('\n')
      .map((line) => line.split(' - ')[0]?.trim().split(/\s+/)[4])
      .filter(Boolean)
      .map((mountPoint) => path.resolve(decodeMountPath(mountPoint!)))
      .filter((mountPoint) => mountPoint !== '/')
      .filter((mountPoint) => !blockedMountRoots.some((root) => isInside(root, mountPoint)));
  } catch {
    return [];
  }
}

function hasControlChars(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!!rel && !rel.startsWith('..') && !path.isAbsolute(rel));
}

function realOrNearestExisting(target: string): string {
  let current = target;
  while (!fs.existsSync(current)) {
    const next = path.dirname(current);
    if (next === current) break;
    current = next;
  }
  return fs.realpathSync(current);
}

export function resolveWithinRoot(inputPath: string, rootPath?: string): string {
  const raw = String(inputPath || '').trim();
  if (!raw) throw new ValidationError('Path is required');
  if (hasControlChars(raw)) throw new ValidationError('Path contains invalid characters');
  if (!path.isAbsolute(raw)) throw new ValidationError('Share path must be absolute');

  const candidate = path.resolve(raw);
  const roots = rootPath ? [path.resolve(rootPath)] : getSambaAllowedRoots();
  for (const root of roots) {
    if (!isInside(root, candidate)) continue;
    if (fs.existsSync(root)) {
      const realRoot = fs.realpathSync(root);
      const nearestReal = realOrNearestExisting(candidate);
      if (!isInside(realRoot, nearestReal)) continue;
    }
    return candidate;
  }

  throw new ValidationError(`Samba shares must be inside an allowed root: ${roots.join(', ')}`);
}

export function sanitizeSambaText(value: string, fallback = ''): string {
  return String(value || fallback)
    .replace(/[\r\n]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 200);
}

export function validateSambaShareName(name: string): string {
  const clean = String(name || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(clean)) {
    throw new ValidationError('Share name must be alphanumeric with hyphens/underscores');
  }
  return clean;
}
