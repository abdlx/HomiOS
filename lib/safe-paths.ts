import fs from 'fs';
import path from 'path';
import { ValidationError } from './validate.ts';

export function getSambaRoot(): string {
  return path.resolve(process.env.OPENFINDER_SAMBA_ROOT || '/mnt/openfinder-storage');
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

export function resolveWithinRoot(inputPath: string, rootPath = getSambaRoot()): string {
  const raw = String(inputPath || '').trim();
  if (!raw) throw new ValidationError('Path is required');
  if (hasControlChars(raw)) throw new ValidationError('Path contains invalid characters');
  if (!path.isAbsolute(raw)) throw new ValidationError('Share path must be absolute');

  const root = path.resolve(rootPath);
  const candidate = path.resolve(raw);
  if (!isInside(root, candidate)) {
    throw new ValidationError(`Samba shares must be inside ${root}`);
  }
  if (fs.existsSync(root)) {
    const realRoot = fs.realpathSync(root);
    const nearestReal = realOrNearestExisting(candidate);
    if (!isInside(realRoot, nearestReal)) {
      throw new ValidationError(`Samba shares must be inside ${root}`);
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
    throw new ValidationError('Share name must be alphanumeric with hyphens/underscores');
  }
  return clean;
}
