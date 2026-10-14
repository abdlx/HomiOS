import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/api-client';

export type CapabilityState = 'available' | 'disabled' | 'running' | 'degraded' | 'unavailable';

export interface Capability {
  id: string;
  name: string;
  configured: boolean;
  installed: boolean;
  running: boolean;
  state: CapabilityState;
  url?: string;
  port?: number;
  reason?: string;
  mode?: 'disabled' | 'managed' | 'external';
  connected?: boolean;
  appStoreAvailable?: boolean;
  ownership?: 'homios' | 'external';
}

export interface CapabilitiesMap {
  storage: Capability;
  samba: Capability;
  backups: Capability;
  terminal: Capability;
  coolify: Capability;
  immich: Capability;
  codex: Capability;
  codeServer: Capability;
}

const DEFAULT_CAPABILITIES: CapabilitiesMap = {
  storage: { id: 'storage', name: 'Storage', configured: true, installed: true, running: true, state: 'running' },
  samba: { id: 'samba', name: 'Samba Sharing', configured: true, installed: true, running: true, state: 'running' },
  backups: { id: 'backups', name: 'Local Protection', configured: true, installed: true, running: true, state: 'running' },
  terminal: { id: 'terminal', name: 'Terminal', configured: true, installed: true, running: true, state: 'running' },
  coolify: { id: 'coolify', name: 'Coolify', configured: false, installed: false, running: false, state: 'disabled' },
  immich: { id: 'immich', name: 'Immich', configured: false, installed: false, running: false, state: 'disabled' },
  codex: { id: 'codex', name: 'Codex', configured: false, installed: false, running: false, state: 'disabled' },
  codeServer: { id: 'codeServer', name: 'Code Server', configured: false, installed: false, running: false, state: 'disabled' },
};

export function useCapabilities() {
  const query = useQuery<{ capabilities?: CapabilitiesMap }, Error>({ queryKey: ['api', '/api/integrations/status'], queryFn: ({ signal }) => apiRequest('/api/integrations/status', { signal }), refetchInterval: 30000, refetchIntervalInBackground: false });
  const capabilities = query.data?.capabilities || DEFAULT_CAPABILITIES;
  const isEnabled = useCallback((id: keyof CapabilitiesMap) => !!capabilities[id] && capabilities[id].state !== 'disabled', [capabilities]);
  const isRunning = useCallback((id: keyof CapabilitiesMap) => capabilities[id]?.state === 'running', [capabilities]);
  return { capabilities, loading: query.isPending, error: query.error?.message, isEnabled, isRunning, refresh: query.refetch };
}
