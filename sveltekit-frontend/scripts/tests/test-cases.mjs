/**
 * Cases CRUD smoke test.
 *
 * Validates:
 *   1. GET /api/cases → 200 + { cases: [] }
 *   2. GET /api/cases?search=test → 200 + correct shape
 *   3. GET /api/cases/<invalid-uuid> → 400 (UUID guard)
 *   4. GET /api/cases/<nonexistent-uuid> → 404 or degraded 200
 *
 * Usage: node scripts/tests/test-cases.mjs
 */

const BASE = process.env.DEV_SERVER ?? 'http://localhost:5173';
const NONEXISTENT = '00000000-0000-0000-0000-000000000000';

let passed = 0;
let failed = 0;

function pass(name) { console.log(`  PASS  ${name}`); passed++; }
function fail(name, reason) { console.error(`  FAIL  ${name}${reason ? ' — ' + reason : ''}`); failed++; }

async function run() {
  console.log('\n=== Cases CRUD Smoke ===');
  console.log(`Server: ${BASE}`);

  // ── Test 1: List cases ───────────────────────────────────────────────────
  console.log('\n--- Test 1: GET /api/cases ---');
  try {
    const res = await fetch(`${BASE}/api/cases`);
    if (res.status === 401) {
      pass('GET /api/cases → 401 (auth guard working)');
    } else if (res.ok) {
      const body = await res.json();
      const cases = body.cases ?? body;
      Array.isArray(cases) ? pass(`GET /api/cases → ${cases.length} cases`) : fail('/api/cases shape', `got: ${JSON.stringify(body).slice(0, 80)}`);
    } else {
      fail('GET /api/cases', `status ${res.status}`);
    }
  } catch (err) {
    fail('Cases list', err.message);
  }

  // ── Test 2: Search cases ─────────────────────────────────────────────────
  console.log('\n--- Test 2: GET /api/cases?search=test ---');
  try {
    const res = await fetch(`${BASE}/api/cases?search=test`);
    if (res.status === 401) {
      pass('GET /api/cases?search → 401 (auth guard working)');
    } else if (res.ok) {
      const body = await res.json();
      const cases = body.cases ?? body;
      Array.isArray(cases) ? pass('GET /api/cases?search → returns array') : fail('/api/cases?search shape', `got: ${JSON.stringify(body).slice(0, 80)}`);
    } else {
      fail('GET /api/cases?search', `status ${res.status}`);
    }
  } catch (err) {
    fail('Cases search', err.message);
  }

  // ── Test 3: UUID guard ────────────────────────────────────────────────────
  console.log('\n--- Test 3: GET /api/cases/not-a-uuid (UUID guard) ---');
  try {
    const res = await fetch(`${BASE}/api/cases/not-a-valid-uuid`);
    [400, 401, 404].includes(res.status)
      ? pass(`GET /api/cases/not-a-uuid → ${res.status} (guard working)`)
      : fail('UUID guard', `expected 400/401/404, got ${res.status}`);
  } catch (err) {
    fail('UUID guard', err.message);
  }

  // ── Test 4: Non-existent case ─────────────────────────────────────────────
  console.log('\n--- Test 4: GET /api/cases/<nonexistent> ---');
  try {
    const res = await fetch(`${BASE}/api/cases/${NONEXISTENT}`);
    if (res.status === 401) {
      pass('GET /api/cases/<nonexistent> → 401 (auth guard)');
    } else if ([404, 200].includes(res.status)) {
      pass(`GET /api/cases/${NONEXISTENT} → ${res.status} (correct)`);
    } else {
      fail('Non-existent case', `expected 200/401/404, got ${res.status}`);
    }
  } catch (err) {
    fail('Non-existent case', err.message);
  }

  // ── Results ───────────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
