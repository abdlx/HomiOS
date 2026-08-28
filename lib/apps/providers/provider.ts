import type { AppLog, AppRuntimeStatus, AppTemplate, InstallOptions, ProviderConnectionStatus, RuntimeApp } from '../types.ts';

export interface AppRuntimeProvider {
  getConnectionStatus(): Promise<ProviderConnectionStatus>;
  initialize(): Promise<void>;
  listInstalledApps(): Promise<RuntimeApp[]>;
  getApp(id: string): Promise<RuntimeApp>;
  installApp(template: AppTemplate, options: InstallOptions): Promise<RuntimeApp>;
  startApp(id: string): Promise<void>;
  stopApp(id: string): Promise<void>;
  restartApp(id: string): Promise<void>;
  deployApp(id: string): Promise<void>;
  removeApp(id: string): Promise<void>;
  getLogs(id: string): Promise<AppLog[]>;
  getStatus(id: string): Promise<AppRuntimeStatus>;
}
