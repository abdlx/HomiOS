export type CatalogApp = {
  id: string; name: string; category: string; description: string; verified: boolean; source?: 'homios' | 'coolify';
  icon: string; tags?: string[]; documentation?: string; port?: string; screenshots?: string[]; version?: string;
  requirements?: { recommendedRamMb?: number }; storage: Array<{ id: string; label: string; required: boolean; protectable: boolean }>;
};
export type Integration = { appStoreState: string; connected: boolean; authenticated: boolean; reachable: boolean; mode: string; baseUrl: string | null; storageAware: boolean };
export type StorageMount = { id: string; name: string; path: string; readOnly: boolean };
export type DomainRoute = { name: string; url: string };
export type AppActionState = { state: string; pending: boolean; error?: string; action?: string };
export function searchCatalog(apps: CatalogApp[], category: string, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  return apps.filter(app => (['All Apps', 'Discover'].includes(category) || category === 'HomiOS Verified' && app.verified || app.category === category) && `${app.name} ${app.category} ${app.description} ${(app.tags || []).join(' ')}`.toLocaleLowerCase().includes(normalized)).sort((a, b) => a.name.localeCompare(b.name));
}
