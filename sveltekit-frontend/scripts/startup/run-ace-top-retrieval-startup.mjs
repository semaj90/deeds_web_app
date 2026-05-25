#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.resolve(ROOT, 'logs', 'task-output');
const TMP_DIR = path.resolve(ROOT, '.tmp');
const STATUS_PATH = path.resolve(TMP_DIR, 'ace-top-retrieval-status.json');
const STAMP = path.resolve(LOG_DIR, '.ace-top-retrieval-smoke-last-run');
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
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm run ace:retrieval-top-cache:smoke'], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
      })
    : spawnSync('npm', ['run', 'ace:retrieval-top-cache:smoke'], {
        cwd: ROOT,
        encoding: 'utf8',
        shell: true,
      });

  const combined = `${npmCmd.stdout ?? ''}${npmCmd.stderr ?? ''}`.trim();
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(path.resolve(LOG_DIR, 'ace-top-retrieval-startup.log'), combined || 'ace retrieval top-N smoke produced no output', 'utf8');
  return { npmCmd, combined };
}

function writeStatus(status) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf8');
}

const mins = minutesSince(STAMP);
if (mins !== null && mins < COOLDOWN_SEC / 60) {
  console.log(`🧠 ACE top-retrieval smoke skipped — last run ${mins} min ago (cooldown ${COOLDOWN_SEC / 60} min)`);
  writeStatus({
    status: 'skipped',
    timestamp: new Date().toISOString(),
    reason: 'cooldown',
    lastRunMinutesAgo: mins,
    failedSubsystems: [],
  });
  process.exit(0);
}

const { npmCmd, combined } = runSmoke();
let redisOk = false;
let snapshotExists = false;
try {
  const parsed = JSON.parse(combined.slice(combined.indexOf('{')));
  redisOk = Boolean(parsed.redisOk);
  snapshotExists = Boolean(parsed.snapshotExists);
} catch {
  // ignore parse issues and fall back to exit code
}

const degraded = npmCmd.status !== 0 || !redisOk || !snapshotExists;
const failedSubsystems = [];
if (!redisOk) failedSubsystems.push('redis');
if (!snapshotExists) failedSubsystems.push('snapshot');

writeStatus({
  status: degraded ? 'degraded' : 'ok',
  timestamp: new Date().toISOString(),
  redisOk,
  snapshotExists,
  failedSubsystems,
  smokeExitCode: npmCmd.status ?? 0,
});

if (!degraded) {
  fs.writeFileSync(STAMP, new Date().toISOString(), 'utf8');
  console.log('🧠 ACE top-retrieval smoke green');
  process.exit(0);
}

console.log(`🧠 ACE top-retrieval smoke degraded — ${failedSubsystems.join(', ') || 'unknown'}`);
process.exit(0);
