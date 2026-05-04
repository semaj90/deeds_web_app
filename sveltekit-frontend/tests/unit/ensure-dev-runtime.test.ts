// @vitest-environment node

import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('ensure-dev-runtime', () => {
  it('accepts the current frontend install with cross-env present', () => {
    const frontendRoot = path.resolve(process.cwd());

    const result = spawnSync(process.execPath, ['scripts/ensure-dev-runtime.mjs', 'dev'], {
      cwd: frontendRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain('Cannot run npm run dev');
  });
});