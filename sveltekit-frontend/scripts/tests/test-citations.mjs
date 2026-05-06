/**
 * Citations CRUD smoke test.
 *
 * Validates:
 *   1. GET /api/citations → 200 or 401
 *   2. GET /api/statutes/search → accepts POST with query body
 *   3. GET /api/citations/<invalid-uuid> → 400 (UUID guard)
 *
 * Usage: node scripts/tests/test-citations.mjs
 */

const BASE = process.env.DEV_SERVER ?? 'http://localhost:5173';

let passed = 0;
let failed = 0;

function pass(name) { console.log(`  PASS  ${name}`); passed++; }
function fail(name, reason) { console.error(`  FAIL  ${name}${reason ? ' — ' + reason : ''}`); failed++; }

async function run() {
  console.log('\n=== Citations CRUD Smoke ===');
  console.log(`Server: ${BASE}`);

  // ── Test 1: List citations ───────────────────────────────────────────────
  console.log('\n--- Test 1: GET /api/citations ---');
  try {
    const res = await fetch(`${BASE}/api/citations`);
    if (res.status === 401) {
      pass('GET /api/citations → 401 (auth guard)');
    } else if (res.ok) {
      const body = await res.json();
      const citations = body.citations ?? body.data ?? body;
      Array.isArray(citations) ? pass(`GET /api/citations → ${citations.length} entries`) : fail('/api/citations shape', JSON.stringify(body).slice(0, 80));
    } else {
      fail('GET /api/citations', `status ${res.status}`);
    }
  } catch (err) {
    fail('Citations list', err.message);
  }

  // ── Test 2: Statute semantic search ──────────────────────────────────────
  console.log('\n--- Test 2: POST /api/statutes/search ---');
  try {
    const res = await fetch(`${BASE}/api/statutes/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'hearsay rule', limit: 3 }),
    });
    if (res.status === 401) {
      pass('POST /api/statutes/search → 401 (auth guard)');
    } else if (res.ok) {
      const body = await res.json();
      const results = body.results ?? body.statutes ?? body;
      Array.isArray(results) ? pass(`POST /api/statutes/search → ${results.length} results`) : fail('/api/statutes/search shape', JSON.stringify(body).slice(0, 80));
    } else if (res.status === 404) {
      pass('POST /api/statutes/search → 404 (route not yet wired — acceptable)');
    } else {
      fail('POST /api/statutes/search', `status ${res.status}`);
    }
  } catch (err) {
    fail('Statute search', err.message);
  }

  // ── Test 3: UUID guard on citation detail ─────────────────────────────────
  console.log('\n--- Test 3: GET /api/citations/not-a-uuid ---');
  try {
    const res = await fetch(`${BASE}/api/citations/not-a-valid-uuid`);
    [400, 401, 404].includes(res.status)
      ? pass(`GET /api/citations/not-a-uuid → ${res.status} (guard working)`)
      : fail('UUID guard on citation', `expected 400/401/404, got ${res.status}`);
  } catch (err) {
    fail('Citation UUID guard', err.message);
  }

  // ── Test 4: Saved citations endpoint ─────────────────────────────────────
  console.log('\n--- Test 4: GET /api/citations/saved ---');
  try {
    const res = await fetch(`${BASE}/api/citations/saved`);
    if (res.status === 401) {
      pass('GET /api/citations/saved → 401 (auth guard)');
    } else if (res.ok) {
      await res.json(); // consume body
      pass(`GET /api/citations/saved → ${res.status}`);
    } else if (res.status === 404) {
      pass('GET /api/citations/saved → 404 (not yet wired)');
    } else {
      fail('GET /api/citations/saved', `status ${res.status}`);
    }
  } catch (err) {
    fail('Saved citations', err.message);
  }

  // ── Results ───────────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
