import fs from 'fs';
import path from 'path';
import type { AppTemplate } from './types.ts';

const ALLOWED_ROOTS = (process.env.HOMIOS_APP_STORAGE_ROOTS || '/mnt/homios-apps,/mnt/homios-storage')
  .split(',').map((value) => path.resolve(value.trim())).filter(Boolean);

function within(candidate: string, root: string) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

export function validateStorageSelection(
  template: AppTemplate,
  selection: Record<string, string> = {},
  fallbackPath?: string,
) {
  const normalized: Record<string, string> = {};
  for (const requirement of template.storage) {
    const raw = selection[requirement.id] || (requirement.required ? fallbackPath : undefined);
    if (!raw) {
      if (requirement.required) throw new Error(`${requirement.label} storage is required`);
      continue;
    }
    if (!path.isAbsolute(raw)) throw new Error(`${requirement.label} must use an absolute HomiOS storage path`);
    const resolved = path.resolve(raw);
    if (!ALLOWED_ROOTS.some((root) => within(resolved, root))) {
      throw new Error(`${requirement.label} is outside approved HomiOS storage roots`);
    }
    const existingParent = fs.existsSync(resolved) ? resolved : path.dirname(resolved);
    if (!fs.existsSync(existingParent)) throw new Error(`${requirement.label} drive is not mounted`);
    fs.accessSync(existingParent, fs.constants.W_OK);
    normalized[requirement.id] = resolved;
  }
  return normalized;
}

export function storageAwareForServer(server: { ip?: string }, configuredServerUuid?: string, selectedServerUuid?: string) {
  if (configuredServerUuid && selectedServerUuid) return configuredServerUuid === selectedServerUuid;
  return ['127.0.0.1', 'localhost', '::1', 'host.docker.internal'].includes(String(server.ip || '').toLowerCase());
}
