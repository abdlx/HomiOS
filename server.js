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
        // Validate session cookie exists
        const cookieHeader = req.headers.cookie;
        if (!cookieHeader || !cookieHeader.includes('session=')) {
          throw { status_code: 401, body: 'Unauthorized' };
        }
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
    
    io.on('connection', (socket) => {
      // Basic security check (requires session cookie)
      const cookieHeader = socket.request.headers.cookie;
      if (!cookieHeader || !cookieHeader.includes('session=')) {
        socket.disconnect();
        return;
      }
      
      const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
      
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols: 80,
        rows: 30,
        cwd: process.env.HOME || process.env.USERPROFILE || process.cwd(),
        env: process.env
      });

      ptyProcess.on('data', (data) => {
        socket.emit('output', data);
      });

      socket.on('input', (data) => {
        ptyProcess.write(data);
      });

      socket.on('resize', (size) => {
        try {
          if (size && size.cols && size.rows) {
            ptyProcess.resize(size.cols, size.rows);
          }
        } catch (e) {
          console.warn('Resize error', e);
        }
      });

      socket.on('disconnect', () => {
        ptyProcess.kill();
      });
    });
    
    console.log('✅ Terminal Socket.IO server mounted');
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
