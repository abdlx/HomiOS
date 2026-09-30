import { describe, expect, it, vi } from 'vitest';
import { scheduleHostPower } from '../lib/system-power.ts';

describe('host power command handoff', () => {
  it.each(['poweroff', 'reboot'] as const)('registers a delayed %s with systemd and waits for acceptance', async (action) => {
    const run = vi.fn(async () => ({}));
    await scheduleHostPower(action, { platform: 'linux', uid: 0, exists: () => true, run });
    expect(run).toHaveBeenCalledExactlyOnceWith('/usr/bin/systemd-run', [
      '--quiet', '--on-active=3s', '--timer-property=AccuracySec=1s', '/usr/bin/systemctl', action,
    ], { timeout: 10_000, windowsHide: true });
  });

  it('passes scheduling failures back to the API', async () => {
    const run = vi.fn(async () => { throw new Error('systemd refused the timer'); });
    await expect(scheduleHostPower('reboot', { platform: 'linux', uid: 0, exists: () => true, run })).rejects.toThrow('systemd refused the timer');
  });

  it('refuses a process that cannot control the host', async () => {
    const run = vi.fn();
    await expect(scheduleHostPower('poweroff', { platform: 'linux', uid: 1000, exists: () => true, run })).rejects.toThrow(/root-run/);
    expect(run).not.toHaveBeenCalled();
  });
});
