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
  /** TUS upload instance for pause/resume support */
  tusUpload?: any;
  /** Bytes transferred so far */
  bytesUploaded?: number;
  /** Total bytes */
  bytesTotal?: number;
}

export interface DriveItem {
  label: string;
  path: string;
  name: string;
  isMounted: boolean;
  /** e.g. "120G" */
  size?: string;
  /** Filesystem type, e.g. "ext4" */
  fstype?: string;
  /** 0–100 usage percentage (populated when available) */
  usagePercent?: number;
  usedBytes?: string;
  totalBytes?: string;
}

export type JobType =
  | 'index.files'
  | 'index.photos'
  | 'thumbnail.generate'
  | 'backup.run'
  | 'backup.restore'
  | 'ocr.run'
  | 'zip.create'
  | 'file.move';

export type JobStatus = 'queued' | 'running' | 'paused' | 'cancelled' | 'failed' | 'completed';
export type JobResourceClass = 'cpu' | 'io' | 'media' | 'backup';
export type ResourceProfile = 'beautiful' | 'balanced' | 'server_saver';
export type ThumbnailVariant = 'grid' | 'preview';

export interface Job {
  id: string;
  type: JobType;
  status: JobStatus;
  resourceClass: JobResourceClass;
  progress: number;
  name: string;
  payload?: any;
  result?: any;
  error?: string;
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
  kind: 'file' | 'folder' | 'note' | 'media';
  name: string;
  path?: string;
  snippet?: string;
  score?: number;
  modified?: string;
}

export interface BackupPlan {
  id: string;
  name: string;
  sourcePath: string;
  destinationType: 'local' | 's3';
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
