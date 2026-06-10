// Smoke test: every new Coolify-parity API surface.
const BASE = 'http://localhost:3000';
let cookie = '';
let pass = 0, fail = 0;

async function api(method, path, body, expect = 200) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  const ok = Array.isArray(expect) ? expect.includes(res.status) : res.status === expect;
  if (ok) { pass++; console.log(`  PASS ${method} ${path} -> ${res.status}`); }
  else { fail++; console.log(`  FAIL ${method} ${path} -> ${res.status} (wanted ${expect}): ${String(text).slice(0, 200)}`); }
  return json;
}

async function main() {
  // login (user created by terminal e2e)
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'test12345' }),
  });
  cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  console.log('login:', login.status, cookie ? 'cookie OK' : 'NO COOKIE');
  if (!cookie) process.exit(1);

  console.log('\n-- users/teams --');
  const me = await api('GET', '/api/users');
  const teams = await api('GET', '/api/teams');
  const teamId = teams.activeTeamId;
  console.log('  activeTeam:', teamId);
  await api('POST', '/api/teams', { name: 'Production Team' }, 201);
  const members = await api('GET', `/api/teams/${teamId}/members`);
  await api('POST', `/api/teams/${teamId}/members`, { email: 'dev@test.local', role: 'member' }, 201);

  console.log('\n-- api tokens --');
  const tok = await api('POST', '/api/tokens', { name: 'ci', abilities: ['read', 'deploy'] }, 201);
  await api('GET', '/api/tokens');
  // Bearer auth check
  const bearerRes = await fetch(`${BASE}/api/users`, { headers: { Authorization: `Bearer ${tok.token}` } });
  console.log(bearerRes.status === 200 ? '  PASS bearer token auth' : `  FAIL bearer token auth -> ${bearerRes.status}`);
  bearerRes.status === 200 ? pass++ : fail++;
  // Bearer ability gate: write should be denied for read+deploy token
  const denied = await fetch(`${BASE}/api/tokens`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok.token}` },
    body: JSON.stringify({ name: 'x', abilities: ['read'] }),
  });
  console.log(denied.status === 403 ? '  PASS ability gate (403 for missing write)' : `  FAIL ability gate -> ${denied.status}`);
  denied.status === 403 ? pass++ : fail++;

  console.log('\n-- 2FA --');
  await api('GET', '/api/auth/2fa');
  const init = await api('POST', '/api/auth/2fa', { action: 'init' });
  console.log('  totp secret len:', (init.secret || '').length, 'qr:', (init.qrDataUrl || '').slice(0, 30));

  console.log('\n-- ssh keys + servers --');
  const key = await api('POST', '/api/security/keys', { name: 'test-key', generate: true }, 201);
  console.log('  publicKey:', (key.publicKey || '').slice(0, 40));
  await api('GET', '/api/security/keys');
  await api('POST', '/api/servers', { localhost: true, name: 'Local Server' }, 201);
  const servers = await api('GET', '/api/servers');
  await api('POST', '/api/servers', { name: 'remote-1', ip: '203.0.113.10', privateKeyId: key.id }, 201);
  const servers2 = await api('GET', '/api/servers');
  const remote = servers2.find((s) => s.name === 'remote-1');
  await api('PATCH', `/api/servers/${remote.id}`, { description: 'staging box' });
  await api('DELETE', `/api/servers/${remote.id}`, {});

  console.log('\n-- projects/apps + env scoping --');
  const proj = await api('POST', '/api/docker/projects', { name: 'smoke-proj' }, 201);
  await api('POST', '/api/env-vars', { scopeType: 'team', scopeId: teamId, key: 'GLOBAL_VAR', value: 'team-level' }, 201);
  await api('POST', '/api/env-vars', { scopeType: 'project', scopeId: proj.id, key: 'PROJ_VAR', value: 'proj-level' }, 201);
  await api('GET', `/api/env-vars?scopeType=project&scopeId=${proj.id}`);
  const app = await api('POST', `/api/docker/projects/${proj.id}/apps`, {
    name: 'smoke-app', build_pack: 'dockerimage', docker_image: 'nginx', docker_image_tag: 'alpine',
    ports: '8085:80',
  }, 201);
  await api('POST', '/api/env-vars', { scopeType: 'app', scopeId: app.id, key: 'APP_VAR', value: 'app-level' }, 201);

  console.log('\n-- scheduled tasks + backup schedule --');
  await api('POST', `/api/docker/apps/${app.id}/scheduled-tasks`, { name: 'cleanup', command: 'echo hi', frequency: '0 3 * * *' }, 201);
  await api('GET', `/api/docker/apps/${app.id}/scheduled-tasks`);
  await api('POST', `/api/docker/apps/${app.id}/scheduled-tasks`, { name: 'bad', command: 'x', frequency: 'not-cron' }, 400);
  await api('POST', `/api/docker/apps/${app.id}/backup-schedule`, { frequency: '0 4 * * *', retention: 5 }, 201);
  await api('GET', `/api/docker/apps/${app.id}/backup-schedule`);

  console.log('\n-- notifications --');
  await api('GET', `/api/teams/${teamId}/notifications`);
  await api('PATCH', `/api/teams/${teamId}/notifications`, { channel: 'discord', enabled: true, config: { webhookUrl: 'https://discord.com/api/webhooks/test' } });
  await api('PATCH', `/api/teams/${teamId}/notifications`, { channel: 'nope' }, 400);

  console.log('\n-- s3 storages --');
  const s3 = await api('POST', '/api/storage/s3', { name: 'minio', bucket: 'backups', endpoint: 'http://localhost:9000', accessKey: 'ak', secretKey: 'sk' }, 201);
  await api('GET', '/api/storage/s3');
  await api('DELETE', '/api/storage/s3', { id: s3.id });

  console.log('\n-- shares (samba) --');
  await api('GET', '/api/shares');
  await api('POST', '/api/shares/users', { username: 'smbtest', password: 'pass1234' }, 201);
  await api('GET', '/api/shares/users');
  await api('POST', '/api/shares', { name: 'media', path: '/srv/media' }, 201);

  console.log('\n-- audit --');
  const audit = await api('GET', '/api/audit');
  console.log('  audit entries:', Array.isArray(audit) ? audit.length : audit);

  console.log('\n-- cleanup app --');
  await api('DELETE', `/api/docker/apps/${app.id}`, {}, [200, 204]);

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
