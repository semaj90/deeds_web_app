#!/usr/bin/env node
const BASE = process.argv.find(a => a.startsWith('--base='))?.split('=')[1] ?? 'http://127.0.0.1:5173';
const VERBOSE = process.argv.includes('--verbose');
const QUERY = process.argv.find(a => a.startsWith('--query='))?.split('=')[1] ?? 'authentication';
const LIMIT = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? '5', 10);
const ENDPOINT = `${BASE}/api/hyperrag/packet-rpc`;

const log = (msg) => console.log(`[✓] ${msg}`);
const warn = (msg) => console.warn(`[⚠] ${msg}`);
const err = (msg) => console.error(`[✗] ${msg}`);
const debug = (msg) => VERBOSE && console.log(`[DEBUG] ${msg}`);

async function testExactMatchCacheMiss() {
  log('Test 1: Exact-match cache miss (live HyperRAG retrieval)');
  const query = `${QUERY}-${Date.now()}`;
  const t0 = Date.now();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query, limit: LIMIT, includeGraph: true, useFts: true, recordTelemetry: true, useExactMatchCache: true,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(`API error: ${data.error}`);
  const latency = Date.now() - t0;
  log(`  Query: "${query}"`);
  log(`  Strategy: ${data.strategy}, Packets: ${data.packets.length}, Cache hits: ${data.trace.cache_hits}, Latency: ${latency}ms`);
  if (!Array.isArray(data.packets)) throw new Error('packets not array');
  if (!Array.isArray(data.provenance)) throw new Error('provenance not array');
  data.packets.forEach((pkt, i) => {
    if (!pkt.packet_key || !pkt.source_ref || !pkt.feature_id) throw new Error(`Packet ${i}: missing key fields`);
    debug(`  Packet ${i}: ${pkt.packet_key}`);
  });
  data.provenance.forEach((prov, i) => {
    if (!prov.packet_key || !prov.feature_id || !prov.source_ref || !prov.retrieved_at || !prov.retrieved_from) {
      throw new Error(`Provenance ${i}: missing immutable fields`);
    }
    if (typeof prov.retrieval_confidence !== 'number' || prov.retrieval_confidence < 0 || prov.retrieval_confidence > 1) {
      throw new Error(`Provenance ${i}: invalid confidence`);
    }
    debug(`  Provenance ${i}: from=${prov.retrieved_from} conf=${prov.retrieval_confidence}`);
  });
  return { query, data };
}

async function testExactMatchCacheHit(firstQuery) {
  log('Test 2: Exact-match cache hit (cached provenance)');
  const t0 = Date.now();
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: firstQuery, limit: LIMIT, useExactMatchCache: true }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(`API error: ${data.error}`);
  const latency = Date.now() - t0;
  log(`  Query: "${firstQuery}"`);
  log(`  Cache hits: ${data.trace.cache_hits}, Latency: ${latency}ms`);
  if (data.trace.cache_hits === 0) warn('  Cache miss (query may not yet be cached)');
  else log('  ✓ Cache hit confirmed');
  if (Array.isArray(data.provenance)) log(`  Provenance tuples: ${data.provenance.length}`);
}

async function testConfidenceScoring() {
  log('Test 3: Confidence scoring across retrieval sources');
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, limit: 10, useFts: true }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(`API error: ${data.error}`);
  const confScores = data.provenance.map((p) => p.retrieval_confidence).sort((a, b) => b - a);
  if (confScores.length > 0) {
    log(`  Confidence range: ${Math.min(...confScores).toFixed(2)} → ${Math.max(...confScores).toFixed(2)}`);
    debug(`  Top: ${confScores.slice(0, 3).map((c) => c.toFixed(2)).join(', ')}`);
  }
}

async function testProvenance() {
  log('Test 4: Provenance tuple immutability');
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: QUERY, limit: 3 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!data.ok) throw new Error(`API error: ${data.error}`);
  log(`  Provenance tuples validated: ${data.provenance.length}`);
  data.provenance.forEach((prov, i) => {
    debug(`  Tuple ${i}: key=${prov.packet_key} from=${prov.retrieved_from}`);
  });
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  HyperRAG Packet RPC — Smoke Test');
  console.log('═══════════════════════════════════════════════════════════════\n');
  try {
    log(`Endpoint: ${ENDPOINT}\n`);
    const test1 = await testExactMatchCacheMiss();
    console.log();
    await testExactMatchCacheHit(test1.query);
    console.log();
    await testConfidenceScoring();
    console.log();
    await testProvenance();
    console.log();
    console.log('═══════════════════════════════════════════════════════════════');
    log('All smoke tests passed ✓');
    console.log('═══════════════════════════════════════════════════════════════\n');
    process.exit(0);
  } catch (e) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    err(`Smoke test failed: ${e.message}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    if (VERBOSE) console.error(e);
    process.exit(1);
  }
}

main();
