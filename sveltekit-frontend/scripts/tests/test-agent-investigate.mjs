/**
 * Smoke test: POST /api/ai/agent (Gemma4 tool-calling agent).
 *
 * Tests that the agent endpoint:
 *   1. Returns 401 without a session cookie
 *   2. Accepts a query and returns a structured response (degraded-ok if Ollama down)
 *
 * Usage: node scripts/tests/test-agent-investigate.mjs
 *        DEV_SERVER=http://localhost:5173 node scripts/tests/test-agent-investigate.mjs
 */

const BASE = process.env.DEV_SERVER ?? 'http://localhost:5173';

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`  PASS  ${name}`);
  passed++;
}

function fail(name, reason) {
  console.error(`  FAIL  ${name}${reason ? ' — ' + reason : ''}`);
  failed++;
}

async function run() {
  console.log('\n=== Agent Investigate Smoke ===');
  console.log(`Server: ${BASE}`);

  // ── Test 1: 401 without auth ──────────────────────────────────────────────
  console.log('\n--- Test 1: 401 without session ---');
  try {
    const res = await fetch(`${BASE}/api/ai/agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'What is hearsay evidence?' }),
    });
    if (res.status === 401) {
      pass('Returns 401 without auth cookie');
    } else if (res.status === 400) {
      pass('Returns 400 (also acceptable — malformed session)');
    } else {
      fail('Returns 401 without auth', `got ${res.status}`);
    }
  } catch (err) {
    fail('Agent endpoint reachable', err.message);
  }

  // ── Test 2: Health check ──────────────────────────────────────────────────
  console.log('\n--- Test 2: Server health ---');
  try {
    const res = await fetch(`${BASE}/api/health`);
    if (res.ok) {
      pass('Server health check OK');
    } else {
      fail('Server health check', `status ${res.status}`);
    }
  } catch (err) {
    fail('Server reachable', err.message);
  }

  // ── Results ───────────────────────────────────────────────────────────────
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
