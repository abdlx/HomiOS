import { useEffect, useState } from 'react';

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
  codeServer: { id: 'codeServer', name: 'VS Code', configured: false, installed: false, running: false, state: 'disabled' },
};

export function useCapabilities() {
  const [capabilities, setCapabilities] = useState<CapabilitiesMap>(DEFAULT_CAPABILITIES);
  const [loading, setLoading] = useState(true);

  const fetchCapabilities = async () => {
    try {
      const res = await fetch('/api/integrations/status', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data.capabilities) {
          setCapabilities(data.capabilities);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch capabilities', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCapabilities();
    const interval = setInterval(fetchCapabilities, 30_000);
    return () => clearInterval(interval);
  }, []);

  const isEnabled = (id: keyof CapabilitiesMap) => {
    const cap = capabilities[id];
    return cap && cap.state !== 'disabled';
  };

  const isRunning = (id: keyof CapabilitiesMap) => {
    const cap = capabilities[id];
    return cap && cap.state === 'running';
  };

  return {
    capabilities,
    loading,
    isEnabled,
    isRunning,
    refresh: fetchCapabilities,
  };
}
