#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TIMEOUT = 15_000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FRONTEND_ROOT = path.join(ROOT, 'sveltekit-frontend');
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runCmd(cmd, args = [], cwd = ROOT, timeoutMs = TIMEOUT) {
  try {
    const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout: timeoutMs });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  } catch (err) {
    return { status: null, error: String(err) };
  }
}

function runFrontendScript(script) {
  return runCmd(NPM, ['run', script, '--silent'], FRONTEND_ROOT);
}

function markProbe(results, name, probe, hint) {
  if (probe.status === 0) results.healthy.push(name);
  else {
    results.degraded.push(name);
    if (hint) results.hints[name] = hint;
  }
}

const results = {
  ok: false,
  healthy: [],
  degraded: [],
  broken: [],
  notChecked: [],
  hints: {}
};

// 1) Use the repository's actual MCP probe. It writes a structured report and
// deliberately exits zero even when an optional endpoint is down.
const mcpProbe = runCmd(process.execPath, [path.join(ROOT, 'scripts/atlas/mcp-opencode-health-probe.mjs')]);
const mcpReportPath = path.join(ROOT, 'memory', 'exports', 'mcp-health-probe.json');
try {
  const report = JSON.parse(fs.readFileSync(mcpReportPath, 'utf8'));
  if (report.broken > 0 || report.notListening > 0) {
    results.degraded.push('trace-mcp');
    results.hints['trace-mcp'] = 'Inspect memory/exports/mcp-health-probe.json';
  } else if (report.liveMcp > 0) results.healthy.push('trace-mcp');
  else results.degraded.push('trace-mcp');
} catch {
  results.degraded.push('trace-mcp');
  results.hints['trace-mcp'] = mcpProbe.stderr.trim() || 'MCP probe report unavailable';
}

// 2) Exercise the configured local atlas-tools stdio server directly.
markProbe(
  results,
  'atlas-tools-mcp',
  runCmd(process.execPath, [path.join(ROOT, 'scripts/opencode/smoke-atlas-tools-mcp.mjs')], ROOT, 30_000),
  'Run npm run smoke:atlas-tools'
);

// 3) Keep optional service health explicit. These historical npm aliases are
// not present in the current package manifests, so report them as not checked.
results.notChecked.push('services-health-aliases');
results.hints['services-health-aliases'] = 'No services:health:*, trace:smoke, or phase76:mcp:health script is registered';

const curl = process.platform === 'win32' ? 'curl.exe' : 'curl';
const turbovecHealth = runCmd(curl, ['-fsS', 'http://127.0.0.1:8791/health']);
if (turbovecHealth.status === 0) results.healthy.push('turbovec-sidecar');
else {
  results.degraded.push('turbovec-sidecar');
  results.hints['turbovec-sidecar'] = 'TurboVec HTTP health probe failed at http://127.0.0.1:8791/health';
}

// Normalize unique lists
for (const k of ['healthy', 'degraded', 'broken', 'notChecked']) {
  results[k] = Array.from(new Set(results[k]));
}

results.ok = results.broken.length === 0;

console.log(JSON.stringify(results, null, 2));

// Exit code: 0 if no broken tools, else 2
process.exit(results.broken.length === 0 ? 0 : 2);
