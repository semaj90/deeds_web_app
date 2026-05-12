/**
 * Legacy wrapper for the FeatureMap compiler smoke test.
 * Delegates to the maintained TypeScript implementation.
 */

import { spawnSync } from 'node:child_process';

const npmBin = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npmBin, ['tsx', 'scripts/smoke-feature-map-compiler.ts'], {
  stdio: 'inherit',
  shell: false,
});

process.exit(result.status ?? 1);
