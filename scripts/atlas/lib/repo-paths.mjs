#!/usr/bin/env node

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function resolveAtlasPaths(importMetaUrl) {
  const __dirname = dirname(fileURLToPath(importMetaUrl));
  const repoRoot = resolve(__dirname, '../..');
  const frontendRoot = resolve(repoRoot, 'sveltekit-frontend');
  const frontendTmpRoot = resolve(frontendRoot, '.tmp');
  const frontendReportsRoot = resolve(frontendRoot, 'docs', 'reports');
  return { __dirname, repoRoot, frontendRoot, frontendTmpRoot, frontendReportsRoot };
}
