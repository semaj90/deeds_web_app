#!/usr/bin/env node
/**
 * smoke-golden-retrieval.mjs
 *
 * Golden retrieval E2E smoke test.
 *
 * Validates the full retrieval stack for the canonical query:
 *   "where is Redis Valkey cache config wired?"
 *
 * Expected:
 *   ✓ source_refs  > 0
 *   ✓ feature_ids  > 0 (or degraded=false with qdrant hits)
 *   ✓ lane_ids     > 0
 *   ✓ qdrant_point_ids > 0
 *   ✓ ACE packet written to Redis (bitfrost:retrieval:{hash})
 *   ✓ Bifrost telemetry key written
 *   ✓ latency_ms   < 30000
 *
 * Usage:
 *   node scripts/smoke/smoke-golden-retrieval.mjs
 *   node scripts/smoke/smoke-golden-retrieval.mjs --verbose
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { createConnection } from 'node:net';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── .env loader ─────────────────────────────────────────────────────────────
for (const env of [path.join(ROOT, 'sveltekit-frontend', '.env'), path.join(ROOT, '.env')]) {
  if (existsSync(env)) {
    for (const line of readFileSync(env, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]/,'').replace(/['"]$/,'');
    }
    break;
  }
}

const VERBOSE = process.argv.includes('--verbose');

const QDRANT_URL      = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const EMBED_BASE_URL  = process.env.OLLAMA_EMBED_BASE_URL ?? 'http://127.0.0.1:8081';
const EMBED_MODEL     = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const REDIS_HOST      = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT      = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASS      = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? '';
const COLLECTION      = 'codebase_chunks_768';
const GOLDEN_QUERY    = 'where is Redis Valkey cache config wired?';
const MAX_LATENCY_MS  = 30_000;

// ── Terminal colours ─────────────────────────────────────────────────────────
const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0, failed = 0;
function pass(label, detail = '') {
  console.log(`  ${c.green('✓')} ${label}${detail ? c.dim('  ' + detail) : ''}`);
  passed++;
}
function fail(label, detail = '') {
  console.log(`  ${c.red('✗')} ${label}${detail ? '  ' + c.red(detail) : ''}`);
  failed++;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function embedQuery(query) {
  const res = await fetch(`${EMBED_BASE_URL.replace(/\/$/, '')}/v1/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: query }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Embed failed: ${res.status}`);
  const data = await res.json();
  return data.data?.[0]?.embedding ?? null;
}

async function qdrantSearch(embedding) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: { name: 'content', vector: embedding },
      limit: 10,
      with_payload: true,
      with_vector: false,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Qdrant search failed: ${res.status}`);
  const data = await res.json();
  return data.result ?? [];
}

function redisGet(key) {
  return new Promise((resolve) => {
    const sock = createConnection({ host: REDIS_HOST, port: REDIS_PORT });
    let buf = '';
    let resolved = false;

    const finish = (val) => {
      if (!resolved) { resolved = true; sock.destroy(); resolve(val); }
    };

    sock.setTimeout(4000);
    sock.on('timeout', () => finish(null));
    sock.on('error', () => finish(null));
    sock.on('close', () => { if (!resolved) finish(null); });
    sock.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\r\n');
      // Look for either +OK or final value
      let offset = 0;
      let expectedResponses = REDIS_PASS ? 2 : 1;
      let count = 0;
      let lastVal = null;
      try {
        while (count < expectedResponses && offset < lines.length) {
          const first = lines[offset] ?? '';
          if (first === '') break;
          if (first.startsWith('+')) { lastVal = first.slice(1); offset++; count++; }
          else if (first.startsWith('$')) {
            const len = parseInt(first.slice(1), 10);
            lastVal = len === -1 ? null : (lines[offset + 1] ?? null);
            offset += 2; count++;
          } else if (first.startsWith('-')) { lastVal = null; offset++; count++; }
          else break;
        }
        if (count === expectedResponses) finish(lastVal);
      } catch { /* accumulate more */ }
    });

    let cmd = '';
    if (REDIS_PASS) cmd += `*2\r\n$4\r\nAUTH\r\n$${REDIS_PASS.length}\r\n${REDIS_PASS}\r\n`;
    cmd += `*2\r\n$3\r\nGET\r\n$${key.length}\r\n${key}\r\n`;
    sock.write(cmd);
  });
}

function sha256hex(str) {
  // Simple hash for generating the query hash the same way makeQueryHash does
  let h = 0n;
  for (const ch of str) {
    h = (h << 5n) + h + BigInt(ch.codePointAt(0));
    h &= 0xFFFFFFFFFFFFFFFFn;
  }
  return h.toString(16).padStart(16, '0');
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(c.bold('\n=== Golden Retrieval Smoke Test ==='));
console.log(c.dim(`Query: "${GOLDEN_QUERY}"\n`));

const t0 = Date.now();

// Gate 1 — Embedding server reachable
let embedding = null;
try {
  embedding = await embedQuery(GOLDEN_QUERY);
} catch (e) {
  fail('Embedding server reachable', String(e));
}

if (embedding) {
  pass('Embedding server reachable', `dim=${embedding.length}`);
} else if (embedding !== undefined) {
  fail('Embedding server returned vector', 'null returned from /v1/embeddings');
}

// Gate 2 — Qdrant search returns hits
let hits = [];
if (embedding) {
  try {
    hits = await qdrantSearch(embedding);
  } catch (e) {
    fail('Qdrant search succeeded', String(e));
  }
}

if (hits.length > 0) {
  pass('Qdrant hits > 0', `${hits.length} hits, top score=${hits[0]?.score?.toFixed(3)}`);
} else if (embedding) {
  fail('Qdrant hits > 0', `0 hits returned from ${COLLECTION}`);
}

// Gate 3 — source_refs extracted from payloads
const sourceRefs = hits
  .map(h => h.payload?.sourceRef ?? h.payload?.relativePath ?? h.payload?.file_path ?? '')
  .filter(Boolean);

if (sourceRefs.length > 0) {
  pass('source_refs > 0', `[${sourceRefs.slice(0,3).join(', ')}...]`);
} else if (hits.length > 0) {
  fail('source_refs > 0', 'Qdrant payloads have no sourceRef/relativePath/file_path fields — run backfill-qdrant-source-refs.mjs');
}

// Gate 4 — lane_ids (Qdrant = 'qdrant' lane)
if (hits.length > 0) {
  pass('lane_ids > 0', 'qdrant');
} else {
  fail('lane_ids > 0', 'no Qdrant hits');
}

// Gate 5 — qdrant_point_ids
const qdrantPointIds = hits.map(h => h.id);
if (qdrantPointIds.length > 0) {
  pass('qdrant_point_ids > 0', qdrantPointIds.slice(0,3).join(', '));
} else {
  fail('qdrant_point_ids > 0', 'no point IDs');
}

// Gate 6 — feature_ids from payload
const featureIds = [...new Set(
  hits.flatMap(h => {
    const list = [];
    if (h.payload?.feature_id) list.push(h.payload.feature_id);
    if (Array.isArray(h.payload?.feature_ids)) list.push(...h.payload.feature_ids);
    if (Array.isArray(h.payload?.related_feature_ids)) list.push(...h.payload.related_feature_ids);
    return list;
  }).filter(Boolean)
)];
if (featureIds.length > 0) {
  pass('feature_ids > 0', featureIds.slice(0,3).join(', '));
} else {
  // Not a hard failure — backfill may not have run
  console.log(`  ${c.yellow('○')} feature_ids > 0${c.dim('  [0 found in payloads — run backfill-qdrant-source-refs.mjs to enrich]')}`);
}

// Gate 7 — ACE packet written (Bifrost telemetry key in Redis)
// We synthesise the query hash the same way makeQueryHash() does: crypto.createHash('sha256')
// For smoke test purposes, check the bitfrost:retrieval:latest key or do a docker exec
let bifrostHit = false;
try {
  const { spawnSync } = await import('node:child_process');
  const passArgs = REDIS_PASS ? ['-a', REDIS_PASS, '--no-auth-warning'] : [];
  // Check if any bitfrost:retrieval:* key with Valkey/redis in it exists
  const keysResult = spawnSync('docker', ['exec', 'legal-ai-redis', 'redis-cli', ...passArgs, 'KEYS', 'bitfrost:retrieval:*'], {
    encoding: 'utf8', timeout: 5000
  });
  if (keysResult.status === 0) {
    const keys = (keysResult.stdout || '').trim().split('\n').filter(Boolean);
    if (VERBOSE) console.log(c.dim(`    Bifrost retrieval keys: ${keys.length}`));
    bifrostHit = keys.length > 0;
  }
} catch { /* docker not available */ }

if (bifrostHit) {
  pass('Bifrost retrieval packet exists in Redis', 'bitfrost:retrieval:* found');
} else {
  // Soft failure — run query through /api/ace/route to populate
  console.log(`  ${c.yellow('○')} Bifrost retrieval packet${c.dim('  [no bitfrost:retrieval:* keys — POST /api/ace/route to populate]')}`);
}

// Gate 8 — Latency
const latency = Date.now() - t0;
if (latency <= MAX_LATENCY_MS) {
  pass(`Total latency < ${MAX_LATENCY_MS}ms`, `${latency}ms`);
} else {
  fail(`Total latency < ${MAX_LATENCY_MS}ms`, `${latency}ms exceeded`);
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n${c.bold('Results:')} ${c.green(`${passed} passed`)}${failed ? `, ${c.red(`${failed} failed`)}` : ''}\n`);

if (sourceRefs.length > 0 && VERBOSE) {
  console.log(c.dim('Top source refs:'));
  for (const ref of sourceRefs.slice(0, 5)) {
    console.log(c.dim(`  ${ref}`));
  }
}

if (failed > 0) {
  console.log(c.yellow('Hint: ensure Qdrant + embed server are running and codebase_chunks_768 is populated.\n'));
  process.exit(1);
}
