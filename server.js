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
const MAX_TERMINAL_SESSIONS = Number(process.env.MAX_TERMINAL_SESSIONS || 8);
const TERMINAL_IDLE_TIMEOUT_MS = Number(process.env.TERMINAL_IDLE_TIMEOUT_MS || 30 * 60 * 1000);

app.prepare().then(async () => {
  const server = express();

  try {
    const { Server: TusServer } = await import('@tus/server');
    const { FileStore } = await import('@tus/file-store');
    const fs = await import('fs');
    const fsp = await import('fs/promises');

    const tusUploadDir = process.env.TUS_UPLOAD_DIR || path.join(process.cwd(), 'data_mock', '.tus_uploads');
    await fsp.mkdir(tusUploadDir, { recursive: true });

    const tusServer = new TusServer({
      path: '/api/upload',
      datastore: new FileStore({ directory: tusUploadDir }),
      onUploadCreate: async (req, res, upload) => {
        const { validateSessionCookie } = await import('./lib/api-auth.ts');
        const session = await validateSessionCookie(req.headers.cookie);
        if (!session) throw { status_code: 401, body: 'Unauthorized' };
        return res;
      },
      onUploadFinish: async (req, res, upload) => {
        const targetPath = req.headers['x-target-path'];
        if (targetPath) {
          try {
            const isDev = process.env.NODE_ENV !== 'production';
            const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');
            const dest = path.resolve(BASE_PATH, String(targetPath).replace(/^\/+/, ''));
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) {
              await fsp.mkdir(destDir, { recursive: true });
            }
            await fsp.rename(path.join(tusUploadDir, upload.id), dest);
          } catch (e) {
            console.error('TUS move error:', e);
          }
        }
        return res;
      },
    });

    server.all('/api/upload', (req, res) => {
      tusServer.handle(req, res);
    });
    server.all('/api/upload/*', (req, res) => {
      tusServer.handle(req, res);
    });

    console.log('TUS resumable upload server mounted at /api/upload');
  } catch (e) {
    console.warn('TUS packages not installed; resumable uploads disabled. Run: npm install @tus/server @tus/file-store');
  }

  const httpServer = (await import('http')).createServer(server);

  try {
    const { Server: SocketIOServer } = await import('socket.io');
    const pty = await import('node-pty');
    const os = await import('os');

    const io = new SocketIOServer(httpServer);
    let activeTerminalSessions = 0;

    io.on('connection', async (socket) => {
      const { validateSessionCookie } = await import('./lib/api-auth.ts');
      const session = await validateSessionCookie(socket.request.headers.cookie);
      if (!session) { socket.disconnect(); return; }

      let ptyProcess = null;
      let idleTimer = null;

      const clearIdleTimer = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = null;
      };

      const releasePty = () => {
        if (activeTerminalSessions > 0) activeTerminalSessions -= 1;
        ptyProcess = null;
        clearIdleTimer();
      };

      const refreshIdleTimer = () => {
        clearIdleTimer();
        idleTimer = setTimeout(() => {
          if (ptyProcess) {
            socket.emit('output', '\r\n[terminal closed after being idle]\r\n');
            try { ptyProcess.kill(); } catch (e) {}
          }
        }, TERMINAL_IDLE_TIMEOUT_MS);
      };

      const ensurePty = () => {
        if (ptyProcess) return ptyProcess;
        if (activeTerminalSessions >= MAX_TERMINAL_SESSIONS) {
          socket.emit('output', `\r\n[terminal limit reached: ${MAX_TERMINAL_SESSIONS} active sessions]\r\n`);
          return null;
        }

        const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
        ptyProcess = pty.spawn(shell, [], {
          name: 'xterm-256color', cols: 80, rows: 30,
          cwd: process.env.HOME || process.env.USERPROFILE || process.cwd(),
          env: process.env,
        });
        activeTerminalSessions += 1;
        ptyProcess.on('data', (data) => socket.emit('output', data));
        ptyProcess.on('exit', () => {
          socket.emit('output', '\r\n[process exited; reconnect to start a new shell]\r\n');
          releasePty();
        });
        refreshIdleTimer();
        return ptyProcess;
      };

      socket.on('input', (data) => {
        try {
          const p = ensurePty();
          if (p) {
            refreshIdleTimer();
            p.write(data);
          }
        } catch (e) {}
      });
      socket.on('resize', (size) => {
        try {
          const p = ensurePty();
          if (p && size && size.cols && size.rows) {
            refreshIdleTimer();
            p.resize(size.cols, size.rows);
          }
        }
        catch (e) { console.warn('Resize error', e); }
      });
      socket.on('disconnect', () => {
        if (ptyProcess) { try { ptyProcess.kill(); } catch (e) {} }
        clearIdleTimer();
      });
    });

    global.io = io;
    console.log('Socket.IO server mounted (auth-gated)');
  } catch (e) {
    console.warn('Terminal dependencies not installed (node-pty, socket.io). Terminal disabled.');
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
