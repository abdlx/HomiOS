import { createReadStream } from 'fs';
import path from 'path';
import { withAuth } from '../../lib/api-auth.ts';
import { ensureThumbnail, ThumbnailVariant } from '../../lib/thumbnails.ts';

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

export const config = {
  api: {
    responseLimit: false,
  },
};

export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'GET') return res.status(405).end();
  const sourcePath = String(req.query.path || '');
  const variant = (req.query.variant === 'preview' ? 'preview' : 'grid') as ThumbnailVariant;
  if (!sourcePath) return res.status(400).json({ error: 'Missing path' });

  try {
    const thumb = await ensureThumbnail(sourcePath, variant);
    res.setHeader('Content-Type', thumb.contentType);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return createReadStream(thumb.path).pipe(res);
  } catch (err: any) {
    // If native thumbnail tools are missing, let images still render through the raw file API path upstream.
    const ext = path.extname(sourcePath).toLowerCase();
    if (IMAGE_MIME[ext]) {
      res.setHeader('X-OpenFinder-Thumbnail-Fallback', err.message || 'thumbnail unavailable');
      return res.redirect(307, `/api/files?raw=true&path=${encodeURIComponent(sourcePath)}`);
    }
    return res.status(404).json({ error: 'Thumbnail unavailable' });
  }
}, { adminOnly: true });
