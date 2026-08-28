import type { AppRuntimeProvider } from './provider.ts';
import type {
  AppDomainRoute, AppLog, AppRuntimeStatus, AppTemplate, InstallOptions, ProviderCapabilities,
  ProviderConnectionStatus, RuntimeApp,
} from '../types.ts';

export class CoolifyApiError extends Error {
  constructor(message: string, public status: number, public body?: unknown) { super(message); }
}

export function normalizeCoolifyBaseUrl(input: string) {
  let parsed: URL;
  try { parsed = new URL(input.trim()); } catch { throw new Error('Enter a valid Coolify URL'); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Coolify URL must use http or https');
  if (parsed.username || parsed.password) throw new Error('Coolify URL must not contain credentials');
  if (parsed.search || parsed.hash) throw new Error('Coolify URL must not contain a query or fragment');
  parsed.pathname = parsed.pathname.replace(/\/+$/, '').replace(/\/api\/v1$/i, '') || '/';
  return parsed.toString().replace(/\/$/, '');
}

export class CoolifyClient {
  readonly baseUrl: string;
  constructor(baseUrl: string, private token: string, private fetchImpl: typeof fetch = fetch) {
    this.baseUrl = normalizeCoolifyBaseUrl(baseUrl);
    if (!token?.trim()) throw new Error('Coolify API token is required');
  }

  async request<T = any>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/v1${endpoint}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${this.token}`,
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...init.headers,
        },
      });
      const text = await response.text();
      let body: any = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      if (!response.ok) {
        throw new CoolifyApiError(body?.message || `Coolify API returned ${response.status}`, response.status, body);
      }
      return body as T;
    } catch (error: any) {
      if (error?.name === 'AbortError') throw new Error('Coolify request timed out');
      throw error;
    } finally { clearTimeout(timer); }
  }

  listProjects = () => this.request<any[]>('/projects');
  createProject = (name: string, description = '') => this.request<{ uuid: string }>('/projects', { method: 'POST', body: JSON.stringify({ name, description }) });
  getProject = (uuid: string) => this.request<any>(`/projects/${encodeURIComponent(uuid)}`);
  getEnvironment = (projectUuid: string, nameOrUuid: string) => this.request<any>(`/projects/${encodeURIComponent(projectUuid)}/${encodeURIComponent(nameOrUuid)}`);
  createEnvironment = (projectUuid: string, name: string) => this.request<any>(`/projects/${encodeURIComponent(projectUuid)}/environments`, { method: 'POST', body: JSON.stringify({ name }) });
  listServers = () => this.request<any[]>('/servers');
  listServices = () => this.request<any[]>('/services');
  createService = (input: Record<string, any>) => this.request<{ uuid: string; domains?: string[] }>('/services', { method: 'POST', body: JSON.stringify(input) });
  getService = (uuid: string) => this.request<any>(`/services/${encodeURIComponent(uuid)}`);
  updateService = (uuid: string, input: Record<string, any>) => this.request<any>(`/services/${encodeURIComponent(uuid)}`, { method: 'PATCH', body: JSON.stringify(input) });
  deploy = (uuid: string) => this.request<any>('/deploy', { method: 'POST', body: JSON.stringify({ uuid }) });
  deleteService = (uuid: string) => this.request<any>(`/services/${encodeURIComponent(uuid)}?delete_configurations=true&delete_volumes=false&docker_cleanup=false&delete_connected_networks=true`, { method: 'DELETE' });
  startService = (uuid: string) => this.request<any>(`/services/${encodeURIComponent(uuid)}/start`, { method: 'POST' });
  stopService = (uuid: string) => this.request<any>(`/services/${encodeURIComponent(uuid)}/stop`, { method: 'POST' });
  restartService = (uuid: string) => this.request<any>(`/services/${encodeURIComponent(uuid)}/restart`, { method: 'POST' });
  getLogs = (uuid: string, subServiceName: string, lines = 100) => this.request<{ logs: string }>(`/services/${encodeURIComponent(uuid)}/logs?sub_service_name=${encodeURIComponent(subServiceName)}&lines=${Math.min(1000, Math.max(1, lines))}&show_timestamps=true`);
  listTeams = () => this.request<any[]>('/teams');
  getCurrentTeam = () => this.request<any>('/teams/current');
  listDestinations = async () => {
    try { return await this.request<any[]>('/destinations'); }
    catch (error) {
      // Destination inventory was added after the initial v4 API. Older v4
      // installations can still create services when a server has one default
      // destination, so absence of this endpoint is a supported capability gap.
      if (error instanceof CoolifyApiError && error.status === 404) return [];
      throw error;
    }
  };
  getVersion = async () => {
    try { return await this.request<any>('/version'); } catch (error) {
      if (error instanceof CoolifyApiError && error.status === 404) return null;
      throw error;
    }
  };
}

function normalizedStatus(raw: any): AppRuntimeStatus {
  const status = String(raw?.status || raw?.state || '').toLowerCase();
  if (status.includes('running') || status.includes('healthy')) return 'running';
  if (status.includes('stop') || status.includes('exit')) return 'stopped';
  if (status.includes('deploy') || status.includes('progress')) return 'deploying';
  if (status.includes('unhealthy')) return 'unhealthy';
  if (status.includes('error') || status.includes('fail')) return 'error';
  return 'unknown';
}

function domainsOf(service: any): string[] {
  const values = [service?.domains, service?.fqdn, ...(service?.applications || []).flatMap((app: any) => [app?.fqdn, app?.domains])].flat(Infinity);
  return values.flatMap((value: any) => String(value || '').split(',')).map((value: string) => value.trim()).filter((value: string) => /^https?:\/\//.test(value));
}

export interface CoolifyProviderConfig {
  projectUuid: string;
  environmentUuid: string;
  serverUuid: string;
  destinationUuid?: string;
}

export class CoolifyProvider implements AppRuntimeProvider {
  readonly capabilities: ProviderCapabilities = { serviceInstall: true, serviceDelete: true, logs: true, envManagement: true, deployment: true };
  constructor(readonly client: CoolifyClient, readonly config: CoolifyProviderConfig) {}

  async getConnectionStatus(): Promise<ProviderConnectionStatus> {
    try {
      await this.client.listProjects();
      return { connected: true, reachable: true, authenticated: true };
    } catch (error: any) {
      if (error instanceof CoolifyApiError && error.status === 401) return { connected: true, reachable: true, authenticated: false, reason: 'authentication_required' };
      if (error instanceof CoolifyApiError && error.status === 403) return { connected: true, reachable: true, authenticated: true, reason: 'insufficient_permissions' };
      return { connected: true, reachable: false, authenticated: false, reason: 'network_failure' };
    }
  }
  async initialize() {
    await this.client.getProject(this.config.projectUuid);
    await this.client.getEnvironment(this.config.projectUuid, this.config.environmentUuid);
  }
  async listInstalledApps() { return (await this.client.listServices()).map((item) => this.toRuntime(item)); }
  async getApp(id: string) { return this.toRuntime(await this.client.getService(id)); }
  async installApp(template: AppTemplate, options: InstallOptions): Promise<RuntimeApp> {
    const created = await this.client.createService({
      type: template.providerType,
      name: `homios-${template.id}`,
      description: `${template.name} — managed by HomiOS`,
      project_uuid: this.config.projectUuid,
      environment_uuid: this.config.environmentUuid,
      server_uuid: options.serverUuid || this.config.serverUuid,
      ...(options.destinationUuid || this.config.destinationUuid ? { destination_uuid: options.destinationUuid || this.config.destinationUuid } : {}),
      instant_deploy: false,
    });
    return { id: created.uuid, name: template.name, status: 'installing', primaryUrl: created.domains?.[0] || null, raw: created };
  }
  async startApp(id: string) { await this.client.startService(id); }
  async stopApp(id: string) { await this.client.stopService(id); }
  async restartApp(id: string) { await this.client.restartService(id); }
  async deployApp(id: string) { await this.client.deploy(id); }
  async removeApp(id: string) { await this.client.deleteService(id); }
  async getLogs(id: string): Promise<AppLog[]> {
    const service = await this.client.getService(id);
    const sub = service?.applications?.[0]?.name || service?.databases?.[0]?.name;
    if (!sub) return [];
    const result = await this.client.getLogs(id, sub);
    return String(result.logs || '').split('\n').filter(Boolean).map((message) => ({ message }));
  }
  async getStatus(id: string) { return normalizedStatus(await this.client.getService(id)); }
  async getDomains(id: string): Promise<AppDomainRoute[]> {
    const service = await this.client.getService(id);
    const applications = Array.isArray(service?.applications) ? service.applications : [];
    return applications.flatMap((app: any) => {
      const urls = [app?.fqdn, app?.domains].flatMap((value) => String(value || '').split(',')).map((value) => value.trim()).filter(Boolean);
      return urls.length ? urls.map((url) => ({ name: String(app?.name || app?.uuid || 'web'), url })) : [{ name: String(app?.name || app?.uuid || 'web'), url: '' }];
    });
  }
  async updateDomains(id: string, routes: AppDomainRoute[], force = false): Promise<RuntimeApp> {
    await this.client.updateService(id, { urls: routes.map(({ name, url }) => ({ name, url })), force_domain_override: force });
    return this.getApp(id);
  }
  private toRuntime(item: any): RuntimeApp {
    return { id: item.uuid || item.id, name: item.name || item.uuid, status: normalizedStatus(item), primaryUrl: domainsOf(item)[0] || null, raw: item };
  }
}
