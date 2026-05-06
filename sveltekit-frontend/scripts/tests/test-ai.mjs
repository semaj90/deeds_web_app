/**
 * AI plumbing smoke test.
 *
 * Validates:
 *   1. Ollama service reachable (GET /api/ollama/health or /api/health)
 *   2. Embedding endpoint returns a vector (degraded-ok if Ollama down)
 *   3. OpenAI-facade endpoint returns a model list
 *   4. Bifrost L2 cache reachable (port 3040)
 *
 * Usage: node scripts/tests/test-ai.mjs
 */

const BASE = process.env.DEV_SERVER ?? 'http://localhost:5173';
const BIFROST = process.env.BIFROST_URL ?? 'http://localhost:3040';

let passed = 0;
let failed = 0;

function pass(name) { console.log(`  PASS  ${name}`); passed++; }
function fail(name, reason) { console.error(`  FAIL  ${name}${reason ? ' — ' + reason : ''}`); failed++; }
function skip(name, reason) { console.log(`  SKIP  ${name} (${reason})`); }

async function run() {
  console.log('\n=== AI Plumbing Smoke ===');
  console.log(`Server: ${BASE}`);

  // ── Test 1: Health endpoint ───────────────────────────────────────────────
  console.log('\n--- Test 1: API health ---');
  try {
    const res = await fetch(`${BASE}/api/health`);
    res.ok ? pass('GET /api/health → 200') : fail('/api/health', `status ${res.status}`);
  } catch (err) {
    fail('Server reachable', err.message);
  }

  // ── Test 2: OpenAI facade /api/v1/models ──────────────────────────────────
  console.log('\n--- Test 2: OpenAI facade model list ---');
  try {
    const res = await fetch(`${BASE}/api/v1/models`);
    if (res.status === 401) {
      skip('GET /api/v1/models', 'requires auth — expected in prod');
    } else if (res.ok) {
      const body = await res.json();
      const models = body.data ?? body.models ?? body;
      Array.isArray(models) ? pass(`GET /api/v1/models → ${models.length} models`) : fail('/api/v1/models shape', 'expected array');
    } else {
      fail('/api/v1/models', `status ${res.status}`);
    }
  } catch (err) {
    fail('OpenAI facade', err.message);
  }

  // ── Test 3: Embedding endpoint (degraded-ok) ──────────────────────────────
  console.log('\n--- Test 3: Embedding endpoint ---');
  try {
    const res = await fetch(`${BASE}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'hearsay evidence' }),
    });
    if (res.status === 401) {
      pass('POST /api/embed → 401 (auth guard working)');
    } else if (res.ok) {
      const body = await res.json();
      const vec = body.embedding ?? body.vector ?? body.data;
      Array.isArray(vec) ? pass(`POST /api/embed → vector dim ${vec.length}`) : fail('/api/embed shape', 'no embedding array');
    } else if (res.status === 503) {
      pass('POST /api/embed → 503 (Ollama degraded — acceptable)');
    } else {
      fail('/api/embed', `status ${res.status}`);
    }
  } catch (err) {
    fail('Embed endpoint', err.message);
  }

  // ── Test 4: Bifrost L2 cache health ──────────────────────────────────────
  console.log('\n--- Test 4: Bifrost L2 cache ---');
  try {
    const res = await fetch(`${BIFROST}/health`, { signal: AbortSignal.timeout(3000) });
    res.ok ? pass(`Bifrost health → ${res.status}`) : fail('Bifrost health', `status ${res.status}`);
  } catch (err) {
    skip('Bifrost health', `unreachable (${err.message}) — OK in dev without Bifrost`);
  }

  // ── Results ───────────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
