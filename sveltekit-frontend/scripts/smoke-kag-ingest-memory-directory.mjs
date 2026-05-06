#!/usr/bin/env node
/**
 * smoke-kag-ingest-memory-directory.mjs
 *
 * Gates:
 *   G1 - pending dir exists (or can be created)
 *   G2 - writes test JSONL with error + agent_run + graphify records
 *   G3 - dryRun returns counts without moving files
 *   G4 - real run ingests error record → Redis ace:error:{hash}
 *   G5 - real run ingests agent_run record → Redis ace:agent:{hash}
 *   G6 - real run ingests graphify_deep_imports node → Redis code:graph:node:{hash}
 *   G7 - unknown record types are skipped safely (no crash, no count)
 *   G8 - file moves to processed/ after successful ingest
 */

import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');
const MCP_URL   = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';
const REDIS_URL = process.env.REDIS_URL     ?? 'redis://127.0.0.1:6379';

const PEND_DIR      = join(ROOT, 'memory', 'ingest', 'pending');
const PROC_DIR      = join(ROOT, 'memory', 'ingest', 'processed');
const TEST_FILE     = join(PEND_DIR, 'smoke_ingest_test.jsonl');

let passed = 0;
let failed = 0;

function gate(name, fn) {
  try {
    const r = fn();
    const p = r instanceof Promise ? r : Promise.resolve(r);
    return p.then(result => {
      if (result === true || result === undefined) {
        console.log(`  PASS  ${name}`);
        passed++;
      } else {
        console.log(`  FAIL  ${name}: ${result}`);
        failed++;
      }
    }).catch(err => {
      console.log(`  FAIL  ${name}: ${err.message}`);
      failed++;
    });
  } catch (err) {
    console.log(`  FAIL  ${name}: ${err.message}`);
    failed++;
    return Promise.resolve();
  }
}

// ── MCP call helper ──────────────────────────────────────────────────────────

async function callMcp(toolName, args) {
  const ctrl = new AbortController();
  const tid  = setTimeout(() => ctrl.abort(), 30_000);
  let res;
  try {
    res = await fetch(`${MCP_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: toolName, arguments: args } }),
      signal: ctrl.signal,
    });
  } finally { clearTimeout(tid); }

  if (!res.ok) throw new Error(`MCP HTTP ${res.status}`);

  const raw = await res.text().catch(() => '');
  // SSE format: lines starting with "data: "
  let parsed = null;
  for (const line of raw.split('\n')) {
    if (line.startsWith('data: ')) {
      try { parsed = JSON.parse(line.slice(6)); break; } catch { /* continue */ }
    }
  }
  // Fallback: plain JSON response
  if (!parsed) {
    try { parsed = JSON.parse(raw); } catch { throw new Error('Unparseable MCP response'); }
  }
  if (parsed?.error) throw new Error(parsed.error.message ?? JSON.stringify(parsed.error));
  const text = parsed?.result?.content?.[0]?.text;
  if (!text) throw new Error('No content in MCP response');
  return JSON.parse(text);
}

// ── Redis helper ─────────────────────────────────────────────────────────────

async function redisGet(key) {
  let Redis;
  try { ({ default: Redis } = await import('ioredis')); }
  catch { return null; }
  const r = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3_000, commandTimeout: 3_000 });
  try {
    await r.connect();
    const val = await r.get(key);
    await r.quit().catch(() => {});
    return val;
  } catch {
    await r.quit().catch(() => {});
    return null;
  }
}

// ── Test records ─────────────────────────────────────────────────────────────

const TS = new Date().toISOString();
const ERR_ID     = `smoke_err_${Date.now()}`;
const AGENT_ID   = `smoke_agent_${Date.now()}`;
const GRAPH_KEY  = `node:smoke:${Date.now()}:src/lib/smoke-test-file.ts`;
const UNKNOWN_ID = `smoke_unknown_${Date.now()}`;

const ERR_HASH   = createHash('sha1').update(ERR_ID).digest('hex').slice(0, 12);
const AGENT_HASH = createHash('sha1').update(AGENT_ID).digest('hex').slice(0, 12);
const GRAPH_HASH = createHash('sha1').update(GRAPH_KEY).digest('hex').slice(0, 12);

const TEST_RECORDS = [
  JSON.stringify({ type: 'error', id: ERR_ID, summary: 'smoke test error record', tags: ['smoke'], files: ['src/lib/smoke.ts'], confidence: 0.75, needsDeepResearch: false, generated_at: TS }),
  JSON.stringify({ type: 'agent_run', id: AGENT_ID, summary: 'smoke test agent run', tags: ['smoke'], files: [], confidence: 0.85, patchResult: 'passed', needsDeepResearch: false, generated_at: TS }),
  JSON.stringify({ source_kind: 'graphify_deep_imports', source_type: 'node_summary', stable_key: GRAPH_KEY, file_path: 'src/lib/smoke-test-file.ts', zone: 'client', directFanIn: 5, directFanOut: 2, text: 'smoke test node', generatedAt: TS }),
  JSON.stringify({ type: 'unknown_future_type', id: UNKNOWN_ID, data: 'should be skipped silently', generated_at: TS }),
];

console.log('\n=== Smoke: kag.ingest_memory_directory ===\n');

// G1 - pending dir accessible
await gate('G1 - pending dir exists/writable', () => {
  mkdirSync(PEND_DIR, { recursive: true });
  mkdirSync(PROC_DIR, { recursive: true });
  if (!existsSync(PEND_DIR)) return 'could not create pending dir';
});

// G2 - write test JSONL
await gate('G2 - test JSONL written with 4 records (error+agent_run+graph+unknown)', () => {
  writeFileSync(TEST_FILE, TEST_RECORDS.join('\n'));
  if (!existsSync(TEST_FILE)) return 'test file not written';
});

// G3 - dryRun returns counts without moving files
await gate('G3 - dryRun returns ingested count, file stays in pending', async () => {
  let result;
  try {
    result = await callMcp('kag.ingest_memory_directory', { dryRun: true, limit: 5 });
  } catch (e) {
    return `MCP call failed (server running? ${MCP_URL}): ${e.message}`;
  }
  if (!result.ok) return `result.ok=false: ${JSON.stringify(result)}`;
  // dryRun should count records but not move files
  if (!existsSync(TEST_FILE)) return 'dryRun moved the file (should not)';
  if (result.ingested < 3) return `ingested=${result.ingested} (expected >=3 records)`;
});

// G4 - error record → Redis ace:error:{hash}
await gate('G4 - error record ingested → Redis ace:error:{hash}', async () => {
  // Run real ingest now
  let result;
  try {
    result = await callMcp('kag.ingest_memory_directory', { dryRun: false, limit: 5, moveProcessed: true });
  } catch (e) {
    return `MCP call failed: ${e.message}`;
  }
  if (!result.ok) return `ingest failed: ${JSON.stringify(result)}`;

  // Check Redis
  const val = await redisGet(`ace:error:${ERR_HASH}`);
  if (!val) return `ace:error:${ERR_HASH} not found in Redis (Redis may be down — check manually)`;
  const parsed = JSON.parse(val);
  if (parsed.id !== ERR_ID) return `Redis record id mismatch: ${parsed.id}`;
});

// G5 - agent_run record → Redis ace:agent:{hash}
await gate('G5 - agent_run record ingested → Redis ace:agent:{hash}', async () => {
  const val = await redisGet(`ace:agent:${AGENT_HASH}`);
  if (!val) return `ace:agent:${AGENT_HASH} not found in Redis`;
  const parsed = JSON.parse(val);
  if (parsed.id !== AGENT_ID) return `Redis record id mismatch: ${parsed.id}`;
});

// G6 - graphify node → Redis code:graph:node:{hash}
await gate('G6 - graphify node_summary → Redis code:graph:node:{hash}', async () => {
  const val = await redisGet(`code:graph:node:${GRAPH_HASH}`);
  if (!val) return `code:graph:node:${GRAPH_HASH} not found in Redis`;
  const parsed = JSON.parse(val);
  if (parsed.file_path !== 'src/lib/smoke-test-file.ts') return `file_path mismatch: ${parsed.file_path}`;
});

// G7 - unknown record type skipped safely
await gate('G7 - unknown record type skipped without crash', async () => {
  // If we got here after G4/G5/G6 without crashing, G7 passes
  // Verify unknown_future_type has NO Redis key
  const val = await redisGet(`ace:unknown:${UNKNOWN_ID}`);
  if (val) return 'unknown type wrote a Redis key (should have been skipped)';
});

// G8 - file moved to processed/
await gate('G8 - test JSONL moved to processed/ after ingest', () => {
  const procFile = join(PROC_DIR, 'smoke_ingest_test.jsonl');
  const stillPending = existsSync(TEST_FILE);
  const inProcessed  = existsSync(procFile);
  if (stillPending) return 'file still in pending/ (not moved)';
  if (!inProcessed) {
    // Maybe it was moved earlier — check listing
    const procFiles = readdirSync(PROC_DIR);
    if (!procFiles.includes('smoke_ingest_test.jsonl')) {
      return 'not found in processed/ either (check failed/ dir)';
    }
  }
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

try {
  const procFile = join(PROC_DIR, 'smoke_ingest_test.jsonl');
  if (existsSync(procFile)) unlinkSync(procFile);
  if (existsSync(TEST_FILE)) unlinkSync(TEST_FILE);
} catch { /* ignore cleanup errors */ }

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${passed}/${passed + failed} gates passed`);
if (failed > 0) {
  console.error(`${failed} gate(s) FAILED`);
  process.exit(1);
} else {
  console.log('All gates PASS');
}
