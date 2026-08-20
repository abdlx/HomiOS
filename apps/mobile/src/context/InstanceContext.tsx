import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { HomiOSClient, normalizeBaseUrl } from '@/api/HomiOSClient';
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

type InstanceContextValue = {
  instances: InstanceConfig[];
  activeInstance: InstanceConfig | null;
  activeToken: string | null;
  client: HomiOSClient | null;
  loading: boolean;
  addInstance(input: { name: string; baseUrl: string; token: string }): Promise<HomiOSMe>;
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
    () => instances.find((instance) => instance.id === activeId) || instances[0] || null,
    [activeId, instances]
  );

  const client = useMemo(() => {
    if (!activeInstance || !activeToken) return null;
    return new HomiOSClient(activeInstance.baseUrl, activeToken);
  }, [activeInstance, activeToken]);

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

  const switchInstance = useCallback(async (id: string) => {
    setActiveId(id);
    await setActiveInstanceId(id);
    setActiveTokenState(await getToken(id));
  }, []);

  const addInstance = useCallback(async (input: { name: string; baseUrl: string; token: string }) => {
    const baseUrl = normalizeBaseUrl(input.baseUrl);
    const temporaryClient = new HomiOSClient(baseUrl, input.token);
    const me = await temporaryClient.validate();
    const instance = createInstance({
      name: input.name || `${me.server.name} (${me.user.email})`,
      baseUrl,
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
    addInstance,
    removeInstance,
    switchInstance,
    updateLastPath,
    refresh,
  }), [activeInstance, activeToken, addInstance, client, instances, loading, refresh, removeInstance, switchInstance, updateLastPath]);

  return <InstanceContext.Provider value={value}>{children}</InstanceContext.Provider>;
}

export function useInstances() {
  const value = useContext(InstanceContext);
  if (!value) throw new Error('useInstances must be used within InstanceProvider');
  return value;
}
