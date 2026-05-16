#!/usr/bin/env node
/**
 * verify-trace-startup.mjs — Claude Code verification contract runner
 *
 * Verifies the full TRACE/Karpathy stack is healthy before Claude edits code.
 * Runs service health checks, graph tools, GPU smoke, and graphify smoke.
 * Exits 0 if all pass, 1 if any fail.
 *
 * Usage:
 *   node scripts/verify-trace-startup.mjs [--json] [--skip-gpu] [--skip-graph]
 */

import { spawnSync } from 'node:child_process';

const args      = process.argv.slice(2);
const jsonOut   = args.includes('--json');
const skipGpu   = args.includes('--skip-gpu');
const skipGraph = args.includes('--skip-graph');

const checks = [];
const APP_BASE = process.env.PUBLIC_APP_URL ?? process.env.SVELTEKIT_URL ?? 'http://127.0.0.1:5173';
const APP_HEALTH_URL = `${APP_BASE}/api/health`;
const APP_ROOT_URL = `${APP_BASE}/`;

async function check(name, fn) {
  const t0 = Date.now();
  try {
    const result = await fn();
    checks.push({ name, ok: true, durationMs: Date.now() - t0, result });
    if (!jsonOut) console.log(`  ✓ ${name}  (${Date.now() - t0}ms)`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    checks.push({ name, ok: false, durationMs: Date.now() - t0, error: msg });
    if (!jsonOut) console.error(`  ✗ ${name}: ${msg}`);
  }
}

async function getJson(url, label) {
  const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
  if (!res.ok) throw new Error(`${label ?? url} HTTP ${res.status}`);
  return res.json();
}

function sh(cmd, cwd) {
  const r = spawnSync(cmd, {
    shell: true,
    encoding: 'utf8',
    cwd: cwd ?? process.cwd(),
  });
  if (r.status !== 0) throw new Error((r.stderr || r.stdout).slice(0, 400));
  return r.stdout.trim().slice(0, 200);
}

if (!jsonOut) console.log('\n🔍 TRACE Stack Verification\n');

// ── Service health ────────────────────────────────────────────────────────────

await check(`SvelteKit ${APP_BASE}`, () =>
  getJson(APP_HEALTH_URL, 'SvelteKit')
    .catch(() => fetch(APP_ROOT_URL, { signal: AbortSignal.timeout(4_000) })
      .then(r => { if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`); return { status: 'reachable' }; }))
);

await check('TRACE MCP :8788', () =>
  getJson('http://127.0.0.1:8788/health', 'TRACE MCP')
);

await check('Topology search :8101', () =>
  getJson('http://127.0.0.1:8101/health', 'topology-search')
    .catch(() => fetch('http://127.0.0.1:8101/', { signal: AbortSignal.timeout(3_000) })
      .then(r => { if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`); return { status: 'reachable' }; }))
);

await check('TurboQuant :8090', () =>
  getJson('http://127.0.0.1:8090/health', 'TurboQuant')
);

// ── Graphify smoke ────────────────────────────────────────────────────────────

await check('Graphify smoke (5-pillar)', () =>
  sh('npm run smoke:graphify -- --no-qdrant', 'sveltekit-frontend')
);

// ── Graph/KAG tools (via TRACE MCP) ──────────────────────────────────────────

if (!skipGraph) {
  await check('trace.kag_search', async () => {
    const res = await fetch('http://127.0.0.1:8788/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'tools/call', id: 1,
        params: { name: 'trace.kag_search', arguments: { query: 'auth route gaps', limit: 3 } },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    return { hits: 'ok' };
  });

  await check('topology.search_near', async () => {
    const res = await fetch('http://127.0.0.1:8788/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', method: 'tools/call', id: 2,
        params: { name: 'topology.search_near', arguments: { query: 'GPU indexer pipeline', limit: 3 } },
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(JSON.stringify(data.error));
    return { nodes: 'ok' };
  });
}

// ── GPU / compute worker smoke ────────────────────────────────────────────────

if (!skipGpu) {
  await check('GPU compute-worker smoke', () =>
    sh('node scripts/smoke-compute-worker-gpu.mjs', 'sveltekit-frontend')
      .catch(() => { /* non-fatal — worker may not have GPU */ return 'cpu-fallback'; })
  );
}

// ── svelte-check (quick) ──────────────────────────────────────────────────────

await check('svelte-check (error threshold)', () =>
  sh('npx svelte-check --threshold error --output machine 2>&1 | tail -3', 'sveltekit-frontend')
);

// ── Output ────────────────────────────────────────────────────────────────────

const allOk = checks.every(c => c.ok);

if (jsonOut) {
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    ok: allOk,
    passed: checks.filter(c => c.ok).length,
    failed: checks.filter(c => !c.ok).length,
    checks,
  }, null, 2));
} else {
  const failed = checks.filter(c => !c.ok);
  console.log(`\n${allOk ? '✅' : '❌'} ${checks.length} checks — ${checks.filter(c => c.ok).length} passed, ${failed.length} failed\n`);
  if (failed.length) {
    console.error('Failed checks:');
    for (const f of failed) console.error(`  • ${f.name}: ${f.error}`);
    console.error('\nFix failures before editing code.\n');
  }
}

process.exit(allOk ? 0 : 1);
