export const MIN_SUPPORTED_COOLIFY_MAJOR = 4;

export function isSupportedCoolifyVersion(version?: string | null) {
  if (!version) return true;
  const match = version.match(/(?:v)?(\d+)/i);
  return !match || Number(match[1]) === MIN_SUPPORTED_COOLIFY_MAJOR;
}
