export type FileType = 'folder' | 'image' | 'video' | 'pdf' | 'document' | 'text';

export interface FileItem {
  id: string;
  name: string;
  type: FileType;
  size: string;
  updatedAt: string;
  thumbnailUrl?: string;
  folderColor?: 'blue' | 'orange' | 'green' | 'purple' | 'red';
  hasStatusDot?: boolean;
  statusDotColor?: string;
  tags?: string[];
  content?: string;
  isCustomUrl?: boolean;
  isFavorite?: boolean;
  isShared?: boolean;
  folderPath?: string;
  folderName?: string;
  itemCount?: number | null;
  mediaCount?: number;
  imageCount?: number;
  videoCount?: number;
}

export interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  children: string[]; // List of file and folder IDs in this folder
}

export interface SidebarItem {
  id: string;
  label: string;
  icon: string;
  isFavorite?: boolean;
  isTag?: boolean;
  tagColor?: string;
  badge?: string;
  path?: string;
}

export type ViewMode = 'grid' | 'list' | 'column' | 'gallery';

export interface WallpaperOption {
  id: string;
  name: string;
  class: string;
  previewColor: string;
}

export interface TransferTask {
  id: string;
  name: string;
  progress: number; // 0 to 100
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  type: 'upload' | 'download' | 'move' | 'copy';
  description?: string;
  sourcePath?: string;
  destinationPath?: string;
  cancellable?: boolean;
  retryable?: boolean;
  error?: string;
  controller?: AbortController;
  retry?: () => Promise<unknown> | unknown;
  /** Durable server-side job backing this task. */
  serverJobId?: string;
  /** TUS upload instance for pause/resume support */
  tusUpload?: any;
  /** Bytes transferred so far */
  bytesUploaded?: number;
  /** Total bytes */
  bytesTotal?: number;
}

export type ProtectionMode = 'mirror' | 'backup' | 'versioned';
export type ProtectionHealth = 'healthy' | 'at_risk' | 'degraded' | 'unprotected';
export type JobLifecyclePhase = 'scanning' | 'comparing' | 'copying' | 'verifying' | 'finalizing' | 'completed' | 'failed';

export interface DriveItem {
  label: string;
  path: string;
  name: string;
  isMounted: boolean;
  /** Persistent filesystem UUID (e.g. 550e8400-e29b-41d4-a716-446655440000 or FAT serial) */
  uuid?: string;
  /** Persistent partition UUID (PARTUUID) */
  partUuid?: string;
  /** e.g. "120G" */
  size?: string;
  /** Filesystem type, e.g. "ext4" */
  fstype?: string;
  /** 0–100 usage percentage (populated when available) */
  usagePercent?: number;
  usedBytes?: string;
  totalBytes?: string;
  freeBytes?: string;
  usedBytesNumber?: number;
  totalBytesNumber?: number;
  freeBytesNumber?: number;
  /** Root, /boot, /boot/efi or the Windows system drive */
  isSystem?: boolean;
  /** USB / hotplug / removable media */
  isRemovable?: boolean;
  isReadOnly?: boolean;
  /** Hardware model reported by the device, e.g. "Samsung SSD 980" */
  model?: string;
  /** User-set HomiOS display name, if any (overrides label). */
  nickname?: string;
  /** The label before any nickname was applied — used to offer a reset. */
  defaultLabel?: string;

  /** Tri-State Introspection */
  /** Available through Samba (SMB) */
  isShared?: boolean;
  shareNames?: string[];
  /** Covered by an active backup or mirror sync policy */
  isProtected?: boolean;
  protectionPlanId?: string;
  protectionPlanName?: string;
  protectionMode?: ProtectionMode;
  protectionHealth?: ProtectionHealth;
  lastBackupAt?: string | null;
  lastBackupStatus?: string | null;
}

export type JobType =
  | 'index.files'
  | 'index.photos'
  | 'thumbnail.generate'
  | 'backup.run'
  | 'backup.restore'
  | 'sync.run'
  | 'ocr.run'
  | 'zip.create'
  | 'file.move'
  | 'file.copy'
  | 'app.install';

export type JobStatus = 'queued' | 'running' | 'paused' | 'cancelled' | 'failed' | 'completed';
export type JobResourceClass = 'cpu' | 'io' | 'media' | 'backup';
export type ResourceProfile = 'beautiful' | 'balanced' | 'server_saver';
export type ThumbnailVariant = 'grid' | 'preview';

export interface JobProgressData {
  stage?: string;
  appId?: string;
  phase?: JobLifecyclePhase;
  phaseMessage?: string;
  bytesTransferred?: number;
  bytesTotal?: number;
  filesTransferred?: number;
  filesTotal?: number;
  speedBps?: number;
  etaSeconds?: number;
  currentFile?: string;
}

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  resourceClass: JobResourceClass;
  progress: number;
  name: string;
  payload?: any;
  result?: any;
  progressData?: JobProgressData;
  error?: string;
  priority?: number;
  attempts?: number;
  maxAttempts?: number;
  runAt?: string;
  updatedAt?: string;
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
}

export interface JobEvent {
  id: number;
  jobId: string;
  type: string;
  message: string;
  data?: any;
  createdAt: string;
}

export interface SearchResult {
  id: string;
  kind: 'file' | 'folder' | 'note' | 'media' | 'application';
  name: string;
  path?: string;
  snippet?: string;
  score?: number;
  modified?: string;
}

export type SyncSchedule = 'manual' | 'hourly' | 'six_hourly' | 'daily' | 'weekly';

export interface SyncPlan {
  id: string;
  name: string;
  sources: string[];
  destinations: string[];
  sourceUuids?: string[];
  destinationUuids?: string[];
  mode: ProtectionMode;
  mirrorDeletes?: boolean;
  retentionDays?: number;
  schedule: SyncSchedule;
  enabled: boolean;
  lastRunAt: string | null;
  lastStatus: string | null;
  running?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface BackupPlan {
  id: string;
  name: string;
  sourcePath: string;
  destinationType: 'local' | 's3' | 'cloud';
  destination: string;
  schedule?: string;
  enabled: boolean;
}

export interface BackupRun {
  id: string;
  planId?: string;
  status: JobStatus;
  sourcePath: string;
  destination: string;
  bytesTotal?: number;
  bytesCopied?: number;
  createdAt: string;
  finishedAt?: string;
}

export interface NotificationItem {
  id: number;
  teamId?: string;
  userId?: number;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  sourceType?: string;
  sourceId?: string;
  readAt?: string;
  createdAt: string;
}
