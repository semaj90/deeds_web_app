#!/usr/bin/env node
/**
 * graphify-deep-ingest.mjs — end-to-end pipeline: build → ingest → log
 *
 * 1. Runs graphify-deep-imports.mjs (produces memory/ingest/pending/ JSONL)
 * 2. Calls kag.ingest_memory_directory via TRACE MCP (:8788)
 * 3. Prints full stats: edge counts, Redis writes, timing
 *
 * Usage:
 *   node scripts/graphify-deep-ingest.mjs
 *   node scripts/graphify-deep-ingest.mjs --dry-run    # preview ingest, don't move files
 *   node scripts/graphify-deep-ingest.mjs --skip-build # only run MCP ingest step
 *   node scripts/graphify-deep-ingest.mjs --limit 50   # max JSONL files per ingest call
 */

import { spawnSync }      from 'node:child_process';
import { dirname, join }  from 'node:path';
import { fileURLToPath }  from 'node:url';
import { existsSync, readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const SKIP_BUILD = args.includes('--skip-build');
const limitArg  = args.find(a => a.startsWith('--limit='))?.split('=')[1]
                ?? args[args.indexOf('--limit') + 1];
const LIMIT     = limitArg ? parseInt(limitArg, 10) : 100;
const MCP_URL   = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';

const t0 = Date.now();
function elapsed() { return `${((Date.now() - t0) / 1000).toFixed(1)}s`; }
function log(msg) { console.log(`[${elapsed()}] ${msg}`); }

// ── Step 1: Build ──────────────────────────────────────────────────────────

if (!SKIP_BUILD) {
  log('Step 1/2: Running graphify-deep-imports.mjs …');
  const result = spawnSync(process.execPath, [join(__dirname, 'graphify-deep-imports.mjs')], {
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env,
  });
  if (result.status !== 0) {
    console.error(`graphify-deep-imports failed (exit ${result.status})`);
    process.exit(1);
  }
  log('Step 1/2: Build complete.');
} else {
  log('Step 1/2: Skipped (--skip-build).');
}

// ── Step 2: Ingest via MCP ─────────────────────────────────────────────────

const pendDir = join(ROOT, 'memory', 'ingest', 'pending');
const pendFiles = existsSync(pendDir)
  ? readdirSync(pendDir).filter(f => f.endsWith('.jsonl'))
  : [];

log(`Step 2/2: ${pendFiles.length} JSONL file(s) in pending/ — calling kag.ingest_memory_directory …`);
if (DRY_RUN) log('  [dry-run mode — no Redis writes, no file moves]');

let ingestResult = null;
let mcpError = null;

try {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 300_000);
  let res;
  try {
    res = await fetch(`${MCP_URL}/mcp`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'tools/call',
        params: {
          name: 'kag.ingest_memory_directory',
          arguments: { dryRun: DRY_RUN, limit: LIMIT, moveProcessed: !DRY_RUN },
        },
      }),
      signal: ctrl.signal,
    });
  } finally { clearTimeout(tid); }

  if (!res.ok) throw new Error(`MCP HTTP ${res.status} ${res.statusText}`);

  const raw = await res.text();
  let parsed = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      try { parsed = JSON.parse(line.slice(6)); break; } catch { /* continue */ }
    }
  }
  if (!parsed) parsed = JSON.parse(raw);
  if (parsed?.error) throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));

  const text = parsed?.result?.content?.[0]?.text;
  if (!text) throw new Error('No content in MCP response');
  ingestResult = JSON.parse(text);
} catch (err) {
  mcpError = err.message;
}

// ── Step 3: Report ─────────────────────────────────────────────────────────

console.log('\n══════════════════════════════════════════');
console.log('  graphify-deep-ingest — Pipeline Report');
console.log('══════════════════════════════════════════');

if (mcpError) {
  console.log(`\n  MCP ingest:  UNAVAILABLE (${mcpError})`);
  console.log('  → TRACE MCP server not running at', MCP_URL);
  console.log('  → Start it with: npm run mcp:trace (or mcp:ensure)');
  console.log('  → Pending files will be processed on next server start');
  console.log(`\n  Build output: memory/graphify/deep/`);
  if (pendFiles.length > 0) {
    console.log(`  Pending JSONL: ${pendFiles.length} file(s) waiting in memory/ingest/pending/`);
  }
} else if (ingestResult) {
  const r = ingestResult;
  console.log(`\n  Build:    ${SKIP_BUILD ? 'skipped' : 'complete'}`);
  console.log(`  Ingest:   ${r.ok ? 'OK' : 'FAILED'} (dryRun=${r.dryRun})`);
  console.log(`  Scanned:  ${r.scanned} file(s) of ${r.totalPending} pending`);
  console.log(`  Ingested: ${r.ingested} record(s) → Redis`);
  console.log(`  Skipped:  ${r.skipped} (already ingested — idempotent)`);
  console.log(`  Failed:   ${r.failed}`);
  if (r.processedFiles?.length) {
    console.log(`  Moved to processed/: ${r.processedFiles.join(', ')}`);
  }
  if (r.failedFiles?.length) {
    for (const f of r.failedFiles) console.log(`  FAILED file: ${f.path} — ${f.reason}`);
  }
}

// Read graph stats for summary line
try {
  const statsPath = join(ROOT, 'memory/graphify/deep/graph-stats.json');
  if (existsSync(statsPath)) {
    const { nodeCount, edgeCount, resolvedEdges, neighborhoodsComputed, coveredFiles } = JSON.parse(
      await import('node:fs').then(m => m.readFileSync(statsPath, 'utf8'))
    );
    console.log(`\n  Graph:    ${nodeCount} nodes, ${edgeCount} edges (${resolvedEdges} resolved)`);
    console.log(`            ${neighborhoodsComputed} BFS neighborhoods, ${coveredFiles} test-covered files`);
  }
} catch { /* stats file may not exist yet */ }

console.log(`\n  Total time: ${elapsed()}`);
console.log('══════════════════════════════════════════\n');

// MCP unavailable is non-fatal — JSONL stays in pending, picked up when server starts
if (!mcpError && ingestResult?.failed > 0) process.exit(1);
