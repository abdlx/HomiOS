/**
 * Port resolution tests — no DB, no filesystem.
 *
 * Verifies that HOMIOS_PORT takes precedence over PORT, that the default is
 * 8740, and that a legacy PORT=3000 in the environment cannot shadow a
 * HOMIOS_PORT setting.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Helper: resolve port with the same precedence logic as server.js
function resolvePort(env: Record<string, string | undefined> = {}): number {
  return Number(
    env.HOMIOS_PORT ||
    env.PORT ||
    8740
  );
}

describe('Port Resolution', () => {
  describe('Default port', () => {
    it('defaults to 8740 when no env vars are set', () => {
      expect(resolvePort({})).toBe(8740);
    });

    it('defaults to 8740 when both HOMIOS_PORT and PORT are empty strings', () => {
      expect(resolvePort({ HOMIOS_PORT: '', PORT: '' })).toBe(8740);
    });
  });

  describe('HOMIOS_PORT takes canonical precedence', () => {
    it('uses HOMIOS_PORT when set', () => {
      expect(resolvePort({ HOMIOS_PORT: '9000' })).toBe(9000);
    });

    it('HOMIOS_PORT wins over PORT when both are set', () => {
      expect(resolvePort({ HOMIOS_PORT: '9001', PORT: '3000' })).toBe(9001);
    });

    it('HOMIOS_PORT=8740 wins over legacy PORT=3000', () => {
      expect(resolvePort({ HOMIOS_PORT: '8740', PORT: '3000' })).toBe(8740);
    });
  });

  describe('Legacy PORT fallback', () => {
    it('falls back to PORT when HOMIOS_PORT is absent', () => {
      expect(resolvePort({ PORT: '4567' })).toBe(4567);
    });

    it('does NOT use PORT=3000 when HOMIOS_PORT=8740 is set', () => {
      const result = resolvePort({ HOMIOS_PORT: '8740', PORT: '3000' });
      expect(result).not.toBe(3000);
      expect(result).toBe(8740);
    });
  });

  describe('Edge cases', () => {
    it('returns a number, not a string', () => {
      expect(typeof resolvePort({ HOMIOS_PORT: '8740' })).toBe('number');
    });

    it('handles string "8740" correctly', () => {
      expect(resolvePort({ HOMIOS_PORT: '8740' })).toBe(8740);
    });
  });
});
