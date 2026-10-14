export type AppStoreDisplayState =
  | 'queued' | 'configuring' | 'starting' | 'stopping' | 'restarting' | 'failed' | 'cancelled'
  | 'downloading'
  | 'installing'
  | 'deploying'
  | 'redeploying'
  | 'running'
  | 'stopped'
  | 'unhealthy'
  | 'missing'
  | 'error'
  | 'unknown';

type InstallJobLike = {
  status?: string;
  progressData?: { stage?: string };
} | null | undefined;

const ACTIVE_JOB_STATUSES = new Set(['queued', 'running', 'paused']);

export function isActiveInstallJob(job: InstallJobLike) {
  return !!job?.status && ACTIVE_JOB_STATUSES.has(job.status);
}

export function getInstallJobState(job: InstallJobLike): AppStoreDisplayState | null {
  if (!job?.status) return null;
  if (job.status === 'failed' || job.status === 'cancelled') return job.status;
  if (job.status === 'queued') return 'queued';
  if (!isActiveInstallJob(job)) return null;

  const stage = job.progressData?.stage || '';
  if (stage === 'deploying' || stage === 'health_check') return 'deploying';
  if (stage === 'configuring' || stage === 'configuring_storage') return 'configuring';
  return 'downloading';
}

export function appStoreStateLabel(state: string) {
  const labels: Record<string, string> = {
    queued: 'Queued', configuring: 'Configuring', starting: 'Starting', stopping: 'Stopping', restarting: 'Restarting', failed: 'Failed', cancelled: 'Cancelled',
    downloading: 'Downloading',
    installing: 'Installing',
    deploying: 'Deploying',
    redeploying: 'Redeploying',
    running: 'Running',
    stopped: 'Stopped',
    unhealthy: 'Unhealthy',
    missing: 'Missing',
    error: 'Error',
    unknown: 'Unknown',
  };
  return labels[state] || state.replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase());
}

export function appStoreStateTone(state: string) {
  if (state === 'running') return 'success';
  if (['error', 'failed', 'missing', 'unhealthy'].includes(state)) return 'danger';
  if (['queued', 'configuring', 'starting', 'stopping', 'restarting', 'downloading', 'installing', 'deploying', 'redeploying'].includes(state)) return 'progress';
  return 'idle';
}
