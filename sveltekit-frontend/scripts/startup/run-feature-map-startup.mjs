#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.resolve(ROOT, 'logs', 'task-output');
const TMP_DIR = path.resolve(ROOT, '.tmp');
const STATUS_PATH = path.resolve(TMP_DIR, 'feature-map-startup-status.json');
const STAMP = path.resolve(LOG_DIR, '.feature-map-smoke-last-run');
const COOLDOWN_SEC = 1800;

function minutesSince(filePath) {
  try {
    return Math.floor((Date.now() - fs.statSync(filePath).mtimeMs) / 60000);
  } catch {
    return null;
  }
}

function runSmoke() {
  const npmCmd = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm run feature:integrity:smoke'], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
      })
    : spawnSync('npm', ['run', 'feature:integrity:smoke'], {
        cwd: ROOT,
        encoding: 'utf8',
        shell: true,
      });

  const combined = `${npmCmd.stdout ?? ''}${npmCmd.stderr ?? ''}`.trim();
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(path.resolve(LOG_DIR, 'feature-map-startup.log'), combined || 'feature-map smoke produced no output', 'utf8');
  return { npmCmd, combined };
}

function writeStatus(status) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf8');
}

const mins = minutesSince(STAMP);
if (mins !== null && mins < COOLDOWN_SEC / 60) {
  console.log(`🧩 Feature-map smoke skipped — last run ${mins} min ago (cooldown ${COOLDOWN_SEC / 60} min)`);
  writeStatus({
    status: 'skipped',
    timestamp: new Date().toISOString(),
    reason: 'cooldown',
    lastRunMinutesAgo: mins,
    failedSubsystems: [],
  });
  process.exit(0);
}

const { npmCmd } = runSmoke();
const degraded = npmCmd.status !== 0;
const failedSubsystems = degraded ? ['featureMap'] : [];

writeStatus({
  status: degraded ? 'degraded' : 'ok',
  timestamp: new Date().toISOString(),
  failedSubsystems,
  smokeExitCode: npmCmd.status ?? 0,
});

if (!degraded) {
  fs.writeFileSync(STAMP, new Date().toISOString(), 'utf8');
  console.log('🧩 Feature-map smoke green');
  process.exit(0);
}

console.log('🧩 Feature-map smoke degraded — featureMap');
process.exit(0);
