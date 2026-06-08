import os from 'os';
import { exec } from 'child_process';
import path from 'path';
import { getSession } from '../../../lib/auth';
import { mkdir } from 'fs/promises';

const execAsync = (cmd: string): Promise<{ stdout: string; stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

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
    // Basic sanitization — allow only alphanumeric, dash, underscore
    const safeDevice = device.replace(/[^a-zA-Z0-9_-]/g, '');
    const mountPoint = `/mnt/${safeDevice}`;
    const devPath = `/dev/${safeDevice}`;

    // Ensure mount point exists
    await mkdir(mountPoint, { recursive: true });

    // Use sudo mount — requires passwordless sudo for 'mount' in /etc/sudoers
    // e.g.: node ALL=(ALL) NOPASSWD: /bin/mount
    await execAsync(`sudo mount ${devPath} ${mountPoint}`);

    return res.json({ ok: true, mountPoint });
  } catch (err: any) {
    const msg = err.stderr || err.message || 'Failed to mount drive';
    // Give a more user-friendly error
    if (msg.includes('permission denied') || msg.includes('not permitted')) {
      return res.status(500).json({
        error: 'Permission denied. Ensure the app runs as root or add sudoers rule: node ALL=(ALL) NOPASSWD: /bin/mount'
      });
    }
    console.error(`Failed to mount ${device}:`, err);
    return res.status(500).json({ error: msg });
  }
}
