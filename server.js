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

      // Docker manager room
      socket.on('join_deployment', async (deploymentId) => {
        socket.join(`deployment:${deploymentId}`);
        try {
          const { getDeployment } = await import('./lib/docker-db.js');
          const deployment = getDeployment(deploymentId);
          if (deployment && deployment.logs) {
            socket.emit('log', deployment.logs);
          }
        } catch (e) {
          console.error('Error sending historic logs:', e);
        }
      });

      let statsInterval;
      socket.on('subscribe_stats', (appId) => {
        if (statsInterval) clearInterval(statsInterval);
        const { exec } = require('child_process');
        statsInterval = setInterval(() => {
           exec(`docker stats --no-stream --format "{{.Name}}|{{.CPUPerc}}|{{.MemUsage}}"`, (err, stdout) => {
              if (!err && stdout) {
                 const lines = stdout.trim().split('\\n');
                 const appStats = lines.filter(l => l.includes(appId)).map(l => {
                   const [name, cpu, mem] = l.split('|');
                   return { name, cpu, mem };
                 });
                 if (appStats.length > 0) socket.emit(`stats:${appId}`, appStats);
              }
           });
        }, 3000);
      });

      socket.on('unsubscribe_stats', () => {
        if (statsInterval) clearInterval(statsInterval);
      });
      
      socket.on('disconnect', () => {
        if (statsInterval) clearInterval(statsInterval);
      });
    });
    
    global.io = io;
    console.log('✅ Terminal Socket.IO server mounted');
  } catch (e) {
    console.warn('⚠️  Terminal dependencies not installed (node-pty, socket.io). Terminal disabled.');
    console.warn(e);
  }

  server.post('/api/docker/webhooks/deploy/:id', async (req, res) => {
    const appId = req.params.id;
    // Trigger local deployment asynchronously
    fetch(`http://127.0.0.1:3000/api/docker/apps/${appId}/deploy`, { method: 'POST' }).catch(() => {});
    return res.status(200).json({ status: 'queued', message: 'Deployment triggered via webhook successfully' });
  });

  // ── Docker Manager Deployment Endpoints ────────────────────────────────
  server.use('/api/docker/apps/:id/deploy', express.json());
  server.post('/api/docker/apps/:id/deploy', async (req, res) => {
    const { id: appId } = req.params;
    const { spawn } = await import('child_process');
    const crypto = await import('crypto');
    const fs = await import('fs');
    const path = await import('path');
    const os = await import('os');
    const { getApp, updateAppStatus, createDeployment, updateDeployment } = await import('./lib/docker-db.js');
    
    const app = getApp(appId);
    if (!app) return res.status(404).json({ error: 'App not found' });
    
    const deploymentId = crypto.randomUUID();
    createDeployment(deploymentId, appId);
    updateAppStatus(appId, 'deploying');
    
    res.status(200).json({ deploymentId, status: 'deploying' });
    
    const appendLog = (data) => {
      const text = data.toString();
      updateDeployment(deploymentId, 'in_progress', text);
      if (global.io) global.io.to(`deployment:${deploymentId}`).emit('log', text);
    };

    appendLog(`Starting deployment for app ${app.name} (${appId})...\n`);

    const { exec } = await import('child_process');

    setTimeout(() => {
      // 1. Ensure proxy network and traefik are running
      exec(`docker network create openfinder-proxy || true && docker start openfinder-proxy || docker run -d --name openfinder-proxy --network openfinder-proxy -p 8080:80 -p 8443:443 -v /var/run/docker.sock:/var/run/docker.sock:ro traefik:v3.0 --api.insecure=true --providers.docker=true --providers.docker.exposedbydefault=false --entrypoints.web.address=:80 --entrypoints.websecure.address=:443`, (err) => {
        if (err) {
          appendLog(`Warning: Failed to ensure proxy: ${err.message}\n`);
        } else {
          appendLog(`System proxy verified on openfinder-proxy network.\n`);
        }

        try {
          let child;
          if (app.build_pack === 'dockerimage' || app.build_pack === 'database') {
            appendLog(`Pulling image ${app.docker_image}:${app.docker_image_tag}...\n`);
            const args = ['run', '-d', '--name', app.id, '--network', 'openfinder-proxy'];
            
            // Add Traefik Labels if domains exist
            if (app.domains) {
              const hostRules = app.domains.split(',').map(d => `Host(\`${d.trim()}\`)`).join(' || ');
              args.push('-l', 'traefik.enable=true');
              args.push('-l', `traefik.http.routers.${app.id}.rule=${hostRules}`);
              args.push('-l', `traefik.http.routers.${app.id}.entrypoints=web`);
              appendLog(`Configured dynamic proxy routing for: ${app.domains}\n`);
            }

            if (app.ports) {
              try {
                const parsedPorts = JSON.parse(app.ports);
                for (const p of parsedPorts) {
                  args.push('-p', `${p.host}:${p.container}`);
                }
              } catch (e) {}
            }
            if (app.volumes) {
              try {
                const parsedVolumes = JSON.parse(app.volumes);
                for (const v of parsedVolumes) {
                  args.push('-v', `${v.host}:${v.container}`);
                }
              } catch (e) {}
            }
            if (app.env_vars) {
              try {
                const parsedEnvs = JSON.parse(app.env_vars);
                for (const [k, v] of Object.entries(parsedEnvs)) {
                  args.push('-e', `${k}=${v}`);
                }
              } catch (e) {}
            }
            args.push(`${app.docker_image}:${app.docker_image_tag}`);
            const isWin = os.platform() === 'win32';
            child = spawn('docker', args, { shell: isWin });
          } else if (app.build_pack === 'github') {
            appendLog(`Initializing Nixpacks build for ${app.git_repo}...\n`);
            const buildDir = path.join(os.tmpdir(), `openfinder-build-${app.id}`);
            if (fs.existsSync(buildDir)) fs.rmSync(buildDir, { recursive: true, force: true });
            
            const imageName = `openfinder-app-${app.id}`;
            const hostRules = app.domains ? app.domains.split(',').map(d => `Host(\`${d.trim()}\`)`).join(' || ') : `Host(\`${app.id}.local\`)`;
            
            let envArgs = '';
            if (app.env_vars) {
              try {
                const parsedEnvs = JSON.parse(app.env_vars);
                envArgs = Object.entries(parsedEnvs).map(([k, v]) => `-e ${k}=${v}`).join(' ');
              } catch (e) {}
            }

            let portArgs = '';
            if (app.ports) {
              try {
                const parsedPorts = JSON.parse(app.ports);
                portArgs = parsedPorts.map((p) => `-p ${p.host}:${p.container}`).join(' ');
              } catch (e) {}
            }

            const cloneCmd = `git clone --depth 1 --branch ${app.git_branch || 'main'} ${app.git_repo} "${buildDir}"`;
            const buildCmd = `docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v "${buildDir}:/app" ghcr.io/railwayapp/nixpacks:latest build /app --name ${imageName}`;
            // Nixpacks automatically exposes the right port, but we add traefik routing
            const runCmd = `docker run -d --name ${app.id} --network openfinder-proxy -l "traefik.enable=true" -l "traefik.http.routers.${app.id}.rule=${hostRules}" -l "traefik.http.routers.${app.id}.entrypoints=web" ${envArgs} ${portArgs} ${imageName}`;
            
            const isWin = os.platform() === 'win32';
            // We use shell true to execute the chain
            const fullScript = `${cloneCmd} && ${buildCmd} && ${runCmd}`;
            child = spawn(fullScript, { shell: true });
            
          } else if (app.build_pack === 'dockercompose') {
            const dir = path.join(os.tmpdir(), `openfinder-docker-${app.id}`);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            
            let composeContent = app.compose_content || '';
            const firstDomain = app.domains ? app.domains.split(',')[0].trim() : `${app.id}.local`;
            
            // Inject dynamic variables for 1-click templates
            composeContent = composeContent.replace(/{{DOMAIN}}/g, firstDomain);
            composeContent = composeContent.replace(/{{APP_ID}}/g, app.id);
            
            // Automatically inject proxy network into compose if domains exist
            if (app.domains && !composeContent.includes('openfinder-proxy')) {
                appendLog(`Warning: Domains specified but compose file may not be attached to openfinder-proxy network.\n`);
            }
            
            const composePath = path.join(dir, 'docker-compose.yml');
            fs.writeFileSync(composePath, composeContent);
            appendLog(`Written compose file to ${composePath}\n`);
            const isWin = os.platform() === 'win32';
            child = spawn('docker', ['compose', '-f', composePath, '-p', app.id, 'up', '-d'], { shell: isWin });
          } else {
            throw new Error('Unsupported build_pack: ' + app.build_pack);
          }

          child.on('error', (err) => {
            appendLog(`Spawn Error: ${err.message}\nCheck if Docker is installed and running.\n`);
            updateDeployment(deploymentId, 'error', '');
            updateAppStatus(appId, 'error');
          });

          child.stdout.on('data', appendLog);
          child.stderr.on('data', appendLog);

          child.on('close', (code) => {
            if (code === 0) {
              appendLog(`Deployment successful.\n`);
              updateDeployment(deploymentId, 'success', '');
              updateAppStatus(appId, 'running');
            } else {
              appendLog(`Deployment failed with exit code ${code}.\n`);
              updateDeployment(deploymentId, 'error', '');
              updateAppStatus(appId, 'error');
            }
          });
        } catch (err) {
          appendLog(`ERROR: ${err.message}\n`);
          updateDeployment(deploymentId, 'error', '');
          updateAppStatus(appId, 'error');
        }
      });
    }, 1000); // 1s delay to allow client to connect to socket stream
  });

  server.post('/api/docker/apps/:id/stop', async (req, res) => {
    const { id: appId } = req.params;
    const { exec } = await import('child_process');
    const { getApp, updateAppStatus } = await import('./lib/docker-db.js');
    
    const app = getApp(appId);
    if (!app) return res.status(404).json({ error: 'App not found' });
    
    if (app.build_pack === 'dockerimage' || app.build_pack === 'database' || app.build_pack === 'github') {
      exec(`docker stop ${app.id} && docker rm ${app.id}`, (err) => {
        if (err) console.error('Stop error:', err);
        updateAppStatus(appId, 'stopped');
      });
    } else if (app.build_pack === 'dockercompose' || app.build_pack === 'template') {
      exec(`docker compose -p ${app.id} down`, (err) => {
        if (err) console.error('Stop error:', err);
        updateAppStatus(appId, 'stopped');
      });
    }
    res.status(200).json({ status: 'stopping' });
  });

  server.all('*', (req, res) => {
    return handle(req, res);
  });

  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
