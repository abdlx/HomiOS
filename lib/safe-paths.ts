import fs from 'fs';
import path from 'path';

export const SAMBA_ROOT = process.env.OPENFINDER_SAMBA_ROOT || '/mnt/openfinder-storage';

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

export function resolveWithinRoot(inputPath: string, rootPath = SAMBA_ROOT): string {
  const raw = String(inputPath || '').trim();
  if (!raw) throw new Error('Path is required');
  if (hasControlChars(raw)) throw new Error('Path contains invalid characters');

  const root = path.resolve(rootPath);
  const candidate = path.resolve(raw);
  if (!isInside(root, candidate)) {
    throw new Error(`Path must stay inside ${root}`);
  }
  if (fs.existsSync(root)) {
    const realRoot = fs.realpathSync(root);
    const nearestReal = realOrNearestExisting(candidate);
    if (!isInside(realRoot, nearestReal)) {
      throw new Error(`Path must stay inside ${root}`);
    }
  }

  return candidate;
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
    throw new Error('Share name must be alphanumeric with hyphens/underscores');
  }
  return clean;
}
