export type InstanceConfig = {
  id: string;
  name: string;
  baseUrl: string;
  lastPath: string;
  createdAt: string;
  updatedAt: string;
};

export type HomiOSMe = {
  server: {
    name: string;
    version: string;
  };
  user: {
    id: number;
    email: string;
    role: string;
    teamId: string;
    abilities: string[];
    via: 'session' | 'token';
  };
};

export type RemoteFile = {
  name: string;
  isDir: boolean;
  size: number;
  modified: string;
  path: string;
};

export type DriveItem = {
  label: string;
  path: string;
  name?: string;
  isMounted?: boolean;
  size?: string;
  fstype?: string;
  usagePercent?: number;
  usedBytes?: string;
  totalBytes?: string;
};

export type SearchResult = {
  id: string;
  kind: 'file' | 'folder' | 'note' | 'media';
  name: string;
  path?: string;
  snippet?: string;
  score?: number;
  modified?: string;
};

export type Transfer = {
  id: string;
  instanceId: string;
  name: string;
  type: 'upload' | 'download' | 'copy' | 'move';
  status: 'running' | 'completed' | 'failed';
  progress: number;
  message?: string;
  retry?: () => Promise<void>;
  createdAt: string;
};
