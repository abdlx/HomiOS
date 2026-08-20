import { withAuth } from '../../../lib/api-auth.ts';
import { sanitizeNickname, setDriveNickname } from '../../../lib/drive-labels.ts';

/**
 * Set or clear a drive's HomiOS display name.
 *
 * POST { name: "sda1", label: "Media Vault" } — an empty label resets to default.
 * This is a display nickname only; the on-disk filesystem label is untouched.
 */
export default withAuth(async (req: any, res: any) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }

  const { name, label } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Drive identifier is required' });

  try {
    setDriveNickname(String(name), label);
    return res.json({ ok: true, label: sanitizeNickname(label) || null });
  } catch (err: any) {
    return res.status(400).json({ error: err?.message || 'Could not rename drive' });
  }
}, { adminOnly: true, ability: 'write' });
