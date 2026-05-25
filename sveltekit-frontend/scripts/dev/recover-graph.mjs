#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const runLogPath = path.join(root, 'memory', 'agent-runs', 'latest-recovery.json');
const events = [];

function runNode(scriptPath, args = []) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: root,
    encoding: 'utf8'
  });
  return {
    scriptPath,
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    shell: false,
    ...options
  });
  return {
    command,
    args,
    status: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function safeJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function record(step, result) {
  events.push({
    step,
    status: result.status === 0 ? 'pass' : 'fail',
    stdout: result.stdout.trim().slice(0, 1200),
    stderr: result.stderr.trim().slice(0, 1200)
  });
}

fs.mkdirSync(path.dirname(runLogPath), { recursive: true });

const applyResult = runNode(path.join(root, 'scripts', 'dev', 'apply-opencode-patches.mjs'));
record('apply-opencode-patches', applyResult);

const rootsResult = runNode(path.join(root, 'scripts', 'dev', 'patch-graph-export-roots.mjs'));
record('patch-graph-export-roots', rootsResult);

const exportsResult = runNode(path.join(root, 'scripts', 'atlas', 'generate-graph-exports.mjs'));
record('graph:exports', exportsResult);

let duckdbResult = null;
const duckdbSmokePath = path.join(root, 'duckdb', 'smoke-duckdb.ps1');
if (fs.existsSync(duckdbSmokePath)) {
  duckdbResult = runCommand('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    duckdbSmokePath
  ]);
  record('duckdb:smoke', duckdbResult);
}

const manifestPath = path.join(root, 'memory', 'exports', 'graph-refresh-manifest.json');
const manifest = safeJson(manifestPath, {});

const log = {
  status: [applyResult, rootsResult, exportsResult, duckdbResult].filter(Boolean).every((r) => r.status === 0) ? 'pass' : 'degraded',
  commandsRun: events.map((event) => event.step),
  filesChanged: [
    '.opencode/config-patches.json',
    'opencode.json',
    'scripts/atlas/generate-graph-exports.mjs',
    'memory/exports/graph-refresh-manifest.json',
    'memory/exports/cluster-cards.jsonl',
    'memory/exports/pathway-cards.jsonl'
  ],
  sourceRefs: [
    'scripts/dev/apply-opencode-patches.mjs',
    'scripts/dev/patch-graph-export-roots.mjs',
    'scripts/atlas/generate-graph-exports.mjs',
    'duckdb/smoke-duckdb.ps1'
  ],
  nextSteps: [
    'Inspect graph-refresh-manifest.json promotionState',
    'Feed exports into downstream recovery if smoke was degraded',
    'Use /recover:graph for repeatable recovery'
  ],
  graphExportsResult: {
    manifestPath,
    promotionState: manifest.promotionState ?? 'unknown',
    status: manifest.status ?? 'unknown',
    counts: manifest.counts ?? {}
  },
  duckdbResult: duckdbResult ? { status: duckdbResult.status, stdout: duckdbResult.stdout.trim().slice(0, 1200), stderr: duckdbResult.stderr.trim().slice(0, 1200) } : null,
  events
};

fs.writeFileSync(runLogPath, `${JSON.stringify(log, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(log, null, 2));

if (log.status === 'fail') process.exit(1);
