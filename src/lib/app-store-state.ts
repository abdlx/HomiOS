export type AppStoreDisplayState =
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
  if (job.status === 'failed' || job.status === 'cancelled') return 'error';
  if (!isActiveInstallJob(job)) return null;

  const stage = job.progressData?.stage || '';
  if (stage === 'deploying' || stage === 'health_check') return 'deploying';
  if (stage === 'configuring' || stage === 'configuring_storage') return 'installing';
  return 'downloading';
}

export function appStoreStateLabel(state: string) {
  const labels: Record<string, string> = {
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
  if (state === 'error' || state === 'missing' || state === 'unhealthy') return 'danger';
  if (state === 'downloading' || state === 'installing' || state === 'deploying' || state === 'redeploying') return 'progress';
  return 'idle';
}
