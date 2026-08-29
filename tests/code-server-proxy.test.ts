import { describe, expect, it } from 'vitest';
import { isCodeServerPath, rewriteCodeServerUrl } from '../lib/code-server-proxy.ts';

describe('code-server proxy routing', () => {
  it('claims only the /code route namespace', () => {
    expect(isCodeServerPath('/code')).toBe(true);
    expect(isCodeServerPath('/code/')).toBe(true);
    expect(isCodeServerPath('/code/static/out.js')).toBe(true);
    expect(isCodeServerPath('/codex')).toBe(false);
    expect(isCodeServerPath('/code-server')).toBe(false);
  });

  it('strips the public prefix while preserving paths and query strings', () => {
    expect(rewriteCodeServerUrl('/code')).toBe('/');
    expect(rewriteCodeServerUrl('/code/')).toBe('/');
    expect(rewriteCodeServerUrl('/code/static/out.js?v=1')).toBe('/static/out.js?v=1');
  });
});
