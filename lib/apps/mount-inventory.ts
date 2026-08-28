import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDriveMountRoot } from '../drive-mounts.ts';
import type { AppHostMount, AppTemplate } from './types.ts';

function decodeMountInfoPath(value: string) {
  return value.replace(/\\([0-7]{3})/g, (_match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

function within(candidate: string, root: string) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

export function parseMountInfo(text: string, root = getDriveMountRoot()): AppHostMount[] {
  const normalizedRoot = path.resolve(root);
  const mounts = new Map<string, AppHostMount>();

  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const separator = line.indexOf(' - ');
    if (separator < 0) continue;
    const before = line.slice(0, separator).split(' ');
    const after = line.slice(separator + 3).split(' ');
    if (before.length < 6 || after.length < 2) continue;

    const mountPath = path.resolve(decodeMountInfoPath(before[4]));
    if (mountPath === normalizedRoot || !within(mountPath, normalizedRoot)) continue;

    let realPath: string;
    try {
      realPath = fs.realpathSync(mountPath);
    } catch {
      continue;
    }
    if (!within(realPath, normalizedRoot)) continue;

    const mountOptions = new Set(before[5].split(','));
    const superOptions = new Set(String(after[2] || '').split(','));
    const source = decodeMountInfoPath(after[1]);
    const relative = path.relative(normalizedRoot, realPath);
    const name = relative || path.basename(realPath);
    const id = crypto.createHash('sha256').update(`${source}\0${realPath}`).digest('base64url').slice(0, 24);

    mounts.set(id, {
      id,
      name,
      path: realPath,
      source,
      filesystem: after[0],
      readOnly: mountOptions.has('ro') || superOptions.has('ro'),
    });
  }

  return [...mounts.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export function listAppStorageMounts(root = getDriveMountRoot()): AppHostMount[] {
  if (process.platform !== 'linux') return [];
  try {
    return parseMountInfo(fs.readFileSync('/proc/self/mountinfo', 'utf8'), root);
  } catch {
    return [];
  }
}

export function resolveAppStorageMounts(
  template: AppTemplate,
  requestedIds: unknown,
  available = listAppStorageMounts(),
): AppHostMount[] {
  if (!template.storage.length) return [];
  const requested = requestedIds === undefined
    ? available.map((mount) => mount.id)
    : Array.isArray(requestedIds) ? requestedIds.map(String) : [];
  if (requested.length > 128) throw new Error('Select no more than 128 HomiOS storage mounts');

  const byId = new Map(available.map((mount) => [mount.id, mount]));
  const uniqueIds = [...new Set(requested)];
  const missing = uniqueIds.filter((id) => !byId.has(id));
  if (missing.length) throw new Error('One or more selected HomiOS drives are no longer mounted');

  const resolved = uniqueIds.map((id) => byId.get(id)!);
  if (template.storage.some((requirement) => requirement.required) && !resolved.length) {
    throw new Error(`${template.name} requires at least one mounted HomiOS drive`);
  }
  return resolved;
}
