export type FileType = 'folder' | 'image' | 'video' | 'document' | 'text';

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
  type: 'upload' | 'download';
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
