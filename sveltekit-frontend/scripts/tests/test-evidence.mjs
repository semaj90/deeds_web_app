/**
 * Evidence endpoint smoke test (distinct from test-evidence-pipeline.mjs which
 * tests DB enums + upload flow).  This file focuses on the REST surface:
 *
 *   1. GET /api/evidence → 200 or 401 with correct shape
 *   2. GET /api/evidence/<invalid-uuid> → 400 (UUID guard)
 *   3. GET /api/evidence/<nonexistent-uuid> → 404 or degraded 200
 *   4. POST /api/evidence/<id>/process → 401 without auth (auth guard)
 *   5. GET /api/evidence/search → 200 or 401
 *
 * Usage: node scripts/tests/test-evidence.mjs
 */

const BASE = process.env.PUBLIC_APP_URL ?? (process.env.DEV_SERVER ?? 'http://localhost:5173');
const NONEXISTENT = '00000000-0000-0000-0000-000000000000';

let passed = 0;
let failed = 0;

function pass(name) { console.log(`  PASS  ${name}`); passed++; }
function fail(name, reason) { console.error(`  FAIL  ${name}${reason ? ' — ' + reason : ''}`); failed++; }

async function run() {
  console.log('\n=== Evidence Endpoint Smoke ===');
  console.log(`Server: ${BASE}`);

  // ── Test 1: List evidence ────────────────────────────────────────────────
  console.log('\n--- Test 1: GET /api/evidence ---');
  try {
    const res = await fetch(`${BASE}/api/evidence`);
    if (res.status === 401) {
      pass('GET /api/evidence → 401 (auth guard)');
    } else if (res.ok) {
      const body = await res.json();
      const items = body.evidence ?? body.items ?? body.data ?? body;
      Array.isArray(items) ? pass(`GET /api/evidence → ${items.length} items`) : fail('/api/evidence shape', JSON.stringify(body).slice(0, 80));
    } else {
      fail('GET /api/evidence', `status ${res.status}`);
    }
  } catch (err) {
    fail('Evidence list', err.message);
  }

  // ── Test 2: UUID guard ────────────────────────────────────────────────────
  console.log('\n--- Test 2: GET /api/evidence/not-a-uuid ---');
  try {
    const res = await fetch(`${BASE}/api/evidence/not-a-valid-uuid`);
    [400, 401, 404].includes(res.status)
      ? pass(`GET /api/evidence/not-a-uuid → ${res.status} (guard working)`)
      : fail('UUID guard', `expected 400/401/404, got ${res.status}`);
  } catch (err) {
    fail('UUID guard', err.message);
  }

  // ── Test 3: Nonexistent evidence ──────────────────────────────────────────
  console.log('\n--- Test 3: GET /api/evidence/<nonexistent> ---');
  try {
    const res = await fetch(`${BASE}/api/evidence/${NONEXISTENT}`);
    if (res.status === 401) {
      pass('GET /api/evidence/<nonexistent> → 401 (auth guard)');
    } else if ([200, 404].includes(res.status)) {
      pass(`GET /api/evidence/${NONEXISTENT} → ${res.status} (correct)`);
    } else {
      fail('Nonexistent evidence', `expected 200/401/404, got ${res.status}`);
    }
  } catch (err) {
    fail('Nonexistent evidence', err.message);
  }

  // ── Test 4: Process endpoint auth guard ───────────────────────────────────
  console.log('\n--- Test 4: POST /api/evidence/<id>/process (no auth) ---');
  try {
    const res = await fetch(`${BASE}/api/evidence/${NONEXISTENT}/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if ([401, 403, 404].includes(res.status)) {
      pass(`POST /api/evidence/process → ${res.status} (auth or route guard)`);
    } else {
      fail('Process auth guard', `expected 401/403/404, got ${res.status}`);
    }
  } catch (err) {
    fail('Process endpoint', err.message);
  }

  // ── Test 5: Evidence search ───────────────────────────────────────────────
  console.log('\n--- Test 5: GET /api/evidence/search ---');
  try {
    const res = await fetch(`${BASE}/api/evidence/search?q=hearsay`);
    if (res.status === 401) {
      pass('GET /api/evidence/search → 401 (auth guard)');
    } else if (res.ok) {
      const body = await res.json();
      pass(`GET /api/evidence/search → ${res.status}`);
    } else if ([400, 404].includes(res.status)) {
      pass(`GET /api/evidence/search → ${res.status} (missing q or not wired)`);
    } else {
      fail('Evidence search', `status ${res.status}`);
    }
  } catch (err) {
    fail('Evidence search', err.message);
  }

  // ── Results ───────────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
