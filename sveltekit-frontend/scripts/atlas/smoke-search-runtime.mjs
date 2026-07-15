/**
 * Smoke test: real query through the full SearchRuntime pipeline
 *
 * Requires dev server running at http://localhost:5173
 * and all backing services (Postgres, Qdrant, Ollama) up.
 *
 * Usage:
 *   node scripts/atlas/smoke-search-runtime.mjs
 *   node scripts/atlas/smoke-search-runtime.mjs "authentication session handling"
 *   node scripts/atlas/smoke-search-runtime.mjs --infra-only   (skip live search)
 */

const INFRA_ONLY = process.argv.includes('--infra-only');
const QUERY = process.argv.filter(a => !a.startsWith('--'))[2] ?? 'authentication session validation';
const BASE = process.env.SVELTEKIT_URL ?? 'http://localhost:5173';
const OLLAMA = process.env.OLLAMA_URL ?? 'http://localhost:11434';
const QDRANT = process.env.QDRANT_URL ?? 'http://localhost:6333';
const TIMEOUT_MS = 30_000;
const EXPECTED_DIM = 384;
const NATIVE_DIM = 768; // embeddinggemma:latest native output; app slices to 384

const GATE = {
  embed:  `${OLLAMA}/api/embed`,
  qdrant: `${QDRANT}/collections/codebase_chunks_384_hybrid`,
  search: `${BASE}/api/retrieval/search-unified`,
};

async function check(label, fn) {
  process.stdout.write(`  ${label}... `);
  try {
    const result = await fn();
    console.log(`✅  ${result}`);
    return true;
  } catch (err) {
    console.log(`❌  ${err.message}`);
    return false;
  }
}

// ── Gate 1: Ollama /api/embed returns a usable vector ────────────────────────
// embeddinggemma:latest is a 768-dim model; the application truncates to 384
// before storing in Qdrant. Gate checks: model responds, returns ≥384 dims.
async function checkOllama() {
  const res = await fetch(GATE.embed, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', input: 'test' }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — is Ollama running at ${OLLAMA}?`);
  const data = await res.json();
  // /api/embed returns { embeddings: [[...]] }
  const vec = data?.embeddings?.[0] ?? data?.embedding;
  if (!Array.isArray(vec)) throw new Error(`unexpected response shape: ${JSON.stringify(data).slice(0, 100)}`);
  if (vec.length < EXPECTED_DIM) {
    throw new Error(`got ${vec.length}-dim — need ≥${EXPECTED_DIM} (app truncates to ${EXPECTED_DIM} before Qdrant)`);
  }
  const note = vec.length === NATIVE_DIM ? ` (native ${NATIVE_DIM}-dim, app truncates to ${EXPECTED_DIM})` : '';
  return `embeddinggemma:latest → ${vec.length}-dim${note} ✓`;
}

// ── Gate 2: Qdrant codebase_chunks_384_hybrid collection exists + has points ───
async function checkQdrant() {
  const res = await fetch(GATE.qdrant, { signal: AbortSignal.timeout(5_000) });
  if (res.status === 404) throw new Error('codebase_chunks_384_hybrid missing — run npm run atlas:backfill:hybrid');
  if (!res.ok) throw new Error(`HTTP ${res.status} — is Qdrant running at ${QDRANT}?`);
  const { result } = await res.json();
  // Qdrant v1.x uses points_count; v1.7+ also has vectors_count
  const count = result?.points_count ?? result?.vectors_count;
  if (count === 0) throw new Error('collection exists but has 0 points — run npm run atlas:backfill:hybrid');
  if (count === undefined) throw new Error(`unexpected payload shape: ${JSON.stringify(result).slice(0, 100)}`);
  return `codebase_chunks_384_hybrid — ${count.toLocaleString()} points`;
}

// ── Gate 3: Dev server responds ───────────────────────────────────────────────
async function checkDevServer() {
  const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3_000) });
  // /api/health may not exist — a 404 still means the server is up
  if (res.status >= 500) throw new Error(`server returned HTTP ${res.status}`);
  return `${BASE} reachable (HTTP ${res.status})`;
}

// ── Search pipeline ───────────────────────────────────────────────────────────
async function runSearch() {
  const res = await fetch(GATE.search, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: QUERY, topK: 5 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const detail = body?.error ?? JSON.stringify(body).slice(0, 200);
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }

  // The route's 500 fallback returns { error, packets: [] } with status 500 —
  // but double-check in case it slips through with a 200
  if (body?.error && (body?.packets?.length ?? 0) === 0) {
    throw new Error(`pipeline error: ${body.error}`);
  }

  return body;
}

// ── Main ─────────────────────────────────────────────────────────────────────
console.log('\n=== SearchRuntime Smoke Test ===');
console.log(`Query  : "${QUERY}"`);
console.log(`Server : ${BASE}`);
if (INFRA_ONLY) console.log('Mode   : --infra-only (skipping live search)\n');
else console.log('');

console.log('Infrastructure gates:');
const [ollamaOk, qdrantOk, serverOk] = await Promise.all([
  check('Ollama /api/embed ≥384-dim', checkOllama),
  check('Qdrant codebase_chunks_384_hybrid', checkQdrant),
  check('Dev server reachable', checkDevServer),
]);

if (!ollamaOk || !qdrantOk) {
  console.error('\n❌ Infra not ready — fix the failing gates above before running search.');
  process.exit(1);
}

if (!serverOk) {
  console.error('\n❌ Dev server not reachable — run `npm run dev` first.');
  process.exit(1);
}

if (INFRA_ONLY) {
  console.log('\n✅ All infra gates pass.');
  process.exit(0);
}

console.log('\nRunning live search pipeline...');
const t0 = Date.now();
let result;
try {
  result = await runSearch();
} catch (err) {
  console.error(`\n❌ Search failed: ${err.message}`);
  process.exit(1);
}
const elapsed = Date.now() - t0;

// ── Validate response shape ───────────────────────────────────────────────────
const packets = result?.packets ?? [];
const meta    = result?.metadata ?? {};
const prov    = result?.provenance ?? {};

console.log('\nResults:');
console.log(`  Total wall time  : ${elapsed}ms`);
console.log(`  Candidates       : ${meta.candidatesRetrieved ?? '?'} retrieved → ${meta.candidatesFused ?? '?'} fused → ${meta.candidatesReranked ?? '?'} reranked`);
console.log(`  Returned packets : ${packets.length}`);
console.log(`  Sources          : ${(prov.retrievalSources ?? []).join(', ') || '(none)'}`);
console.log(`  Fusion           : ${prov.fusionMethod ?? '?'}`);
console.log(`  Reranker used    : ${prov.rerankerUsed ?? '?'}`);
if (meta.stages) {
  const s = meta.stages;
  console.log(`  Stage timings    : retrieve=${s.retrieve}ms  fuse=${s.fuse}ms  hydrate=${s.hydrate}ms  rerank=${s.rerank}ms`);
}

// ── Validate packet identities ────────────────────────────────────────────────
let identityErrors = 0;
if (packets.length > 0) {
  console.log('\nTop packets:');
  for (let i = 0; i < Math.min(packets.length, 5); i++) {
    const p = packets[i];
    const hasId  = Boolean(p.chunk_id);
    const hasPk  = Boolean(p.packet_key);
    const hasSrc = Boolean(p.source_ref);
    if (!hasId || !hasPk || !hasSrc) identityErrors++;
    const tag = (hasId && hasPk && hasSrc) ? '✅' : '❌';
    const missing = [!hasId && 'chunk_id', !hasPk && 'packet_key', !hasSrc && 'source_ref'].filter(Boolean);
    console.log(`  ${i + 1}. ${tag} ${p.source_ref ?? '(no source_ref)'}`);
    if (missing.length) console.log(`       MISSING: ${missing.join(', ')}`);
    else console.log(`       chunk_id=${p.chunk_id}  packet_key=${p.packet_key}`);
    if (p.summary) console.log(`       summary: ${String(p.summary).slice(0, 80)}…`);
  }
}

// ── Final verdict ─────────────────────────────────────────────────────────────
console.log('\n--- Verdict ---');
if (packets.length === 0) {
  // Zero results is a warning, not a hard failure — index may be sparsely populated
  console.log('⚠️  WARN: zero packets returned');
  console.log('    Check: does codebase_chunks_384_hybrid have points? Is Postgres populated?');
  console.log('    Run: npm run atlas:backfill:hybrid');
  process.exit(0);
} else if (identityErrors > 0) {
  console.log(`❌ FAIL: ${identityErrors} packet(s) with missing identity fields (chunk_id / packet_key / source_ref)`);
  process.exit(1);
} else {
  console.log(`✅ PASS: ${packets.length} packets returned, all with complete identities (${elapsed}ms)`);
}
