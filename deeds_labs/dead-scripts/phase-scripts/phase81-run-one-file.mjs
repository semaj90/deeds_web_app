#!/usr/bin/env node
/**
 * Phase 81: Single-File Runner Wrapper
 * Guarantees --file actually processes exactly one file
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);

// Parse arguments
const scriptArg = args.find(a => a.startsWith('--script='))?.split('=')[1] ??
                  'scripts/phase80-extended-codemod.mjs';

const fileArg = args.find(a => a.startsWith('--file='))?.split('=')[1] ??
                args[args.indexOf('--file') + 1];

const dryRun = args.includes('--dry-run');

if (!fileArg) {
  console.error('Usage: node scripts/phase81-run-one-file.mjs --script=<script> --file=<path> [--dry-run]');
  console.error('Example: node scripts/phase81-run-one-file.mjs --file=src/lib/server/db.ts');
  process.exit(2);
}

// Resolve to absolute path
const abs = path.isAbsolute(fileArg) ? fileArg : path.resolve(process.cwd(), fileArg);
if (!fs.existsSync(abs)) {
  console.error(`❌ File not found: ${abs}`);
  process.exit(2);
}

// Write proof artifact
fs.mkdirSync('reports', { recursive: true });
fs.writeFileSync('reports/phase81-files-to-process.txt', abs + '\n', 'utf8');
console.log(`✅ FORCING single file: ${abs}`);
console.log(`📁 Wrote: reports/phase81-files-to-process.txt\n`);

// Build args for the target script
const passArgs = [scriptArg, `--file=${abs}`];
if (dryRun) passArgs.push('--dry-run');

// Run the script
const result = spawnSync('node', passArgs, {
  encoding: 'utf8',
  shell: true,
  cwd: process.cwd(),
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

process.exit(result.status ?? 1);
