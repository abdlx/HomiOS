import { FileItem, SidebarItem, WallpaperOption } from './types';

// Let's create realistic mock thumbnails that match the visual layout
export const INITIAL_FILES: FileItem[] = [
  {
    id: 'img-1',
    name: 'best-Notebooks-and-tips.jpg',
    type: 'image',
    size: '1.2 MB',
    updatedAt: '2026-06-05',
    thumbnailUrl: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?auto=format&fit=crop&w=300&q=80',
    tags: ['Screenshots'],
    content: 'A detailed snapshot of my favorite notebook setups, layout systems, and bullet journaling tips collected over the past year. Highly useful for workspace productivity!'
  },
  {
    id: 'img-2',
    name: 'finally-started-using-Capabilities.jpg',
    type: 'image',
    size: '840 KB',
    updatedAt: '2026-06-04',
    thumbnailUrl: 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&w=300&q=80',
    tags: ['Screenshots', 'Writing'],
    content: 'Captured from our team interface showcasing the new direct system capabilities schema. It has resolved our prior synchronization bottlenecks beautifully!'
  },
  {
    id: 'img-3',
    name: 'IMG_6077.HEIC',
    type: 'image',
    size: '2.4 MB',
    updatedAt: '2026-05-29',
    thumbnailUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=300&q=80',
    tags: ['Invoice'],
    content: 'Photo of the physical invoice from the local office supply shop where notebooks and keyboards were procured.'
  },
  {
    id: 'img-4',
    name: 'IMG_6078.HEIC',
    type: 'image',
    size: '2.1 MB',
    updatedAt: '2026-05-29',
    thumbnailUrl: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=300&q=80',
    tags: ['Invoice'],
    content: 'A secondary, detailed macro photo focusing on the custom mechanical components of the workspace keyboard setup.'
  },
  {
    id: 'img-5',
    name: 'IMG_6079.HEIC',
    type: 'image',
    size: '2.6 MB',
    updatedAt: '2026-05-28',
    thumbnailUrl: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=300&q=80',
    tags: ['Writing'],
    content: 'Code snippet mock screen showing the custom reactive context selectors used in our UI elements.'
  },
  {
    id: 'img-6',
    name: 'IMG_6080.HEIC',
    type: 'image',
    size: '2.8 MB',
    updatedAt: '2026-05-28',
    thumbnailUrl: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?auto=format&fit=crop&w=300&q=80',
    tags: ['Screenshots'],
    content: 'Workspace setup photo showing the primary workstation alignment on the wood-grained table.'
  },
  {
    id: 'doc-1',
    name: 'Nextcloud.odt',
    type: 'document',
    size: '24 KB',
    updatedAt: '2026-06-07',
    tags: ['Writing'],
    content: '# Nextcloud Integration Sync Log\n\n- Server: alpha.nextcloud.local\n- Port: 443\n- User Agent: macOS Native Finder Plugin\n\nAll tasks and directory structures synced cleanly without exceptions.'
  },
  // Row 2 Folders & Docs
  {
    id: 'folder-1',
    name: 'Galaxy',
    type: 'folder',
    size: '14 items',
    updatedAt: '2026-06-01',
    folderColor: 'blue'
  },
  {
    id: 'folder-2',
    name: 'Notes',
    type: 'folder',
    size: '6 items',
    updatedAt: '2026-06-08',
    folderColor: 'orange',
    hasStatusDot: true,
    statusDotColor: 'orange'
  },
  {
    id: 'folder-3',
    name: 'Photos',
    type: 'folder',
    size: '42 items',
    updatedAt: '2026-05-15',
    folderColor: 'blue'
  },
  {
    id: 'doc-2',
    name: 'Test.odt',
    type: 'document',
    size: '12 KB',
    updatedAt: '2026-06-03',
    content: '# Local Workspace Validation Tests\n\n- Local: PASS\n- Pre-commit Lint checks: PASS\n- Build compilation validation: PASS\n\nAll items are aligned and pristine.'
  }
];

export const SIDEBAR_ITEMS: SidebarItem[] = [
  // Top items (unlabeled)
  { id: 'shared', label: 'Shared', icon: 'Users', isFavorite: false },
  { id: 'recents', label: 'Recents', icon: 'Clock', isFavorite: false },
  
  // Favorites Header starts
  { id: 'setapp', label: 'Setapp', icon: 'Grid', isFavorite: true },
  { id: 'applications', label: 'Applications', icon: 'Compass', isFavorite: true },
  { id: 'onedrive', label: 'OneDrive', icon: 'Cloud', isFavorite: true },
  { id: 'mydrive', label: 'My Drive', icon: 'HardDrive', isFavorite: true },
  { id: 'camera', label: 'Camera', icon: 'Camera', isFavorite: true },
  { id: 'screenshots', label: 'Pixel Screensh...', icon: 'Laptop', isFavorite: true },
  { id: 'downloads', label: 'Downloads', icon: 'Download', isFavorite: true },
  { id: 'nextcloud', label: 'Nextcloud', icon: 'FolderSync', isFavorite: true }, // The active selection
  { id: 'desktop', label: 'Desktop', icon: 'Monitor', isFavorite: true },
  { id: 'documents', label: 'Documents', icon: 'FileText', isFavorite: true },
  
  // Tags Header starts
  { id: 'tag-screenshots', label: 'Screenshots', icon: 'Circle', isTag: true, tagColor: '#3b82f6' }, // Blue
  { id: 'tag-writing', label: 'Writing', icon: 'Circle', isTag: true, tagColor: '#a855f7' }, // Purple
  { id: 'tag-invoice', label: 'Invoice', icon: 'Circle', isTag: true, tagColor: '#22c55e' }, // Green
  { id: 'tag-important', label: 'Important', icon: 'Circle', isTag: true, tagColor: '#ef4444' }, // Red
  { id: 'tag-red', label: 'Red', icon: 'Circle', isTag: true, tagColor: '#ef4444' }, // Red
  { id: 'tag-orange', label: 'Orange', icon: 'Circle', isTag: true, tagColor: '#f97316' }, // Orange
  { id: 'tag-yellow', label: 'Yellow', icon: 'Circle', isTag: true, tagColor: '#eab308' }, // Yellow
];

export const WALLPAPER_PRESETS: WallpaperOption[] = [
  {
    id: 'liquid-glass',
    name: 'Liquid Glass (Default)',
    class: 'bg-gradient-to-tr from-sky-400 via-indigo-500 to-emerald-400',
    previewColor: 'from-sky-400 to-indigo-500'
  },
  {
    id: 'solar-twilight',
    name: 'Solar Twilight',
    class: 'bg-gradient-to-br from-[#1E202B] via-[#4338CA] to-[#F43F5E]',
    previewColor: 'from-indigo-900 to-rose-600'
  },
  {
    id: 'minimal-gray',
    name: 'Minimalist Clean Gray',
    class: 'bg-gradient-to-tr from-[#374151] via-[#1F2937] to-[#111827]',
    previewColor: 'from-gray-700 to-gray-900'
  },
  {
    id: 'cyberpunk',
    name: 'Electric Dream',
    class: 'bg-gradient-to-tr from-[#ec4899] via-[#8b5cf6] to-[#06b6d4]',
    previewColor: 'from-pink-500 to-cyan-500'
  }
];

// Content for subfolders
export const SUBFOLDER_CONTENTS: Record<string, FileItem[]> = {
  'Galaxy': [
    {
      id: 'galaxy-1',
      name: 'Andromeda.jpg',
      type: 'image',
      size: '4.5 MB',
      updatedAt: '2026-06-01',
      thumbnailUrl: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&w=300&q=80',
      tags: ['Screenshots'],
      content: 'Beautiful high-resolution snapshot of the Andromeda Galaxy core structure.'
    },
    {
      id: 'galaxy-2',
      name: 'Milky-Way-Core.jpg',
      type: 'image',
      size: '3.8 MB',
      updatedAt: '2026-05-28',
      thumbnailUrl: 'https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=300&q=80',
      tags: ['Screenshots'],
      content: 'Stargazing research output capturing the core density of our Milky Way.'
    },
    {
      id: 'galaxy-doc',
      name: 'Nasa-Manifest.odt',
      type: 'document',
      size: '45 KB',
      updatedAt: '2026-05-20',
      tags: ['Writing'],
      content: '# NASA Deep Space Observatory Notes\n\n- Target Alpha Centennial\n- Telemetry Active\n- Core Sector Checked'
    }
  ],
  'Notes': [
    {
      id: 'notes-1',
      name: 'Meeting-With-Clients.odt',
      type: 'document',
      size: '15 KB',
      updatedAt: '2026-06-08',
      tags: ['Writing'],
      content: '# Client Meeting Notes\n\n- Feedback: Highly satisfied with the tactile smoothness of the layout.\n- Pivot points: Retain floating panels.\n- Iterations: Final review scheduled tomorrow.'
    },
    {
      id: 'notes-2',
      name: 'Productivity-Formulas.odt',
      type: 'document',
      size: '8 KB',
      updatedAt: '2026-06-07',
      tags: ['Writing'],
      content: '# Productivity Formula Logs\n\nFocus Time = T_tasks * Depth_multiplier / Interruptions\n\nKeep it single-screen.'
    },
    {
      id: 'notes-img',
      name: 'Whiteboard-Scribbles.jpg',
      type: 'image',
      size: '950 KB',
      updatedAt: '2026-06-06',
      thumbnailUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=300&q=80',
      tags: ['Screenshots'],
      content: 'Brainstorm session drawings for next level glassmorphism UI widgets.'
    }
  ],
  'Photos': [
    {
      id: 'photos-1',
      name: 'Japan-Trip-Kyoto.jpg',
      type: 'image',
      size: '3.1 MB',
      updatedAt: '2026-05-15',
      thumbnailUrl: 'https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=300&q=80',
      tags: ['Screenshots'],
      content: 'Gorgeous vermilion Torii gates snapshot captured at early dawn in Fushimi Inari.'
    },
    {
      id: 'photos-2',
      name: 'Alpine-Summer.jpg',
      type: 'image',
      size: '2.9 MB',
      updatedAt: '2026-05-10',
      thumbnailUrl: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&w=300&q=80',
      tags: ['Screenshots'],
      content: 'Green meadows and turquoise alpine lake view during our high pass trek.'
    }
  ]
};
