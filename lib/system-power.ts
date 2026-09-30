import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

export type HostPowerAction = 'poweroff' | 'reboot';

const SYSTEMCTL = '/usr/bin/systemctl';
const SYSTEMD_RUN = '/usr/bin/systemd-run';
const execFileAsync = promisify(execFile);

type PowerRuntime = {
  platform: NodeJS.Platform;
  uid: number | undefined;
  exists: (path: string) => boolean;
  run: (file: string, args: string[], options: { timeout: number; windowsHide: boolean }) => Promise<unknown>;
};

/** Ask PID 1 to run the command after the HTTP response has reached the browser. */
export async function scheduleHostPower(action: HostPowerAction, runtime: PowerRuntime = {
  platform: process.platform,
  uid: process.getuid?.(),
  exists: fs.existsSync,
  run: execFileAsync,
}): Promise<void> {
  if (runtime.platform !== 'linux' || runtime.uid !== 0 || !runtime.exists(SYSTEMCTL) || !runtime.exists(SYSTEMD_RUN)) {
    throw new Error('Host power controls require a root-run Linux systemd installation');
  }

  // The transient timer belongs to systemd, so it survives the HomiOS process
  // being stopped during shutdown. execFile rejects if systemd refuses it.
  await runtime.run(SYSTEMD_RUN, [
    '--quiet',
    '--on-active=3s',
    '--timer-property=AccuracySec=1s',
    SYSTEMCTL,
    action,
  ], { timeout: 10_000, windowsHide: true });
}
