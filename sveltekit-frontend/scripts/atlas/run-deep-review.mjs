#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, alignCwdToRepoRoot } from '../_repo-root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const steps = [
  ['discover-code-index-owners.mjs', []],
  ['build-runtime-owner-inventory.mjs', []],
  ['build-syntax-chunks.mjs', []],
  ['index-code-768.mjs', ['--dry-run']],
];

const continueOnError = process.argv.includes('--continueOnError');

alignCwdToRepoRoot();

for (const [scriptName, args] of steps) {
  const scriptPath = path.resolve(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });

  process.stdout.write(result.stdout ?? '');
  process.stderr.write(result.stderr ?? '');

  if ((result.status ?? 1) !== 0 && !continueOnError) {
    process.exitCode = result.status ?? 1;
    break;
  }
}
