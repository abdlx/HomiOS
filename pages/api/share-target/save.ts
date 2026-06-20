import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../../lib/auth';
import fs from 'fs';
import path from 'path';

const dataDir = () => process.env.OPENFINDER_DATA_DIR || path.join(process.cwd(), 'data');

/**
 * POST /api/share-target/save
 * Move staged shared files from inbox to user's chosen folder.
 */
export default async function saveShareHandler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const { shareId, destinationFolder } = req.body;
  if (!shareId || typeof shareId !== 'string' || !/^share_\d+_[a-z0-9]+$/.test(shareId))
    return res.status(400).json({ error: 'Invalid share ID' });
  if (!destinationFolder || typeof destinationFolder !== 'string')
    return res.status(400).json({ error: 'Invalid destination' });

  const cleanDest = destinationFolder.split('/').filter(p => p && p !== '..' && p !== '.').join('/');

  try {
    const inboxDir = path.join(dataDir(), '_shared_inbox');
    const shareFile = path.join(inboxDir, `${shareId}.json`);

    if (!fs.existsSync(shareFile)) return res.status(404).json({ error: 'Share not found' });

    const payload = JSON.parse(await fs.promises.readFile(shareFile, 'utf-8'));
    const destDir = path.join(dataDir(), 'files', cleanDest);
    await fs.promises.mkdir(destDir, { recursive: true });

    const savedPaths: string[] = [];
    for (const item of payload.items) {
      if (item.type === 'file' && item.name) {
        const srcPath = path.join(inboxDir, path.basename(item.name));
        const destPath = path.join(destDir, item.name);
        if (fs.existsSync(srcPath)) {
          await fs.promises.rename(srcPath, destPath);
          savedPaths.push(`${cleanDest}/${item.name}`);
        }
      } else if (item.type === 'text' && item.content) {
        const fname = `${(item.name || 'note').replace(/[^a-z0-9\-_\s]/gi, '')}_${Date.now()}.txt`;
        await fs.promises.writeFile(path.join(destDir, fname), item.content, 'utf-8');
        savedPaths.push(`${cleanDest}/${fname}`);
      } else if (item.type === 'url' && item.content) {
        const fname = `${(item.name || 'link').replace(/[^a-z0-9\-_\s]/gi, '')}_${Date.now()}.url`;
        await fs.promises.writeFile(path.join(destDir, fname), `[InternetShortcut]\nURL=${item.content}\n`, 'utf-8');
        savedPaths.push(`${cleanDest}/${fname}`);
      }
    }

    await fs.promises.unlink(shareFile).catch(() => {});
    return res.status(200).json({ success: true, destination: cleanDest, savedPaths });
  } catch (err) {
    console.error('[share-target/save]', err);
    return res.status(500).json({ error: 'Failed to save shared items' });
  }
}
