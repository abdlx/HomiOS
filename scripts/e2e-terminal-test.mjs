// E2E diagnostic: setup -> login -> socket.io terminal round-trip
import { io } from 'socket.io-client';

const BASE = 'http://localhost:3000';

async function main() {
  // 1. Try setup (may already be initialized)
  let cookie = null;
  const setupRes = await fetch(`${BASE}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.local', password: 'test12345' }),
  });
  console.log('setup:', setupRes.status, await setupRes.clone().text());
  if (setupRes.ok) {
    cookie = setupRes.headers.get('set-cookie')?.split(';')[0] ?? null;
  }

  // 2. Login if setup said already initialized
  if (!cookie) {
    const loginRes = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@test.local', password: 'test12345' }),
    });
    console.log('login:', loginRes.status, await loginRes.clone().text());
    cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? null;
  }

  if (!cookie) { console.log('FAIL: no session cookie obtained'); process.exit(1); }
  console.log('cookie:', cookie.slice(0, 30) + '...');

  // 3. Socket.IO terminal round-trip
  const socket = io(BASE, { extraHeaders: { Cookie: cookie } });
  let gotOutput = false;

  socket.on('connect', () => {
    console.log('socket connected:', socket.id);
    socket.emit('resize', { cols: 80, rows: 24 });
    setTimeout(() => socket.emit('input', 'echo TERMINAL_OK\r'), 500);
  });
  socket.on('output', (data) => {
    if (!gotOutput) { console.log('first output bytes:', JSON.stringify(String(data).slice(0, 80))); }
    gotOutput = true;
    if (String(data).includes('TERMINAL_OK')) {
      console.log('PASS: terminal round-trip works');
      socket.disconnect();
      process.exit(0);
    }
  });
  socket.on('disconnect', (reason) => console.log('socket disconnected:', reason));
  socket.on('connect_error', (err) => console.log('connect_error:', err.message));

  setTimeout(() => {
    console.log(gotOutput ? 'PARTIAL: output received but no echo match' : 'FAIL: no terminal output received');
    process.exit(gotOutput ? 0 : 1);
  }, 10000);
}

main().catch((e) => { console.error(e); process.exit(1); });
