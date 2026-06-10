import express from 'express';
import next from 'next';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const PORT = process.env.PORT || 3000;

app.prepare().then(async () => {
  const server = express();

  // ── TUS Resumable Upload Server ──────────────────────────────────────────
  try {
    const { Server: TusServer } = await import('@tus/server');
    const { FileStore } = await import('@tus/file-store');
    const fs = await import('fs');

    const tusUploadDir = process.env.TUS_UPLOAD_DIR || path.join(process.cwd(), 'data_mock', '.tus_uploads');
    if (!fs.existsSync(tusUploadDir)) {
      fs.mkdirSync(tusUploadDir, { recursive: true });
    }

    const tusServer = new TusServer({
      path: '/api/upload',
      datastore: new FileStore({ directory: tusUploadDir }),
      onUploadCreate: async (req, res, upload) => {
        // Validate a real, unexpired session (not just the presence of a cookie).
        const { validateSessionCookie } = await import('./lib/api-auth.ts');
        const session = await validateSessionCookie(req.headers.cookie);
        if (!session) throw { status_code: 401, body: 'Unauthorized' };
        return res;
      },
      onUploadFinish: async (req, res, upload) => {
        // Move completed upload to the target destination
        const targetPath = req.headers['x-target-path'];
        if (targetPath) {
          try {
            const isDev = process.env.NODE_ENV !== 'production';
            const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');
            const dest = path.resolve(BASE_PATH, String(targetPath).replace(/^\/+/, ''));
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) {
              fs.mkdirSync(destDir, { recursive: true });
            }
            fs.renameSync(path.join(tusUploadDir, upload.id), dest);
          } catch (e) {
            console.error('TUS move error:', e);
          }
        }
        return res;
      },
    });

    // TUS requires all HTTP methods
    server.all('/api/upload', (req, res) => {
      tusServer.handle(req, res);
    });
    server.all('/api/upload/*', (req, res) => {
      tusServer.handle(req, res);
    });

    console.log('✅ TUS resumable upload server mounted at /api/upload');
  } catch (e) {
    console.warn('⚠️  TUS packages not installed — resumable uploads disabled. Run: npm install @tus/server @tus/file-store');
  }
  // ─────────────────────────────────────────────────────────────────────────

  const httpServer = (await import('http')).createServer(server);
  
  try {
    const { Server: SocketIOServer } = await import('socket.io');
    const pty = await import('node-pty');
    const os = await import('os');
    
    const io = new SocketIOServer(httpServer);
    
    io.on('connection', async (socket) => {
      // Strict auth: require a real, unexpired DB session before anything.
      const { validateSessionCookie } = await import('./lib/api-auth.ts');
      const session = await validateSessionCookie(socket.request.headers.cookie);
      if (!session) { socket.disconnect(); return; }

      // PTY is spawned lazily — only terminal sessions (which emit resize/input)
      // get a shell; deploy/stats/log sockets never spawn one.
      let ptyProcess = null;
      const ensurePty = () => {
        if (ptyProcess) return ptyProcess;
        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
        ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color', cols: 80, rows: 30,
          cwd: process.env.HOME || process.env.USERPROFILE || process.cwd(),
          env: process.env,
        });
        ptyProcess.on('data', (data) => socket.emit('output', data));
        ptyProcess.on('exit', () => {
          socket.emit('output', '\r\n[process exited — reconnect to start a new shell]\r\n');
          ptyProcess = null;
        });
        return ptyProcess;
      };

      socket.on('input', (data) => { try { ensurePty().write(data); } catch (e) {} });
      socket.on('resize', (size) => {
        try { const p = ensurePty(); if (size && size.cols && size.rows) p.resize(size.cols, size.rows); }
        catch (e) { console.warn('Resize error', e); }
      });

      // Deploy log room — replays persisted logs, then streams live.
      socket.on('join_deployment', async (deploymentId) => {
        socket.join(`deployment:${deploymentId}`);
        try {
          const { getDeployment } = await import('./lib/docker-db.ts');
          const d = getDeployment(deploymentId);
          if (d && d.logs) socket.emit('log', d.logs);
        } catch (e) { console.error('historic logs error:', e); }
      });

      // Live container resource stats.
      let statsInterval = null;
      socket.on('subscribe_stats', async (appId) => {
        if (statsInterval) clearInterval(statsInterval);
        const [{ statsOnce }, { containerSlug }] = await Promise.all([
          import('./lib/docker.ts'), import('./lib/validate.ts'),
        ]);
        const slug = containerSlug(appId);
        const tick = async () => { const s = await statsOnce([slug]); if (s.length) socket.emit(`stats:${appId}`, s); };
        tick();
        statsInterval = setInterval(tick, 3000);
      });
      socket.on('unsubscribe_stats', () => { if (statsInterval) { clearInterval(statsInterval); statsInterval = null; } });

      // Live runtime container logs (distinct from deploy logs).
      let logsChild = null;
      socket.on('subscribe_logs', async (appId) => {
        if (logsChild) { try { logsChild.kill(); } catch (e) {} logsChild = null; }
        const [{ streamLogs }, { containerSlug }] = await Promise.all([
          import('./lib/docker.ts'), import('./lib/validate.ts'),
        ]);
        logsChild = streamLogs(containerSlug(appId), (line) => socket.emit(`applog:${appId}`, line));
      });
      socket.on('unsubscribe_logs', () => { if (logsChild) { try { logsChild.kill(); } catch (e) {} logsChild = null; } });

      socket.on('disconnect', () => {
        if (ptyProcess) { try { ptyProcess.kill(); } catch (e) {} }
        if (statsInterval) clearInterval(statsInterval);
        if (logsChild) { try { logsChild.kill(); } catch (e) {} }
      });
    });

    global.io = io;
    console.log('✅ Socket.IO server mounted (auth-gated)');

    // Periodic reconciliation: make DB status reflect real container state.
    setInterval(async () => {
      try {
        const { reconcileAll } = await import('./lib/deploy-engine.ts');
        await reconcileAll();
      } catch (e) { /* docker may be absent in dev; ignore */ }
    }, 10000);

    // Background scheduler: health checks, cron tasks, scheduled backups,
    // remote server reachability sweeps.
    try {
      const { startScheduler } = await import('./lib/scheduler.ts');
      startScheduler();
    } catch (e) {
      console.warn('⚠️  Scheduler failed to start:', e.message);
    }
  } catch (e) {
    console.warn('⚠️  Terminal dependencies not installed (node-pty, socket.io). Terminal disabled.');
    console.warn(e);
  }


  server.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
