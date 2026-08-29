import express from 'express';
import next from 'next';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Freeze HomiOS's database identity before any embedded subsystem is loaded.
// Next evaluates API and SSR bundles lazily on different requests; they must not
// discover a temporary DATABASE_URL that belongs to the cloud-storage engine.
process.env.HOMIOS_DATABASE_PATH ||= process.env.DATABASE_URL || path.resolve(process.cwd(), 'data', 'filemanager.db');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// HOMIOS_PORT is the canonical application port (default 8740).
// PORT is accepted for compatibility but HOMIOS_PORT takes precedence
// so that a stale legacy PORT=3000 in the environment cannot shadow it.
const PORT = Number(
  process.env.HOMIOS_PORT ||
  process.env.PORT ||
  8740
);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_TERMINAL_SESSIONS = Number(process.env.MAX_TERMINAL_SESSIONS || 8);
const TERMINAL_IDLE_TIMEOUT_MS = Number(process.env.TERMINAL_IDLE_TIMEOUT_MS || 30 * 60 * 1000);
const MAX_JSON_BODY_BYTES = Number(process.env.MAX_JSON_BODY_BYTES || 1024 * 1024);
const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024 * 1024); // 25 GiB

/** Origins allowed to open a websocket / send cross-origin requests. */
const ALLOWED_ORIGINS = String(process.env.HOMIOS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * An Origin is acceptable if it is explicitly allowlisted, or if it is same-origin
 * with the request's own Host. Same-origin is the normal case for a self-hosted app
 * behind a reverse proxy; the env var exists for split frontend/backend hostnames.
 */
function originAllowed(origin, hostHeader) {
  if (!origin) return true; // non-browser client (curl, native app) — has no Origin
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const host = String(hostHeader || '').split(',')[0].trim();
    return !!host && new URL(origin).host === host;
  } catch {
    return false;
  }
}

app.prepare().then(async () => {
  const server = express();
  const { hitRateLimit, rateLimitKey } = await import('./lib/request-security.ts');
  const { apiRateLimitPreset } = await import('./lib/api-rate-limits.ts');
  const { getSession } = await import('./lib/auth.ts');
  const { hasAbility } = await import('./lib/api-auth.ts');
  const { isCodexPath, createCodexProxy, CODEX_UPSTREAM } = await import('./lib/codex-proxy.ts');
  const {
    isCodeServerPath,
    createCodeServerProxy,
    CODE_SERVER_UPSTREAM,
  } = await import('./lib/code-server-proxy.ts');

  // req.ip is only trustworthy once Express knows which proxies to believe. Everything
  // downstream (rate limiting especially) keys off req.ip, never a raw X-Forwarded-For.
  server.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
  server.disable('x-powered-by');

  server.use((req, res, nextMiddleware) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');

    // Proxied Codex responses keep their own policies: HomiOS's CSP would break the
    // Vue bundle, and its Permissions-Policy would block Codex dictation (microphone).
    // The JSON cap is skipped too — codex-web-ui enforces its own body limits.
    if (isCodexPath(req.path) || isCodeServerPath(req.path)) {
      return nextMiddleware();
    }

    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    // Next injects inline bootstrap scripts and Tailwind emits inline styles, so
    // 'unsafe-inline' is unavoidable here without a nonce pipeline. The value that
    // actually matters is default-src/script-src 'self': it stops an uploaded file
    // or an injected string from loading attacker-hosted script.
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss:",
        "worker-src 'self' blob:",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "form-action 'self'",
      ].join('; ')
    );

    if (req.secure || String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    // Reject oversized JSON bodies up front. Several API routes disable Next's body
    // parser and read the stream themselves, so Next's built-in 1 MB cap doesn't apply.
    if (String(req.headers['content-type'] || '').includes('application/json')) {
      const declared = Number(req.headers['content-length'] || 0);
      if (declared > MAX_JSON_BODY_BYTES) {
        return res.status(413).json({ error: 'Request body too large' });
      }
    }

    if (req.path.startsWith('/api')) {
      const preset = apiRateLimitPreset(req.path);
      if (preset) {
        const hit = hitRateLimit(rateLimitKey(req, preset.bucket), preset);
        if (hit.limited) {
          res.setHeader('Retry-After', String(hit.retryAfter));
          return res.status(429).json({ error: 'Too many requests. Slow down and try again.' });
        }
      }
    }

    return nextMiddleware();
  });

  // Cloud storage is an HomiOS subsystem, mounted inside this server. Its
  // database and private API identity are derived automatically from HomiOS's
  // own APP_KEY; administrators never configure a URL or service API key.
  let cloudStoragePrisma = null;
  let restoreCloudStorageEnvironment = () => {};
  try {
    const {
      CLOUD_ENGINE_MOUNT,
      applyCloudStorageEnvironment,
      migrateCloudStorageDatabase,
      validInternalCloudRequest,
    } = await import('./lib/cloud-storage-runtime.ts');
    const cloudRuntime = applyCloudStorageEnvironment();
    restoreCloudStorageEnvironment = cloudRuntime.restore;
    migrateCloudStorageDatabase();
    const [{ app: cloudStorageApp }, { bootstrapHomiCloudStorage }, { prisma }] = await Promise.all([
      import('./internal/cloud-storage-engine/dist/app.js'),
      import('./internal/cloud-storage-engine/dist/bootstrap.js'),
      import('./internal/cloud-storage-engine/dist/config/prisma.js'),
    ]);
    await bootstrapHomiCloudStorage(cloudRuntime.internalKey);
    cloudRuntime.restore();
    restoreCloudStorageEnvironment = () => {};
    cloudStoragePrisma = prisma;
    server.use(CLOUD_ENGINE_MOUNT, (req, res, nextMiddleware) => {
      if (!validInternalCloudRequest(req.headers['x-homios-internal'])) return res.status(404).end();
      return nextMiddleware();
    }, cloudStorageApp);
    console.log('HomiOS cloud storage subsystem mounted');
  } catch (error) {
    restoreCloudStorageEnvironment();
    console.warn('HomiOS cloud storage subsystem unavailable:', error?.message || error);
  }

  // Codex internal app: session-gated reverse proxy to the loopback codex-web-ui
  // service. Mounted before TUS/Next so /codex* never falls through to the SPA.
  let codexProxy = null;
  if (process.env.CODEX_UI_ENABLED === 'true') {
    codexProxy = createCodexProxy({ originAllowed });
    server.use(codexProxy.handleRequest);
    console.log(`Codex Web UI proxy mounted at /codex → ${CODEX_UPSTREAM} (admin session required)`);
  }

  // code-server is a host service, not a Next or Coolify application. Mount it
  // before Next so its assets, policies, and websocket traffic keep one owner.
  const codeServerProxy = process.env.CODE_SERVER_ENABLED === 'false'
    ? null
    : createCodeServerProxy();
  if (codeServerProxy) {
    server.use(codeServerProxy.handleRequest);
    console.log(`Code Server proxy mounted at /code -> ${CODE_SERVER_UPSTREAM}`);
  }

  try {
    const { Server: TusServer } = await import('@tus/server');
    const { FileStore } = await import('@tus/file-store');
    const fs = await import('fs');
    const fsp = await import('fs/promises');

    const tusUploadDir = process.env.TUS_UPLOAD_DIR || path.join(process.cwd(), 'data_mock', '.tus_uploads');
    await fsp.mkdir(tusUploadDir, { recursive: true });

    const getTusHeader = (req, name) => {
      if (typeof req.headers?.get === 'function') return req.headers.get(name);
      const value = req.headers?.[name.toLowerCase()] ?? req.headers?.[name];
      return Array.isArray(value) ? value[0] : value;
    };

    // Uploads land on the host filesystem as the (root) service user, so they are
    // instance-admin territory — same bar as /api/files.
    const requireTusSession = async (req) => {
      const session = await getSession({
        headers: {
          authorization: getTusHeader(req, 'authorization'),
          cookie: getTusHeader(req, 'cookie'),
        },
      });
      if (!session) throw { status_code: 401, body: 'Unauthorized' };
      if (!session.isAdmin) throw { status_code: 403, body: 'Requires administrator privileges' };
      if (!hasAbility(session, 'write')) throw { status_code: 403, body: "Token missing 'write' ability" };
      return session;
    };

    const normalizeUploadPath = (value) => {
      const parts = String(value || '')
        .replace(/\\/g, '/')
        .split('/')
        .filter(Boolean);
      if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
        throw { status_code: 400, body: 'Invalid target path' };
      }
      return parts.join('/');
    };

    const moveUploadIntoPlace = async (upload, dest) => {
      const source = upload.storage?.type === 'file' && upload.storage.path
        ? upload.storage.path
        : path.join(tusUploadDir, upload.id);

      try {
        await fsp.rename(source, dest);
      } catch (error) {
        if (error?.code !== 'EXDEV') throw error;
        await fsp.copyFile(source, dest);
        await fsp.unlink(source);
      }

      await fsp.rm(path.join(tusUploadDir, `${upload.id}.json`), { force: true });
    };

    const tusServer = new TusServer({
      path: '/api/upload',
      relativeLocation: true,
      respectForwardedHeaders: true,
      maxSize: MAX_UPLOAD_BYTES,
      datastore: new FileStore({ directory: tusUploadDir }),
      onIncomingRequest: async (req) => {
        await requireTusSession(req);
      },
      onUploadCreate: async (req, upload) => {
        const targetPath = normalizeUploadPath(getTusHeader(req, 'x-target-path'));
        return {
          metadata: {
            ...upload.metadata,
            targetPath: String(targetPath),
          },
        };
      },
      onUploadFinish: async (req, upload) => {
        const targetPath = normalizeUploadPath(upload.metadata?.targetPath || getTusHeader(req, 'x-target-path'));

        try {
          const isDev = process.env.NODE_ENV !== 'production';
          const BASE_PATH = process.env.ROOT_DIR || (isDev ? path.join(process.cwd(), 'data_mock') : '/');
          const dest = path.resolve(BASE_PATH, String(targetPath).replace(/^\/+/, ''));
          const destDir = path.dirname(dest);
          if (!fs.existsSync(destDir)) {
            await fsp.mkdir(destDir, { recursive: true });
          }
          await moveUploadIntoPlace(upload, dest);
        } catch (e) {
          console.error('TUS move error:', e);
          throw { status_code: 500, body: 'Upload finished, but HomiOS could not place the file in the target folder' };
        }
        return {};
      },
    });

    server.all('/api/upload', (req, res) => {
      tusServer.handle(req, res);
    });
    server.all('/api/upload/*', (req, res) => {
      tusServer.handle(req, res);
    });

    console.log('TUS resumable upload server mounted at /api/upload (admin-only)');
  } catch (e) {
    console.warn('TUS packages not installed; resumable uploads disabled. Run: npm install @tus/server @tus/file-store');
  }

  const httpServer = (await import('http')).createServer(server);

  // The /codex-api/ws websocket never reaches Express, so gate + proxy it on the raw
  // upgrade event. Non-codex upgrades are left for Socket.IO's own listener.
  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url || '', 'http://localhost').pathname; } catch {}
    if (!isCodexPath(pathname)) return;
    if (codexProxy) {
      codexProxy.handleUpgrade(req, socket, head);
    } else {
      try { socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); } catch {}
      socket.destroy();
    }
  });

  httpServer.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url || '', 'http://localhost').pathname; } catch {}
    if (!isCodeServerPath(pathname)) return;
    if (codeServerProxy) {
      codeServerProxy.handleUpgrade(req, socket, head);
    } else {
      try { socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); } catch {}
      socket.destroy();
    }
  });

  let io = null;
  try {
    const { Server: SocketIOServer } = await import('socket.io');
    const pty = await import('node-pty');
    const os = await import('os');
    const { validateSessionCookie } = await import('./lib/api-auth.ts');

    io = new SocketIOServer(httpServer, {
      // Without an explicit origin check a hostile page can open a websocket to a
      // logged-in user's HomiOS and drive their terminal (cross-site hijacking).
      allowRequest: (req, callback) => {
        const ok = originAllowed(req.headers.origin, req.headers['x-forwarded-host'] || req.headers.host);
        callback(null, ok);
      },
      cors: { origin: ALLOWED_ORIGINS.length ? ALLOWED_ORIGINS : false, credentials: true },
    });

    const { onJobProgress } = await import('./lib/jobs.ts');
    onJobProgress((payload) => io.emit('apps:install-progress', payload));

    let activeTerminalSessions = 0;
    global.homiosTerminalSessions = global.homiosTerminalSessions || new Map();

    io.on('connection', async (socket) => {
      const hit = hitRateLimit(`socket:${socket.handshake.address}`, { windowMs: 60_000, max: 30 });
      if (hit.limited) { socket.disconnect(); return; }

      const session = await validateSessionCookie(socket.request.headers.cookie);
      if (!session) { socket.disconnect(); return; }

      // The PTY is an interactive shell as the service user (root under systemd).
      // That is instance-admin power, not "any logged-in user" power.
      if (!session.isAdmin) {
        socket.emit('output', '\r\n[terminal requires administrator privileges]\r\n');
        socket.disconnect();
        return;
      }

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
          // Allowlist, never `process.env`. The full environment carries APP_KEY —
          // which decrypts every stored SSH key and S3 credential — plus the Coolify
          // API token. `env` in a shell should not be a secret dump.
          env: {
            PATH: process.env.PATH,
            HOME: process.env.HOME || process.env.USERPROFILE,
            USER: process.env.USER || process.env.USERNAME,
            SHELL: process.env.SHELL,
            LANG: process.env.LANG || 'en_US.UTF-8',
            TERM: 'xterm-256color',
          },
        });
        activeTerminalSessions += 1;
        global.homiosTerminalSessions.set(socket.id, {
          id: socket.id,
          shell,
          userId: session.userId,
          email: session.email,
          startedAt: new Date().toISOString(),
          kill: () => {
            try { ptyProcess?.kill(); } catch (e) {}
          },
        });
        ptyProcess.on('data', (data) => socket.emit('output', data));
        ptyProcess.on('exit', () => {
          socket.emit('output', '\r\n[process exited; reconnect to start a new shell]\r\n');
          global.homiosTerminalSessions.delete(socket.id);
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
        global.homiosTerminalSessions.delete(socket.id);
        clearIdleTimer();
      });
    });

    global.io = io;
    console.log('Socket.IO server mounted (admin-only, origin-checked)');
  } catch (e) {
    console.warn('Terminal dependencies not installed (node-pty, socket.io). Terminal disabled.');
    console.warn(e);
  }

  server.all('*', (req, res) => {
    return handle(req, res);
  });

  let checkpointTimer = null;
  let appReconcileTimer = null;
  try {
    const { runStartupIntegrityChecks, checkpointWal } = await import('./lib/db.ts');
    runStartupIntegrityChecks();
    checkpointTimer = setInterval(() => {
      try { checkpointWal(); } catch (e) { console.warn('[db] WAL checkpoint failed:', e); }
    }, Number(process.env.HOMIOS_WAL_CHECKPOINT_MS || 5 * 60 * 1000));

    const { startJobWorker } = await import('./lib/jobs.ts');
    startJobWorker();
    console.log('HomiOS job worker started');

    const { refreshCoolifyCatalog } = await import('./lib/apps/coolify-catalog.ts');
    void refreshCoolifyCatalog().catch((e) => console.warn('[apps] catalog cache refresh deferred:', e?.message || e));

    const { getCoolifyIntegration } = await import('./lib/apps/integration-storage.ts');
    const { reconcileManagedApps } = await import('./lib/apps/reconciliation.ts');
    const reconcileApps = async () => {
      if (!getCoolifyIntegration()?.connected) return;
      try { await reconcileManagedApps(); } catch (e) { console.warn('[apps] reconciliation deferred:', e?.message || e); }
    };
    void reconcileApps();
    appReconcileTimer = setInterval(reconcileApps, 60_000);
    appReconcileTimer.unref?.();

    const { startSyncScheduler } = await import('./lib/sync.ts');
    startSyncScheduler();
    console.log('HomiOS backup sync scheduler started');
  } catch (e) {
    console.warn('HomiOS job worker failed to start:', e);
  }

  httpServer.listen(PORT, HOST, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${HOST}:${PORT}`);
  });

  // Graceful shutdown: stop taking traffic, kill child shells, checkpoint the WAL.
  // Without this, SIGTERM leaves orphaned PTYs and an un-checkpointed WAL behind.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[shutdown] ${signal} received — draining…`);

    const force = setTimeout(() => {
      console.warn('[shutdown] drain timed out; exiting anyway');
      process.exit(1);
    }, Number(process.env.SHUTDOWN_TIMEOUT_MS || 15_000));
    force.unref();

    if (checkpointTimer) clearInterval(checkpointTimer);
    if (appReconcileTimer) clearInterval(appReconcileTimer);
    try {
      const { stopSyncScheduler } = await import('./lib/sync.ts');
      stopSyncScheduler();
    } catch {}
    try {
      const { drainJobWorker } = await import('./lib/jobs.ts');
      const drain = await drainJobWorker(Number(process.env.SHUTDOWN_JOB_DRAIN_MS || 10_000));
      if (!drain.drained) console.warn(`[shutdown] ${drain.running} job(s) will recover on next start`);
    } catch {}

    for (const term of global.homiosTerminalSessions?.values() || []) {
      try { term.kill(); } catch {}
    }
    if (io) { try { io.close(); } catch {} }
    if (cloudStoragePrisma) { try { await cloudStoragePrisma.$disconnect(); } catch {} }

    httpServer.close(async () => {
      try {
        const { checkpointWal, closeDb } = await import('./lib/db.ts');
        checkpointWal();
        closeDb();
      } catch (e) {
        console.warn('[shutdown] db teardown failed:', e);
      }
      console.log('[shutdown] clean');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});
