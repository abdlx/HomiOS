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

  server.all('*', (req, res) => {
    return handle(req, res);
  });

  server.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
