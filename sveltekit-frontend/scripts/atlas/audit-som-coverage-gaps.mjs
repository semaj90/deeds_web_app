#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'atlas', 'audit-som-coordinate-coverage.mjs'), ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: 'inherit',
  encoding: 'utf8',
});

process.exit(result.status ?? 1);
