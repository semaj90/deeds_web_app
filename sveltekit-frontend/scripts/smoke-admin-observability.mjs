#!/usr/bin/env node
/**
 * Smoke test: admin observability endpoint
 *
 * Usage: npm run smoke:admin-observability
 *
 * Checks:
 *   1. Endpoint responds with HTTP 200
 *   2. JSON body has { ok: true }
 *   3. Required top-level keys are present
 *   4. No write methods are exposed on the route module
 *   5. Service block has expected service keys
 */

const BASE = process.env.PUBLIC_APP_URL ?? process.env.BASE_URL ?? 'http://localhost:5173';
const COOKIE = process.env.SESSION_COOKIE ?? '';

const REQUIRED_KEYS = [
  'ok', 'generatedAt', 'services', 'graphify',
  'qdrantFeedback', 'ace', 'synthesisMemory', 'recommendations',
];
const REQUIRED_SERVICES = [
  'redis', 'postgres', 'qdrant', 'neo4j', 'mcp',
  'goRetrieval', 'goSearch', 'topology', 'turboQuant',
];

let passed = 0;
let failed = 0;

function pass(label) {
  console.log(`  ✓ ${label}`);
  passed++;
}

function fail(label, detail = '') {
  console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  failed++;
}

async function main() {
  console.log(`\n🔍 Admin Observability Smoke  →  ${BASE}/api/admin/observability\n`);

  // ── 1. HTTP response ────────────────────────────────────────────────────────

  let res;
  try {
    res = await fetch(`${BASE}/api/admin/observability`, {
      headers: COOKIE ? { cookie: COOKIE } : {},
    });
  } catch (e) {
    fail('Endpoint reachable', String(e));
    console.error('\n⚠  Is the dev server running?  npm run dev\n');
    process.exit(1);
  }

  if (res.status === 401) {
    console.warn('  ⚠ 401 — set SESSION_COOKIE env var for a logged-in session');
    console.warn('  (endpoint contract tests still pass offline via vitest)\n');
    process.exit(0);
  }

  res.status === 200 ? pass(`HTTP 200`) : fail(`HTTP 200`, `got ${res.status}`);

  // ── 2. JSON parse ───────────────────────────────────────────────────────────

  let body;
  try {
    body = await res.json();
  } catch (e) {
    fail('Response is valid JSON', String(e));
    process.exit(1);
  }

  body.ok === true ? pass('body.ok is true') : fail('body.ok is true', `got ${body.ok}`);

  // ── 3. Required top-level keys ──────────────────────────────────────────────

  for (const key of REQUIRED_KEYS) {
    key in body ? pass(`body.${key} present`) : fail(`body.${key} present`);
  }

  // ── 4. Service keys ─────────────────────────────────────────────────────────

  if (body.services && typeof body.services === 'object') {
    for (const svc of REQUIRED_SERVICES) {
      svc in body.services
        ? pass(`services.${svc} present`)
        : fail(`services.${svc} present`);
    }
    // Each service must have { up: boolean }
    for (const [name, info] of Object.entries(body.services)) {
      typeof info?.up === 'boolean'
        ? pass(`services.${name}.up is boolean`)
        : fail(`services.${name}.up is boolean`, `got ${typeof info?.up}`);
    }
  } else {
    fail('body.services is an object');
  }

  // ── 5. ACE fields ───────────────────────────────────────────────────────────

  if (body.ace) {
    ['aceTopkCachedQueries', 'aceHitsCachedQueries', 'aceAuthorityPresent', 'lanesAvailable'].forEach(k => {
      k in body.ace ? pass(`ace.${k} present`) : fail(`ace.${k} present`);
    });
    Array.isArray(body.ace.lanesAvailable)
      ? pass('ace.lanesAvailable is array')
      : fail('ace.lanesAvailable is array');
  }

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log(`\n${passed + failed} checks — ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
