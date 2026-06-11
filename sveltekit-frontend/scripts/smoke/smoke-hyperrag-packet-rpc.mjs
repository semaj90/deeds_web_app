#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const runner = path.join(__dirname, 'smoke-hyperrag-packet-rpc-runner.ts');

const args = process.argv.slice(2);
const child = spawnSync('npx', ['tsx', runner, ...args], {
  cwd: repoRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: process.env,
});

process.exit(child.status ?? 1);
