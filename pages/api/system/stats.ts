import { NextApiRequest, NextApiResponse } from 'next';
import os from 'os';
import fs from 'fs';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const cpus = os.cpus();
    const loadAvg = os.loadavg()[0];
    const cpuUsagePercent = Math.min((loadAvg / Math.max(cpus.length, 1)) * 100, 100);

    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;

    let diskFree = 0;
    let diskTotal = 0;
    try {
      // Get root path based on OS
      const rootPath = os.platform() === 'win32' ? 'C:\\' : '/';
      const statfs = await fs.promises.statfs(rootPath);
      diskFree = statfs.bfree * statfs.bsize;
      diskTotal = statfs.blocks * statfs.bsize;
    } catch (e) {
      console.warn('Could not fetch disk stats:', e);
    }

    res.status(200).json({
      cpu: {
        usagePercent: cpuUsagePercent,
        cores: cpus.length,
        model: cpus[0]?.model || 'Unknown CPU',
        load: loadAvg
      },
      memory: {
        total: totalMem,
        free: freeMem,
        used: usedMem
      },
      disk: {
        free: diskFree,
        total: diskTotal,
        used: diskTotal - diskFree
      },
      os: {
        uptime: os.uptime(),
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        version: os.version ? os.version() : os.release()
      },
      network: os.networkInterfaces()
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
}
