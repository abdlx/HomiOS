import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { InstanceConfig } from '@/types';

const INSTANCES_KEY = 'homios.instances.v1';
const ACTIVE_INSTANCE_KEY = 'homios.activeInstance.v1';
const tokenKey = (id: string) => `homios.token.${id}`;

export async function loadInstances() {
  const raw = await AsyncStorage.getItem(INSTANCES_KEY);
  return raw ? (JSON.parse(raw) as InstanceConfig[]) : [];
}

export async function saveInstances(instances: InstanceConfig[]) {
  await AsyncStorage.setItem(INSTANCES_KEY, JSON.stringify(instances));
}

export async function getActiveInstanceId() {
  return AsyncStorage.getItem(ACTIVE_INSTANCE_KEY);
}

export async function setActiveInstanceId(id: string | null) {
  if (!id) await AsyncStorage.removeItem(ACTIVE_INSTANCE_KEY);
  else await AsyncStorage.setItem(ACTIVE_INSTANCE_KEY, id);
}

export async function getToken(id: string) {
  return SecureStore.getItemAsync(tokenKey(id));
}

export async function setToken(id: string, token: string) {
  await SecureStore.setItemAsync(tokenKey(id), token);
}

export async function removeToken(id: string) {
  await SecureStore.deleteItemAsync(tokenKey(id));
}

export function createInstance(input: { name: string; baseUrl: string }) {
  const now = new Date().toISOString();
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: input.name.trim(),
    baseUrl: input.baseUrl,
    lastPath: '/',
    createdAt: now,
    updatedAt: now,
  } satisfies InstanceConfig;
}
