#!/usr/bin/env node
import { spawnSync } from 'child_process';

const TIMEOUT = 15_000;

function runCmd(cmd, args = []) {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: TIMEOUT });
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  } catch (err) {
    return { status: null, error: String(err) };
  }
}

const results = {
  ok: false,
  healthy: [],
  degraded: [],
  broken: [],
  hints: {}
};

// 1) Try the JSON services health endpoint (preferred)
const svcJson = runCmd('npm', ['run', 'services:health:json', '--silent']);
if (svcJson.status === 0) {
  try {
    const parsed = JSON.parse(svcJson.stdout || svcJson.stderr || '{}');
    // Expect shape like { healthy: [...], degraded: [...], broken: [...], hints: {...} }
    if (Array.isArray(parsed.healthy)) results.healthy.push(...parsed.healthy);
    if (Array.isArray(parsed.degraded)) results.degraded.push(...parsed.degraded);
    if (Array.isArray(parsed.broken)) results.broken.push(...parsed.broken);
    if (parsed.hints && typeof parsed.hints === 'object') Object.assign(results.hints, parsed.hints);
  } catch (e) {
    // fallback: treat as degraded
    results.degraded.push('services');
  }
} else if (svcJson.status === 1 || svcJson.status === 2 || svcJson.status === null) {
  // non-zero exit -> call the strict variant (human-readable) but mark degraded if it fails
  const strict = runCmd('npm', ['run', 'services:health:strict', '--silent']);
  if (strict.status === 0) results.healthy.push('services');
  else results.degraded.push('services');
}

// 2) TRACE MCP (curl to :8788) — lightweight
const trace = runCmd('npm', ['run', 'trace:smoke', '--silent']);
if (trace.status === 0) results.healthy.push('trace-mcp');
else results.degraded.push('trace-mcp');

// 3) Phase76 MCP health (local MCP tool on :3002) — optional
const phase76 = runCmd('npm', ['run', 'phase76:mcp:health', '--silent']);
if (phase76.status === 0) results.healthy.push('phase76-mcp');
else results.degraded.push('phase76-mcp');

// 4) TurboVec sidecar health (frontend sidecar)
const turbovec = runCmd('npm', ['--prefix', 'sveltekit-frontend', 'run', 'turbovec:sidecar:health', '--silent']);
if (turbovec.status === 0) results.healthy.push('turbovec-sidecar');
else {
  results.degraded.push('turbovec-sidecar');
  results.hints['turbovec-sidecar'] = 'npm run atlas:hyperrag:sidecar';
}

// Normalize unique lists
for (const k of ['healthy', 'degraded', 'broken']) {
  results[k] = Array.from(new Set(results[k]));
}

results.ok = results.broken.length === 0;

console.log(JSON.stringify(results, null, 2));

// Exit code: 0 if no broken tools, else 2
process.exit(results.broken.length === 0 ? 0 : 2);
