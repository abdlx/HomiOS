export type ApiRateLimitPreset = { bucket: string; windowMs: number; max: number };

// Longest prefix wins, so specific App Store reads never share the much smaller
// lifecycle-action bucket. In particular, loading app artwork must not prevent a
// catalog refresh or reconciliation request from reaching the API.
const presets = [
  { prefix: '/api/auth/login', bucket: 'auth-login', windowMs: 5 * 60_000, max: 10 },
  { prefix: '/api/auth/setup', bucket: 'auth-setup', windowMs: 10 * 60_000, max: 5 },
  { prefix: '/api/auth/register', bucket: 'auth-register', windowMs: 10 * 60_000, max: 10 },
  { prefix: '/api/upload', bucket: 'upload', windowMs: 60_000, max: 30 },
  { prefix: '/api/search', bucket: 'search', windowMs: 60_000, max: 120 },
  { prefix: '/api/thumbnails', bucket: 'thumbnails', windowMs: 60_000, max: 180 },
  { prefix: '/api/jobs', bucket: 'jobs', windowMs: 60_000, max: 120 },
  { prefix: '/api/apps/install', bucket: 'app-install', windowMs: 60_000, max: 10 },
  { prefix: '/api/apps/reconcile', bucket: 'app-reconcile', windowMs: 60_000, max: 12 },
  { prefix: '/api/apps/catalog', bucket: 'app-catalog', windowMs: 60_000, max: 60 },
  { prefix: '/api/apps/installed', bucket: 'app-installed', windowMs: 60_000, max: 120 },
  { prefix: '/api/apps/', bucket: 'app-lifecycle', windowMs: 60_000, max: 30 },
  { prefix: '/api/integrations/coolify/connect', bucket: 'coolify-connect', windowMs: 5 * 60_000, max: 10 },
  { prefix: '/api', bucket: 'api', windowMs: 60_000, max: 600 },
].sort((a, b) => b.prefix.length - a.prefix.length);

export function apiRateLimitPreset(path: string): ApiRateLimitPreset | undefined {
  if (/^\/api\/apps\/[^/]+\/icon$/.test(path)) return { bucket: 'app-icons', windowMs: 60_000, max: 600 };
  if (/^\/api\/apps\/[^/]+\/deploy$/.test(path)) return { bucket: 'app-deploy', windowMs: 60_000, max: 20 };
  return presets.find((preset) => path.startsWith(preset.prefix));
}
