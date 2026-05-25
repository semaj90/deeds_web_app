#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.resolve(ROOT, 'logs', 'task-output');
const TMP_DIR = path.resolve(ROOT, '.tmp');
const STATUS_PATH = path.resolve(TMP_DIR, 'ace-startup-status.json');
const STAMP = path.resolve(LOG_DIR, '.ace-context-pack-smoke-last-run');
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
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm run ace:context-pack:smoke'], {
        cwd: ROOT,
        encoding: 'utf8',
        windowsHide: true,
      })
    : spawnSync('npm', ['run', 'ace:context-pack:smoke'], {
        cwd: ROOT,
        encoding: 'utf8',
        shell: true,
      });

  const combined = `${npmCmd.stdout ?? ''}${npmCmd.stderr ?? ''}`.trim();
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(path.resolve(LOG_DIR, 'ace-context-pack-startup.log'), combined || 'ace-context-pack smoke produced no output', 'utf8');
  return npmCmd;
}

function parseSmokeReport(output) {
  const lines = String(output || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trimStart().startsWith('{'));
  if (start < 0) return null;
  const jsonText = lines.slice(start).join('\n');
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

function probePostgres() {
  const candidates = ['legal-ai-postgres', 'deeds-postgres-prod', 'phase66-postgres'];
  for (const container of candidates) {
    const inspect = spawnSync('docker', ['inspect', '--format', '{{.State.Status}}', container], {
      encoding: 'utf8',
      windowsHide: true,
    });
    if (inspect.status !== 0) continue;
    const status = String(inspect.stdout || '').trim();
    if (status !== 'running') continue;

    const probe = spawnSync('docker', ['exec', container, 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-tAc', 'SELECT 1'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return {
      ok: probe.status === 0,
      container,
      output: String(probe.stdout || probe.stderr || '').trim(),
    };
  }
  return { ok: false, container: null, output: 'no postgres container matched' };
}

function writeStatus(status) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2), 'utf8');
}

const mins = minutesSince(STAMP);
if (mins !== null && mins < COOLDOWN_SEC / 60) {
  console.log(`🧠 ACE context pack smoke skipped — last run ${mins} min ago (cooldown ${COOLDOWN_SEC / 60} min)`);
  writeStatus({
    status: 'skipped',
    timestamp: new Date().toISOString(),
    reason: 'cooldown',
    lastRunMinutesAgo: mins,
    failedSubsystems: [],
  });
  process.exit(0);
}

const result = runSmoke();
const report = parseSmokeReport(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
const postgres = probePostgres();
const failedSubsystems = [];

if (!postgres.ok) failedSubsystems.push('postgres');
if (!report?.redisOk) failedSubsystems.push('redis');
if (!report?.snapshotExists) failedSubsystems.push('snapshot');
if (!report?.tscDiagnostics || !report.tscDiagnostics.rawOutputPath) failedSubsystems.push('tscDiagnostics');

const degraded = result.status !== 0 || failedSubsystems.length > 0;

writeStatus({
  status: degraded ? 'degraded' : 'ok',
  timestamp: new Date().toISOString(),
  cacheKey: report?.cacheKey ?? null,
  snapshotPath: report?.snapshotPath ?? null,
  redisOk: Boolean(report?.redisOk),
  postgresOk: postgres.ok,
  snapshotExists: Boolean(report?.snapshotExists),
  tscDiagnostics: report?.tscDiagnostics ?? null,
  failedSubsystems,
  smokeExitCode: result.status ?? 0,
  postgresContainer: postgres.container,
  postgresOutput: postgres.output,
});

if (!degraded) {
  fs.writeFileSync(STAMP, new Date().toISOString(), 'utf8');
  console.log('🧠 ACE context pack smoke green');
  process.exit(0);
}

console.log(`🧠 ACE context pack smoke degraded — ${failedSubsystems.join(', ') || 'unknown'}`);
process.exit(0);
