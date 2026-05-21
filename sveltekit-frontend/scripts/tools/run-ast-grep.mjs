#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, 'run-ast-grep.ps1');
const args = process.argv.slice(2);

const pwsh = process.env.PWSH || process.env.POWERSHELL || 'pwsh';
const result = spawnSync(
  pwsh,
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
  { stdio: 'inherit', windowsHide: true }
);

if (result.error) {
  const fallback = spawnSync(
    'powershell',
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
    { stdio: 'inherit', windowsHide: true }
  );
  if (fallback.error) {
    console.error(`[run-ast-grep] failed to launch pwsh/powershell: ${fallback.error.message}`);
    process.exit(1);
  }
  process.exit(fallback.status ?? 1);
}

process.exit(result.status ?? 1);
