#!/usr/bin/env node
/**
 * smoke-cluster-cards.mjs — Quick sanity check for /api/clusters/cards
 *
 * Tests:
 *  1. GET /api/clusters/cards                   → list (may be empty)
 *  2. GET /api/clusters/cards?collection=codebase_chunks
 *  3. POST /api/clusters/cards (upsert dummy)   → 201 created
 *  4. GET /api/clusters/cards?centroid_id={id}  → single card (Redis L1 then Postgres)
 *
 * Usage:
 *   node scripts/smoke-cluster-cards.mjs [base_url]
 *   node scripts/smoke-cluster-cards.mjs http://localhost:5173
 */

const BASE = process.argv[2] ?? 'http://localhost:5173';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY ?? '';

const DUMMY_ID = crypto.randomUUID();

let pass = 0, fail = 0;

async function test(name, fn) {
  try {
    const result = await fn();
    if (result) {
      console.log(`  PASS ${name.padEnd(55)} ✓ ${JSON.stringify(result).slice(0, 80)}`);
      pass++;
    } else {
      console.log(`  FAIL ${name.padEnd(55)} ✗ returned falsy`);
      fail++;
    }
  } catch (e) {
    console.log(`  FAIL ${name.padEnd(55)} ✗ ${e.message}`);
    fail++;
  }
}

console.log(`\n=== Smoke: ClusterCards API at ${BASE} ===\n`);

// 1. List all cards
await test('GET /api/clusters/cards (list)', async () => {
  const res = await fetch(`${BASE}/api/clusters/cards`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { count: data.count, source: data.source };
});

// 2. Filter by collection
await test('GET /api/clusters/cards?collection=codebase_chunks', async () => {
  const res = await fetch(`${BASE}/api/clusters/cards?collection=codebase_chunks`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { count: data.count, collection: data.collection };
});

// 3. POST (upsert) a dummy card
await test('POST /api/clusters/cards (upsert dummy)', async () => {
  const res = await fetch(`${BASE}/api/clusters/cards`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-key': SERVICE_KEY,
    },
    body: JSON.stringify({
      centroidId: DUMMY_ID,
      collection: 'smoke_test',
      topChunkIds: [],
      topFilePaths: ['scripts/smoke-cluster-cards.mjs'],
      topTags: ['smoke', 'test'],
      clusterSummary: 'Smoke test card — safe to delete',
      authorityScore: 0.01,
      memberCount: 1,
    }),
  });
  if (res.status !== 201) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { upserted: data.upserted, id: data.card?.centroidId?.slice(0, 8) };
});

// 4. Fetch single card (should come from Redis L1 now)
await test(`GET /api/clusters/cards?centroid_id=${DUMMY_ID.slice(0, 8)}... (Redis L1)`, async () => {
  const res = await fetch(`${BASE}/api/clusters/cards?centroid_id=${DUMMY_ID}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { source: data.source, id: data.card?.centroidId?.slice(0, 8) };
});

console.log(`\n  ${pass} passed  ${fail} failed\n`);
process.exit(fail > 0 ? 1 : 0);
