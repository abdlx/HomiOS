import { describe, expect, it } from 'vitest';
import {
  appStoreStateLabel,
  appStoreStateTone,
  getInstallJobState,
  isActiveInstallJob,
} from '../../src/lib/app-store-state.ts';

describe('App Store lifecycle states', () => {
  it('shows queued and early install work as downloading', () => {
    expect(getInstallJobState({ status: 'queued' })).toBe('downloading');
    expect(getInstallJobState({ status: 'running', progressData: { stage: 'downloading' } })).toBe('downloading');
  });

  it('distinguishes install configuration and deployment', () => {
    expect(getInstallJobState({ status: 'running', progressData: { stage: 'configuring_storage' } })).toBe('installing');
    expect(getInstallJobState({ status: 'running', progressData: { stage: 'health_check' } })).toBe('deploying');
  });

  it('keeps failed and cancelled installs visible as errors', () => {
    expect(getInstallJobState({ status: 'failed' })).toBe('error');
    expect(getInstallJobState({ status: 'cancelled' })).toBe('error');
    expect(getInstallJobState({ status: 'completed' })).toBeNull();
  });

  it('labels redeploys separately and marks progress states consistently', () => {
    expect(isActiveInstallJob({ status: 'paused' })).toBe(true);
    expect(appStoreStateLabel('redeploying')).toBe('Redeploying');
    expect(appStoreStateTone('redeploying')).toBe('progress');
    expect(appStoreStateTone('error')).toBe('danger');
  });
});
