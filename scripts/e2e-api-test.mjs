// Smoke test: core HomiOS API surface.
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
  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'test12345' }),
  });
  cookie = login.headers.get('set-cookie')?.split(';')[0] ?? '';
  console.log('login:', login.status, cookie ? 'cookie OK' : 'NO COOKIE');
  if (!cookie) process.exit(1);

  console.log('\n-- users/teams --');
  await api('GET', '/api/users');
  const teams = await api('GET', '/api/teams');
  const teamId = teams.activeTeamId;
  console.log('  activeTeam:', teamId);
  await api('POST', '/api/teams', { name: 'Production Team' }, 201);
  await api('GET', `/api/teams/${teamId}/members`);
  await api('POST', `/api/teams/${teamId}/members`, { email: 'dev@test.local', role: 'member' }, 201);

  console.log('\n-- api tokens --');
  const tok = await api('POST', '/api/tokens', { name: 'ci', abilities: ['read'] }, 201);
  await api('GET', '/api/tokens');
  const bearerRes = await fetch(`${BASE}/api/users`, { headers: { Authorization: `Bearer ${tok.token}` } });
  console.log(bearerRes.status === 200 ? '  PASS bearer token auth' : `  FAIL bearer token auth -> ${bearerRes.status}`);
  bearerRes.status === 200 ? pass++ : fail++;
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
  await api('GET', '/api/servers');
  await api('POST', '/api/servers', { name: 'remote-1', ip: '203.0.113.10', privateKeyId: key.id }, 201);
  const servers2 = await api('GET', '/api/servers');
  const remote = servers2.find((s) => s.name === 'remote-1');
  await api('PATCH', `/api/servers/${remote.id}`, { description: 'staging box' });
  await api('DELETE', `/api/servers/${remote.id}`, {});

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

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
