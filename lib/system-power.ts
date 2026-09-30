import fs from 'fs';
import { spawn } from 'child_process';

export type HostPowerAction = 'poweroff' | 'reboot';

const SYSTEMCTL = '/usr/bin/systemctl';

/** Give the HTTP response time to reach the browser before systemd stops HomiOS. */
export function scheduleHostPower(action: HostPowerAction): void {
  if (process.platform !== 'linux' || process.getuid?.() !== 0 || !fs.existsSync(SYSTEMCTL)) {
    throw new Error('Host power controls require a root-run Linux systemd installation');
  }

  setTimeout(() => {
    const child = spawn(SYSTEMCTL, ['--no-block', action], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', (error) => console.error(`[system-power] ${action} failed:`, error));
    child.on('exit', (code) => {
      if (code !== 0) console.error(`[system-power] ${action} exited with code ${code}`);
    });
    child.unref();
  }, 1000).unref();
}
