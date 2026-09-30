import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockReq, mockRes } from './helpers.ts';
import { createSession, createUserWithPasswordHash, hashPassword } from '../lib/auth.ts';
import { withTransaction } from '../lib/db.ts';
import { resetRateLimits } from '../lib/request-security.ts';

vi.mock('../lib/system-power.ts', () => ({ scheduleHostPower: vi.fn() }));

import powerHandler from '../pages/api/system/power.ts';
import { scheduleHostPower } from '../lib/system-power.ts';

let adminSession: string;
let memberSession: string;

beforeAll(async () => {
  const passwordHash = await hashPassword('correct-password');
  const adminId = withTransaction((db) => createUserWithPasswordHash(db, 'admin@homios.test', passwordHash, { isAdmin: true }));
  const memberId = withTransaction((db) => createUserWithPasswordHash(db, 'member@homios.test', passwordHash));
  adminSession = createSession(adminId);
  memberSession = createSession(memberId);
});

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimits();
});

describe('host power API', () => {
  it('requires an authenticated instance admin', async () => {
    const anonymous = mockRes();
    await powerHandler(mockReq({ method: 'POST', body: { action: 'reboot', password: 'correct-password' } }), anonymous);
    expect(anonymous.statusCode).toBe(401);

    const member = mockRes();
    await powerHandler(mockReq({ method: 'POST', sessionId: memberSession, body: { action: 'reboot', password: 'correct-password' } }), member);
    expect(member.statusCode).toBe(403);
    expect(scheduleHostPower).not.toHaveBeenCalled();
  });

  it('rejects wrong passwords and invalid actions without scheduling a command', async () => {
    const wrongPassword = mockRes();
    await powerHandler(mockReq({ method: 'POST', sessionId: adminSession, body: { action: 'reboot', password: 'wrong' } }), wrongPassword);
    expect(wrongPassword.statusCode).toBe(401);

    const invalidAction = mockRes();
    await powerHandler(mockReq({ method: 'POST', sessionId: adminSession, body: { action: 'restart-app', password: 'correct-password' } }), invalidAction);
    expect(invalidAction.statusCode).toBe(400);
    expect(scheduleHostPower).not.toHaveBeenCalled();
  });

  it.each(['reboot', 'poweroff'] as const)('schedules %s only after the current admin password is verified', async (action) => {
    const res = mockRes();
    await powerHandler(mockReq({ method: 'POST', sessionId: adminSession, body: { action, password: 'correct-password' } }), res);
    expect(res.statusCode).toBe(202);
    expect(scheduleHostPower).toHaveBeenCalledExactlyOnceWith(action);
  });

  it('limits repeated password attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await powerHandler(mockReq({ method: 'POST', sessionId: adminSession, body: { action: 'reboot', password: 'wrong' } }), mockRes());
    }
    const res = mockRes();
    await powerHandler(mockReq({ method: 'POST', sessionId: adminSession, body: { action: 'reboot', password: 'correct-password' } }), res);
    expect(res.statusCode).toBe(429);
    expect(scheduleHostPower).not.toHaveBeenCalled();
  });

  it('reports when host controls are unavailable', async () => {
    vi.mocked(scheduleHostPower).mockImplementationOnce(() => { throw new Error('unsupported'); });
    const res = mockRes();
    await powerHandler(mockReq({ method: 'POST', sessionId: adminSession, body: { action: 'reboot', password: 'correct-password' } }), res);
    expect(res.statusCode).toBe(503);
  });
});
