import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { HomiOSClient, normalizeBaseUrl, probeInstance, loginToInstance, LoginResult } from '@/api/HomiOSClient';
import { InstanceConfig, HomiOSMe } from '@/types';
import {
  createInstance,
  getActiveInstanceId,
  getToken,
  loadInstances,
  removeToken,
  saveInstances,
  setActiveInstanceId,
  setToken,
} from '@/storage/instances';

type LoginParams = {
  baseUrl: string;
  email: string;
  password: string;
  totp?: string;
  name?: string;
};

type InstanceContextValue = {
  instances: InstanceConfig[];
  activeInstance: InstanceConfig | null;
  activeToken: string | null;
  client: HomiOSClient | null;
  loading: boolean;
  isAuthenticated: boolean;
  probeServer(url: string): Promise<{ ok: boolean; normalizedUrl: string; status: string }>;
  loginAndConnect(params: LoginParams): Promise<LoginResult & { me?: HomiOSMe }>;
  addManualInstance(input: { name: string; baseUrl: string; token: string }): Promise<HomiOSMe>;
  addInstance(input: { name: string; baseUrl: string; token: string }): Promise<HomiOSMe>;
  logout(): Promise<void>;
  removeInstance(id: string): Promise<void>;
  switchInstance(id: string): Promise<void>;
  updateLastPath(path: string): Promise<void>;
  refresh(): Promise<void>;
};

const InstanceContext = createContext<InstanceContextValue | null>(null);

export function InstanceProvider({ children }: { children: React.ReactNode }) {
  const [instances, setInstances] = useState<InstanceConfig[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeToken, setActiveTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const activeInstance = useMemo(
    () => instances.find((instance) => instance.id === activeId) || null,
    [activeId, instances]
  );

  const client = useMemo(() => {
    if (!activeInstance || !activeToken) return null;
    return new HomiOSClient(activeInstance.baseUrl, activeToken);
  }, [activeInstance, activeToken]);

  const isAuthenticated = Boolean(activeInstance && activeToken && client);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const nextInstances = await loadInstances();
      const storedActiveId = await getActiveInstanceId();
      const nextActive = nextInstances.find((instance) => instance.id === storedActiveId) || nextInstances[0] || null;
      setInstances(nextInstances);
      setActiveId(nextActive?.id || null);
      setActiveTokenState(nextActive ? await getToken(nextActive.id) : null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const probeServer = useCallback(async (url: string) => {
    return probeInstance(url);
  }, []);

  const loginAndConnect = useCallback(async (params: LoginParams): Promise<LoginResult & { me?: HomiOSMe }> => {
    const probe = await probeInstance(params.baseUrl);
    const baseUrl = probe.normalizedUrl;

    const loginRes = await loginToInstance(baseUrl, params.email, params.password, params.totp);
    if (!loginRes.ok) {
      return loginRes;
    }

    const { token } = loginRes;
    const tempClient = new HomiOSClient(baseUrl, token);
    const me = await tempClient.me().catch(() => ({
      server: { name: 'HomiOS', version: '1.0' },
      user: { id: 1, email: params.email, role: 'admin', teamId: 'default', abilities: ['read', 'write'], via: 'token' as const }
    }));

    const instanceName = params.name || me.server.name || 'HomiOS';
    const instance = createInstance({
      name: `${instanceName} (${params.email})`,
      baseUrl,
      userEmail: params.email,
    });

    const nextInstances = [instance, ...instances.filter((i) => i.baseUrl !== baseUrl)];
    await setToken(instance.id, token);
    await saveInstances(nextInstances);
    await setActiveInstanceId(instance.id);

    setInstances(nextInstances);
    setActiveId(instance.id);
    setActiveTokenState(token);

    return { ok: true, token, me };
  }, [instances]);

  const addManualInstance = useCallback(async (input: { name: string; baseUrl: string; token: string }) => {
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const temporaryClient = new HomiOSClient(baseUrl, input.token);
    const me = await temporaryClient.validate();
    const instance = createInstance({
      name: input.name || `${me.server.name} (${me.user.email})`,
      baseUrl,
      userEmail: me.user.email,
    });
    const nextInstances = [instance, ...instances];
    await setToken(instance.id, input.token);
    await saveInstances(nextInstances);
    await setActiveInstanceId(instance.id);
    setInstances(nextInstances);
    setActiveId(instance.id);
    setActiveTokenState(input.token);
    return me;
  }, [instances]);

  const switchInstance = useCallback(async (id: string) => {
    setActiveId(id);
    await setActiveInstanceId(id);
    setActiveTokenState(await getToken(id));
  }, []);

  const logout = useCallback(async () => {
    if (activeId) {
      await removeToken(activeId);
    }
    const nextInstances = instances.filter((i) => i.id !== activeId);
    await saveInstances(nextInstances);
    await setActiveInstanceId(null);
    setInstances(nextInstances);
    setActiveId(null);
    setActiveTokenState(null);
  }, [activeId, instances]);

  const removeInstance = useCallback(async (id: string) => {
    const nextInstances = instances.filter((instance) => instance.id !== id);
    await removeToken(id);
    await saveInstances(nextInstances);
    const nextActive = activeId === id ? nextInstances[0]?.id || null : activeId;
    await setActiveInstanceId(nextActive);
    setInstances(nextInstances);
    setActiveId(nextActive);
    setActiveTokenState(nextActive ? await getToken(nextActive) : null);
  }, [activeId, instances]);

  const updateLastPath = useCallback(async (path: string) => {
    if (!activeInstance) return;
    const now = new Date().toISOString();
    const nextInstances = instances.map((instance) =>
      instance.id === activeInstance.id ? { ...instance, lastPath: path, updatedAt: now } : instance
    );
    setInstances(nextInstances);
    await saveInstances(nextInstances);
  }, [activeInstance, instances]);

  const value = useMemo<InstanceContextValue>(() => ({
    instances,
    activeInstance,
    activeToken,
    client,
    loading,
    isAuthenticated,
    probeServer,
    loginAndConnect,
    addManualInstance,
    addInstance: addManualInstance,
    logout,
    removeInstance,
    switchInstance,
    updateLastPath,
    refresh,
  }), [
    activeInstance,
    activeToken,
    client,
    instances,
    isAuthenticated,
    loading,
    loginAndConnect,
    addManualInstance,
    logout,
    probeServer,
    refresh,
    removeInstance,
    switchInstance,
    updateLastPath,
  ]);

  return <InstanceContext.Provider value={value}>{children}</InstanceContext.Provider>;
}

export function useInstances() {
  const value = useContext(InstanceContext);
  if (!value) throw new Error('useInstances must be used within InstanceProvider');
  return value;
}
