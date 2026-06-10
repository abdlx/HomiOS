import os from 'os';
import fs from 'fs';
import { withAuth } from '../../../lib/api-auth.ts';

/** Aggregate busy/idle tick counters across all cores. */
function cpuTimes() {
  let idle = 0, total = 0;
  for (const c of os.cpus()) {
    for (const t of Object.values(c.times)) total += t as number;
    idle += c.times.idle;
  }
  return { idle, total };
}

/** Accurate cross-platform CPU% from a short two-sample delta (loadavg is 0 on Windows). */
function sampleCpuPercent(ms = 120): Promise<number> {
  return new Promise((resolve) => {
    const a = cpuTimes();
    setTimeout(() => {
      const b = cpuTimes();
      const idle = b.idle - a.idle;
      const total = b.total - a.total;
      resolve(total > 0 ? Math.min(100, Math.max(0, (1 - idle / total) * 100)) : 0);
    }, ms);
  });
}

export default withAuth(async (req: any, res: any) => {
  try {
    const cpus = os.cpus();
    const loadAvg = os.loadavg()[0];
    const cpuUsagePercent = await sampleCpuPercent();

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
      }
    });

  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to fetch system stats' });
  }
});
