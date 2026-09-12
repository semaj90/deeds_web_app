#!/usr/bin/env node

/** Read-only guard for targeted Docker rebuilds. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const frontendRoot = path.join(root, 'sveltekit-frontend');
const reportPath = path.join(root, 'docs', 'reports', 'docker-rebuild-preflight-v1.json');
const blockers = [];
const warnings = [];

function command(name, args = []) {
  try { return execFileSync(name, args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch { return null; }
}
function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}
function isAlive(pid) {
  try { process.kill(Number(pid), 0); return Number(pid) > 0; } catch { return false; }
}
function listeningPid(port) {
  if (process.platform !== 'win32') return null;
  const script = `(Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty OwningProcess)`;
  const value = command('powershell.exe', ['-NoProfile', '-Command', script]);
  const pid = Number(value);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

const gitLockPath = path.join(root, '.git', 'index.lock');
const gitLockPresent = fs.existsSync(gitLockPath);
const gitLockStats = gitLockPresent ? (() => {
  try {
    const stats = fs.statSync(gitLockPath);
    return { sizeBytes: stats.size, ageSeconds: Math.max(0, (Date.now() - stats.mtimeMs) / 1000) };
  } catch { return null; }
})() : null;
const gitProcessCount = process.platform === 'win32'
  ? Number(command('powershell.exe', ['-NoProfile', '-Command',
    "(Get-CimInstance Win32_Process -Filter \"Name = 'git.exe'\" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -notmatch 'fsmonitor--daemon' } | Measure-Object).Count"]))
  : null;
const gitProcessActive = Number.isFinite(gitProcessCount) && gitProcessCount > 0;
if (gitLockPresent) blockers.push('GIT_INDEX_LOCK_PRESENT');

const devGpuLockPath = path.join(frontendRoot, 'logs', 'startup', 'dev-gpu-runtime.lock');
const devGpuLock = readJson(devGpuLockPath);
const devGpuRunning = Boolean(devGpuLock && isAlive(devGpuLock.pid));
if (fs.existsSync(devGpuLockPath) && !devGpuRunning) warnings.push('DEV_GPU_STALE_LOCK_PRESENT');
const runtimePorts = {
  synthesis: { port: Number(process.env.TURBO_PORT ?? 8090), pid: listeningPid(process.env.TURBO_PORT ?? 8090) },
  app: { port: Number(process.env.VITE_PORT ?? 5173), pid: listeningPid(process.env.VITE_PORT ?? 5173) },
  embeddingChallenger: { port: Number(process.env.EMBED_SERVER_PORT ?? 8081), pid: listeningPid(process.env.EMBED_SERVER_PORT ?? 8081) },
};
const runtimeAlreadyListening = Object.values(runtimePorts).some(({ pid }) => pid !== null);
if (runtimeAlreadyListening) warnings.push('DEV_GPU_RUNTIME_ACTIVE_REUSE_ONLY');

let disk = null;
if (process.platform === 'win32') {
  const free = Number(command('powershell.exe', ['-NoProfile', '-Command', '(Get-PSDrive -Name C).Free']));
  if (Number.isFinite(free) && free > 0) disk = { drive: 'C:', freeBytes: free, freeGiB: free / 1024 ** 3 };
}
if (disk?.freeGiB < 20) blockers.push('LOW_DISK_SPACE_BELOW_20_GIB');
else if (disk?.freeGiB < 35) warnings.push('LOW_DISK_SPACE_BELOW_35_GIB');

const configuredImages = command('docker', ['compose', 'config', '--images']);
const dockerAvailable = configuredImages !== null;
if (!dockerAvailable) blockers.push('DOCKER_UNAVAILABLE');
const activeContainers = dockerAvailable ? command('docker', ['ps', '--format', '{{.Names}}|{{.Image}}|{{.Status}}']) : null;
const storageCensus = dockerAvailable ? command('docker', ['system', 'df', '--format', '{{json .}}']) : null;

const report = {
  schema: 'atlas.docker-rebuild-preflight.v1',
  generatedAt: new Date().toISOString(),
  host: { platform: os.platform(), arch: os.arch() },
  readOnly: true,
  writesPerformed: false,
  rebuildAllowed: blockers.length === 0,
  blockers,
  warnings,
  git: {
    indexLockPresent: gitLockPresent,
    indexLockPath: gitLockPath,
    indexLock: gitLockStats,
    processCount: gitProcessCount,
    processActive: gitProcessActive,
    lockClassification: !gitLockPresent ? 'ABSENT' : gitProcessActive ? 'ACTIVE_PROCESS_REQUIRES_WAIT' : 'STALE_LOCK_REQUIRES_MANUAL_REVIEW',
  },
  devGpu: {
    supervisorLockPath: devGpuLockPath,
    supervisorLockPresent: fs.existsSync(devGpuLockPath),
    alreadyRunning: devGpuRunning,
    pid: devGpuLock?.pid ?? null,
    duplicateSupervisorDetected: false,
    runtimePorts,
    runtimeAlreadyListening,
  },
  disk,
  docker: {
    available: dockerAvailable,
    configuredImages: configuredImages ? configuredImages.split(/\r?\n/).filter(Boolean) : [],
    activeContainers: activeContainers ? activeContainers.split(/\r?\n/).filter(Boolean) : [],
    storageCensusRead: storageCensus !== null,
  },
  policy: {
    requireExplicitTarget: true,
    requirePinnedBase: true,
    reuseHealthyContainers: true,
    noDeleteOrPrune: true,
    noComposeBuild: true,
    noContainerRestart: true,
  },
  nextGate: blockers.length ? 'RESOLVE_REBUILD_PREFLIGHT_BLOCKERS' : 'EXPLICIT_TARGETED_REBUILD_REVIEW',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
if (blockers.length) process.exitCode = 1;
