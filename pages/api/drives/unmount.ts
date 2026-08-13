import os from 'os';
import { execFile } from 'child_process';
import { withAuth } from '../../../lib/api-auth.ts';
import { getDb } from '../../../lib/db.ts';
import { DriveUnmountError, unmountDrive } from '../../../lib/drive-unmount.ts';

const execFileAsync = (file: string, args: string[]): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 15_000 }, (error: any, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        error.stdout = stdout;
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

export default withAuth(async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end();
  }
  if (os.platform() !== 'linux') {
    return res.status(400).json({ error: 'Unmounting is only supported on Linux' });
  }

  try {
    const activeSharePaths = getDb().prepare(`
      SELECT path FROM shares
      WHERE enabled = 1 AND (expires_at IS NULL OR datetime(expires_at) > datetime('now'))
    `).all().map((share: any) => String(share.path));

    const result = await unmountDrive({
      device: req.body?.device,
      mountPoint: req.body?.mountPoint,
      activeSharePaths,
    }, execFileAsync);
    return res.json(result);
  } catch (error: any) {
    if (error instanceof DriveUnmountError) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Drive unmount failed:', error);
    return res.status(500).json({ error: 'Unmount failed' });
  }
}, { adminOnly: true, ability: 'write' });
