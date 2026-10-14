export type InstanceConfig = {
  id: string;
  name: string;
  baseUrl: string;
  lastPath: string;
  userEmail?: string;
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
  itemCount?: number | null;
  modified: string;
  path: string;
};

export type DriveItem = {
  label: string;
  path: string;
  name?: string;
  uuid?: string;
  isMounted?: boolean;
  size?: string;
  fstype?: string;
  usagePercent?: number;
  usedBytes?: string;
  totalBytes?: string;
  freeBytes?: string;
  freeBytesNumber?: number;
  totalBytesNumber?: number;
  usedBytesNumber?: number;
  cloud?: boolean;
  accounts?: number;
  model?: string;
};

export type SharedItem = {
  id: number;
  name: string;
  path: string;
  readOnly?: boolean;
  read_only?: number;
  comment?: string;
  users?: string[];
};

export type SharedMediaItem = {
  uri: string;
  name: string;
  type?: string;
  size?: number;
};

export type SearchResult = {
  id: string;
  kind: 'file' | 'folder' | 'note' | 'media' | 'application';
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
