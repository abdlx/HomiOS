import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const installer = readFileSync(new URL('../install.sh', import.meta.url), 'utf8');

describe('installer component policy', () => {
  it('always installs and enables Code Server', () => {
    expect(installer).toContain('Installing required Code Server component');
    expect(installer).toContain('curl -fsSL https://code-server.dev/install.sh | sh');
    expect(installer).toContain('Description=Code Server');
    expect(installer).toContain('systemctl enable code-server --quiet');
    expect(installer).toContain('CODE_SERVER_ENABLED=true');
  });

  it('does not offer or install Codex or Immich', () => {
    expect(installer).not.toMatch(/codex/i);
    expect(installer).not.toMatch(/immich/i);
  });
});
