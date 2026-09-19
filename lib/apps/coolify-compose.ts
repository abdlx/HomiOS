import { dump, load } from 'js-yaml';
import type { AppHostMount } from './types.ts';

const MANAGED_STORAGE_KEY = 'x-homios-managed-storage';

type ComposeRecord = Record<string, any>;

interface ManagedStorageMarker {
  version: 1;
  services: Record<string, string[]>;
}

export interface ComposeStorageResult {
  compose: string;
  serviceName: string;
  added: number;
  removed: number;
  updated: number;
  changed: boolean;
}

function isRecord(value: unknown): value is ComposeRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validMountPath(path: string) {
  return path === '/mnt/homios-storage' || path.startsWith('/mnt/homios-storage/');
}

function volumePair(volume: unknown): { source: string; target: string } | null {
  if (isRecord(volume)) {
    const source = typeof volume.source === 'string' ? volume.source : '';
    const target = typeof volume.target === 'string' ? volume.target : '';
    return source && target ? { source, target } : null;
  }
  if (typeof volume !== 'string') return null;
  const parts = volume.split(':');
  return parts.length >= 2 ? { source: parts[0] || '', target: parts[1] || '' } : null;
}

function exactBind(volume: unknown, path: string) {
  const pair = volumePair(volume);
  return pair?.source === path && pair.target === path;
}

function readMarker(value: unknown): ManagedStorageMarker {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.services)) {
    return { version: 1, services: {} };
  }
  const services: Record<string, string[]> = {};
  for (const [name, paths] of Object.entries(value.services)) {
    if (!Array.isArray(paths)) continue;
    services[name] = paths.filter((path): path is string => typeof path === 'string' && validMountPath(path));
  }
  return { version: 1, services };
}

function arraysEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function configureHomiOSStorageInCompose(
  rawCompose: string,
  preferredServiceName: string,
  mounts: AppHostMount[],
): ComposeStorageResult {
  let compose: unknown;
  try {
    compose = load(rawCompose);
  } catch (error: any) {
    throw new Error(`Coolify returned invalid service Compose YAML: ${error?.message || 'parse failed'}`);
  }
  if (!isRecord(compose) || !isRecord(compose.services)) {
    throw new Error('Coolify service Compose YAML does not contain a services map');
  }

  const serviceNames = Object.keys(compose.services);
  const serviceName = isRecord(compose.services[preferredServiceName])
    ? preferredServiceName
    : serviceNames.length === 1 && isRecord(compose.services[serviceNames[0]])
      ? serviceNames[0]
      : '';
  if (!serviceName) throw new Error(`Could not find Compose service ${preferredServiceName || '(unnamed)'}`);

  const service = compose.services[serviceName] as ComposeRecord;
  if (service.volumes != null && !Array.isArray(service.volumes)) {
    throw new Error(`Compose service ${serviceName} has an unsupported volumes definition`);
  }
  const volumes: unknown[] = Array.isArray(service.volumes) ? [...service.volumes] : [];
  const markerWasPresent = Object.prototype.hasOwnProperty.call(compose, MANAGED_STORAGE_KEY);
  const marker = readMarker(compose[MANAGED_STORAGE_KEY]);
  const previouslyManaged = [...new Set(marker.services[serviceName] || [])];

  const desired = [...new Set(mounts.map((mount) => mount.path))].sort();
  if (desired.some((path) => !validMountPath(path) || path.includes('\0'))) {
    throw new Error('HomiOS storage mounts must stay inside /mnt/homios-storage');
  }
  const desiredSet = new Set(desired);
  const retainedManaged = new Set<string>();
  const managedMatchCounts = new Map(previouslyManaged.map((path) => [
    path,
    volumes.filter((volume) => exactBind(volume, path)).length,
  ]));
  let removed = 0;

  const nextVolumes = volumes.filter((volume) => {
    const managedPath = previouslyManaged.find((path) => exactBind(volume, path));
    if (!managedPath) return true;
    if (desiredSet.has(managedPath)) {
      if (managedMatchCounts.get(managedPath) === 1) retainedManaged.add(managedPath);
      return true;
    }
    // If the same bind appears more than once, ownership is ambiguous. Leave
    // every copy intact and forget the marker rather than removing user data.
    if (managedMatchCounts.get(managedPath) !== 1) return true;
    removed += 1;
    return false;
  });

  let added = 0;
  for (const mount of mounts) {
    if (!desiredSet.has(mount.path) || nextVolumes.some((volume) => exactBind(volume, mount.path))) continue;
    nextVolumes.push({
      type: 'bind',
      source: mount.path,
      target: mount.path,
      read_only: mount.readOnly,
      ...(mount.path === '/mnt/homios-storage' ? { bind: { propagation: 'rslave' } } : {}),
    });
    retainedManaged.add(mount.path);
    added += 1;
  }

  let updated = 0;
  if (desiredSet.has('/mnt/homios-storage') && previouslyManaged.includes('/mnt/homios-storage')) {
    const rootIndex = nextVolumes.findIndex((volume) => exactBind(volume, '/mnt/homios-storage'));
    const rootVolume = rootIndex >= 0 ? nextVolumes[rootIndex] : null;
    if (isRecord(rootVolume) && rootVolume?.bind?.propagation !== 'rslave') {
      nextVolumes[rootIndex] = {
        ...rootVolume,
        bind: {
          ...(isRecord(rootVolume.bind) ? rootVolume.bind : {}),
          propagation: 'rslave',
        },
      };
      updated += 1;
    }
  }

  const nextManagedPaths = [...retainedManaged].sort();
  const previousMarkerPaths = [...previouslyManaged].sort();
  const markerChanged = !arraysEqual(previousMarkerPaths, nextManagedPaths);
  const changed = added > 0 || removed > 0 || updated > 0 || markerChanged;
  if (!changed) return { compose: rawCompose, serviceName, added, removed, updated, changed: false };

  service.volumes = nextVolumes;
  if (nextManagedPaths.length) marker.services[serviceName] = nextManagedPaths;
  else delete marker.services[serviceName];
  if (Object.keys(marker.services).length) compose[MANAGED_STORAGE_KEY] = marker;
  else if (markerWasPresent) delete compose[MANAGED_STORAGE_KEY];

  return {
    compose: dump(compose, { noRefs: true, lineWidth: -1, sortKeys: false }),
    serviceName,
    added,
    removed,
    updated,
    changed: true,
  };
}
