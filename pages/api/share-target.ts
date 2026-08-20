import { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '../../lib/auth';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: { bodyParser: false },
};

const dataDir = () => process.env.HOMIOS_DATA_DIR || path.join(process.cwd(), 'data');

/**
 * GET  /api/share-target?id=xxx  → fetch share payload JSON
 * POST /api/share-target         → receive Web Share Target upload
 */
export default async function shareTargetHandler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getSession(req);
  if (!session) {
    if (req.method === 'POST') {
      return res.redirect(302, '/login?returnTo=/share-received');
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    const { id } = req.query;
    if (!id || typeof id !== 'string' || !/^share_\d+_[a-z0-9]+$/.test(id)) {
      return res.status(400).json({ error: 'Invalid share ID' });
    }
    try {
      const shareFile = path.join(dataDir(), '_shared_inbox', `${id}.json`);
      if (!fs.existsSync(shareFile)) {
        return res.status(404).json({ error: 'Share not found or expired' });
      }
      return res.status(200).json(JSON.parse(await fs.promises.readFile(shareFile, 'utf-8')));
    } catch {
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const form = formidable({ multiples: true, maxFileSize: 100 * 1024 * 1024 });
      const [fields, files] = await form.parse(req);

      const get = (v: any) => (Array.isArray(v) ? v[0] : v) || '';
      const title = get(fields.title);
      const text = get(fields.text);
      const url = get(fields.url);

      const inboxDir = path.join(dataDir(), '_shared_inbox');
      await fs.promises.mkdir(inboxDir, { recursive: true });

      const sharedItems: any[] = [];

      const mediaFiles = files.media;
      if (mediaFiles) {
        const fileList = Array.isArray(mediaFiles) ? mediaFiles : [mediaFiles];
        for (const file of fileList) {
          if (file.filepath && file.originalFilename) {
            const destPath = path.join(inboxDir, file.originalFilename);
            await fs.promises.copyFile(file.filepath, destPath);
            await fs.promises.unlink(file.filepath).catch(() => {});
            sharedItems.push({ type: 'file', name: file.originalFilename, path: `/_shared_inbox/${file.originalFilename}` });
          }
        }
      }
      if (text) sharedItems.push({ type: 'text', name: title || 'Shared text', content: text });
      if (url) sharedItems.push({ type: 'url', name: title || url, content: url });

      const shareId = `share_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const shareFile = path.join(inboxDir, `${shareId}.json`);
      await fs.promises.writeFile(shareFile, JSON.stringify({ id: shareId, createdAt: new Date().toISOString(), title, text, url, items: sharedItems }));

      return res.redirect(302, `/share-received?id=${shareId}`);
    } catch (err) {
      console.error('[share-target POST]', err);
      return res.redirect(302, '/files?share_error=1');
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
