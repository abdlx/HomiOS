export type FileType = 'folder' | 'image' | 'document' | 'text';

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
}

export type ViewMode = 'grid' | 'list' | 'column' | 'gallery';

export interface WallpaperOption {
  id: string;
  name: string;
  class: string;
  previewColor: string;
}
