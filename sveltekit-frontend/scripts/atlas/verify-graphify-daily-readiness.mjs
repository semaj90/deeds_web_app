#!/usr/bin/env node
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REPO_ROOT, alignCwdToRepoRoot } from '../_repo-root.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requiredScripts = [
  'discover-code-index-owners.mjs',
  'build-runtime-owner-inventory.mjs',
  'build-syntax-chunks.mjs',
  'langextract-code-enrich.py',
  'index-code-768.mjs',
  'run-deep-review.mjs',
];

alignCwdToRepoRoot();

const missing = requiredScripts.filter((scriptName) => !existsSync(path.resolve(__dirname, scriptName)));

const summary = {
  missing,
  ready: missing.length === 0,
  repo_root: REPO_ROOT,
  required_scripts: requiredScripts,
};

console.log(JSON.stringify(summary, null, 2));

if (missing.length > 0) {
  process.exitCode = 1;
}
