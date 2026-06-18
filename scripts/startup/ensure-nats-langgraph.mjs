#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

function dockerDesktopRunning() {
  if (process.platform !== 'win32') {
    return false;
  }

  const res = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '$p = Get-Process -Name "Docker Desktop","com.docker.backend" -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { "running" }',
    ],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 1500,
    }
  );

  return String(res.stdout || '').includes('running');
}

if (!dockerDesktopRunning()) {
  console.warn('[nats-guard] WARN Docker Desktop is not running — skipping NATS + worker startup');
  process.exit(0);
}

console.log('[nats-guard] Docker Desktop detected — NATS + worker startup remains a separate lane');
process.exit(0);
