import os from 'os';
import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { getSession } from '../../../lib/auth';
import { mkdir } from 'fs/promises';

const execAsync = util.promisify(exec);

export default async function handler(req: any, res: any) {
  const session = await getSession(req);
  if (!session) return res.status(401).end();

  if (req.method !== 'POST') return res.status(405).end();
  
  if (os.platform() !== 'linux') {
    return res.status(400).json({ error: 'Mounting is only supported on Linux' });
  }

  const { device } = req.body; // e.g. "sda1" or "sdb1"
  if (!device) return res.status(400).json({ error: 'Device name is required' });

  try {
    // Basic sanitization
    const safeDevice = device.replace(/[^a-zA-Z0-9_-]/g, '');
    const mountPoint = `/mnt/${safeDevice}`;
    const devPath = `/dev/${safeDevice}`;

    // Ensure mount point exists
    await mkdir(mountPoint, { recursive: true });

    // Execute mount command
    await execAsync(`mount ${devPath} ${mountPoint}`);

    return res.json({ ok: true, mountPoint });
  } catch (err: any) {
    console.error(`Failed to mount ${device}:`, err);
    return res.status(500).json({ error: err.message || 'Failed to mount drive' });
  }
}
