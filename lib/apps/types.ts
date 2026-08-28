export type AppStatus =
  | 'installing' | 'running' | 'stopped' | 'deploying' | 'unhealthy'
  | 'missing' | 'error' | 'unknown';
export type AppRuntimeStatus = AppStatus;

export type CoolifyMode = 'managed' | 'external' | 'disabled';
export type AppStoreState = 'available' | 'needs_connection' | 'needs_coolify' | 'coolify_offline' | 'unsupported';

export interface AppStorageRequirement {
  id: string;
  label: string;
  required: boolean;
  protectable: boolean;
}

export interface AppTemplate {
  schemaVersion: number;
  id: string;
  name: string;
  provider: 'coolify';
  providerType: string;
  category: string;
  description: string;
  verified: boolean;
  icon: string;
  requirements?: { recommendedRamMb?: number };
  storage: AppStorageRequirement[];
  desktop: { enabled: boolean; openMode: 'external-url' };
}

export interface InstallOptions {
  storage?: Record<string, string>;
  serverUuid?: string;
  destinationUuid?: string;
}

export interface RuntimeApp {
  id: string;
  name: string;
  status: AppStatus;
  primaryUrl: string | null;
  raw?: unknown;
}

export interface AppLog { timestamp?: string; message: string }

export interface ProviderConnectionStatus {
  connected: boolean;
  reachable: boolean;
  authenticated: boolean;
  reason?: 'network_failure' | 'authentication_required' | 'insufficient_permissions' | 'api_unavailable' | 'not_configured';
}

export interface ProviderCapabilities {
  serviceInstall: boolean;
  serviceDelete: boolean;
  logs: boolean;
  envManagement: boolean;
  deployment: boolean;
}

export interface ManagedApp extends RuntimeApp {
  catalogId: string;
  provider: 'coolify';
  providerResourceUuid: string;
  providerProjectUuid: string;
  providerEnvironmentUuid: string;
  providerServerUuid: string;
  storage: Record<string, string>;
  managedByHomiOS: boolean;
  metadataVersion: number;
  installedAt: string;
  updatedAt: string;
}
