#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const finalArgs = ['--tier', '3', ...args.filter((arg) => arg !== '--write')];
if (!args.includes('--write')) finalArgs.push('--dry-run');

const script = resolve(process.cwd(), 'sveltekit-frontend/scripts/generate-file-summaries.mjs');
const result = spawnSync(process.execPath, [script, ...finalArgs], { stdio: 'inherit' });
process.exit(result.status ?? 0);
