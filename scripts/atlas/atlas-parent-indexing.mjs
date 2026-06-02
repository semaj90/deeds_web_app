#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const result = spawnSync(process.execPath, [path.join(root, 'scripts', 'atlas', 'build-all-lanes-parent-atlas.mjs'), ...args], {
  cwd: root,
  stdio: 'inherit',
  encoding: 'utf8',
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 0);
