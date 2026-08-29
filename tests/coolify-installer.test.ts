import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';

const up = readFileSync(new URL('../scripts/coolify-up.sh', import.meta.url), 'utf8');
const down = readFileSync(new URL('../scripts/coolify-down.sh', import.meta.url), 'utf8');
const override = readFileSync(new URL('../deploy/coolify/docker-compose.homios.yml', import.meta.url), 'utf8');

describe('managed Coolify deployment', () => {
  it('downloads pinned official deployment artifacts instead of building vendored source', () => {
    expect(up).toContain('COOLIFY_VERSION="${COOLIFY_VERSION:-4.1.2}"');
    expect(up).toContain('raw.githubusercontent.com/coollabsio/coolify/v${COOLIFY_VERSION}');
    expect(up).toContain('download_artifact "docker-compose.yml"');
    expect(up).toContain('download_artifact "docker-compose.prod.yml"');
    expect(up).toContain('download_artifact ".env.production"');
    expect(up).toContain('set_env_value "LATEST_IMAGE" "$COOLIFY_VERSION"');
    expect(up).not.toContain('COOLIFY_BUILD_LOCAL');
    expect(up).not.toContain('docker build');
    expect(up).not.toContain('COOLIFY_SOURCE_DIR');
  });

  it('uses official files and the HomiOS storage override for lifecycle operations', () => {
    for (const script of [up, down]) {
      expect(script).toContain('docker-compose.yml');
      expect(script).toContain('docker-compose.prod.yml');
      expect(script).toContain('docker-compose.homios.yml');
    }
    expect(up).toContain('up -d --pull always --remove-orphans --force-recreate');
    expect(up).toContain('sed -i "s|/data/coolify|$COOLIFY_DATA_DIR|g"');
    expect(override).toContain('${HOMIOS_STORAGE_ROOT:-/mnt/homios-storage}');
    expect(override).toContain('target: /mnt/homios-storage');
  });
});
