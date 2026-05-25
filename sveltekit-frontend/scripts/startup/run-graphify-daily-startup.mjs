#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..', '..');
const LOG_DIR = resolve(ROOT, 'logs', 'task-output');
const STAMP = resolve(LOG_DIR, '.graphify-daily-last-run');
const COOLDOWN_SEC = 3600;

mkdirSync(LOG_DIR, { recursive: true });

const shouldSkip = existsSync(STAMP)
  ? (Date.now() - statSync(STAMP).mtimeMs) / 1000 < COOLDOWN_SEC
  : false;

if (shouldSkip) {
  const mins = Math.round((Date.now() - statSync(STAMP).mtimeMs) / 60000);
  console.log(`🗺️ graphify:daily skipped — last run ${mins} min ago (cooldown ${COOLDOWN_SEC / 60} min)`);
  process.exit(0);
}

const run = process.platform === 'win32'
  ? spawnSync(
      'cmd.exe',
      ['/d', '/s', '/c', 'npm run graphify:daily'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
      }
    )
  : spawnSync('npm', ['run', 'graphify:daily'], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
    });

const logPath = resolve(LOG_DIR, 'graphify-daily-startup.log');
const combined = `${run.stdout || ''}${run.stderr || ''}`.trim();
if (combined) {
  mkdirSync(LOG_DIR, { recursive: true });
  await import('node:fs').then(({ writeFileSync }) => writeFileSync(logPath, combined + '\n', 'utf8'));
}

if (run.status === 0) {
  await import('node:fs').then(({ writeFileSync }) => writeFileSync(STAMP, new Date().toISOString() + '\n', 'utf8'));
  console.log('🗺️ graphify:daily complete');
  process.exit(0);
}

const runError = run.error ? String(run.error.message ?? run.error) : '';
const exitBits = [
  combined || 'graphify:daily failed',
  runError ? `[spawn error] ${runError}` : '',
  typeof run.status === 'number' ? `[exit code] ${run.status}` : '',
  run.signal ? `[signal] ${run.signal}` : '',
].filter(Boolean);
console.error(exitBits.join('\n'));
process.exit(run.status ?? 1);
