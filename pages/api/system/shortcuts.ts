import { readdir, stat } from 'fs/promises';
import path from 'path';
import { withAuth } from '../../../lib/api-auth.ts';
import os from 'os';

// Enumerates every home directory on the host — admin-level information.
export default withAuth(async function handler(req: any, res: any) {
  const isDev = process.env.NODE_ENV !== 'production';
  const shortcuts: { id: string; label: string; icon: string; path: string }[] = [];

  try {
    const baseDir = isDev ? process.cwd() : '/home';
    let users: string[] = [];

    if (isDev) {
      users = [os.userInfo().username];
    } else {
      try {
        // Find all user directories in /home
        const entries = await readdir(baseDir, { withFileTypes: true });
        users = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      } catch (err) {
        // Fallback to current user if /home reading fails
        users = [os.userInfo().username];
      }
    }

    // Typical Linux/Windows folders, including lowercase variants
    const foldersToCheck = [
      { name: 'Documents', icon: 'FileText' },
      { name: 'Downloads', icon: 'Download' },
      { name: 'Music', icon: 'Music' },
      { name: 'Pictures', icon: 'Image' },
      { name: 'Videos', icon: 'Video' },
      { name: 'Media', icon: 'Film' },
      { name: 'documents', icon: 'FileText' },
      { name: 'downloads', icon: 'Download' },
      { name: 'music', icon: 'Music' },
      { name: 'pictures', icon: 'Image' },
      { name: 'video', icon: 'Video' },
      { name: 'media', icon: 'Film' },
    ];

    for (const user of users) {
      const userHome = isDev ? os.homedir() : path.join(baseDir, user);
      
      for (const folder of foldersToCheck) {
        const folderPath = path.join(userHome, folder.name);
        try {
          const s = await stat(folderPath);
          if (s.isDirectory()) {
            // Avoid duplicates (e.g. if case-insensitive FS matches 'Documents' and 'documents')
            if (!shortcuts.find((s) => s.path.toLowerCase() === folderPath.toLowerCase())) {
              shortcuts.push({
                id: folderPath,
                label: folder.name.charAt(0).toUpperCase() + folder.name.slice(1), // Capitalize label
                icon: folder.icon,
                path: folderPath,
              });
            }
          }
        } catch {
          // Folder doesn't exist, ignore
        }
      }
    }

    res.json(shortcuts);
  } catch (err) {
    console.error('Failed to get shortcuts:', err);
    res.json([]);
  }
}, { adminOnly: true });
