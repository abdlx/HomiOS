import { describe, expect, it } from 'vitest';
import {
  appStoreStateLabel,
  appStoreStateTone,
  getInstallJobState,
  isActiveInstallJob,
} from '../../src/features/apps/state.ts';

describe('App Store lifecycle states', () => {
  it('distinguishes queued work from downloading', () => {
    expect(getInstallJobState({ status: 'queued' })).toBe('queued');
    expect(getInstallJobState({ status: 'running', progressData: { stage: 'downloading' } })).toBe('downloading');
  });

  it('distinguishes install configuration and deployment', () => {
    expect(getInstallJobState({ status: 'running', progressData: { stage: 'configuring_storage' } })).toBe('configuring');
    expect(getInstallJobState({ status: 'running', progressData: { stage: 'health_check' } })).toBe('deploying');
  });

  it('keeps failed and cancelled installs visible as errors', () => {
    expect(getInstallJobState({ status: 'failed' })).toBe('failed');
    expect(getInstallJobState({ status: 'cancelled' })).toBe('cancelled');
    expect(getInstallJobState({ status: 'completed' })).toBeNull();
  });

  it('labels redeploys separately and marks progress states consistently', () => {
    expect(isActiveInstallJob({ status: 'paused' })).toBe(true);
    expect(appStoreStateLabel('redeploying')).toBe('Redeploying');
    expect(appStoreStateTone('redeploying')).toBe('progress');
    expect(appStoreStateTone('error')).toBe('danger');
  });
});
