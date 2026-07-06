#!/usr/bin/env node
/**
 * Phase D: TurboVec Sidecar Smoke Test
 *
 * Verify TurboVec sidecar is online and can index/search corpus.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../');
const TURBOVEC_HOST = process.env.TURBOVEC_HOST || 'http://127.0.0.1:8791';

async function checkHealth() {
  const start = Date.now();
  try {
    const res = await fetch(`${TURBOVEC_HOST}/health`, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    if (!res.ok) return { ok: false, status: res.status, latency };
    const body = await res.json();
    return { ok: true, status: 200, latency, body };
  } catch (err) {
    return { ok: false, error: err.message, latency: Date.now() - start };
  }
}

async function testQuery(query) {
  const start = Date.now();
  try {
    const res = await fetch(`${TURBOVEC_HOST}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit: 10 }),
      signal: AbortSignal.timeout(10000),
    });
    const latency = Date.now() - start;
    if (!res.ok) return { ok: false, status: res.status, latency, query };
    const body = await res.json();
    return { ok: true, query, latency, results: body.results || [] };
  } catch (err) {
    return { ok: false, error: err.message, latency: Date.now() - start, query };
  }
}

async function main() {
  console.log('[phase-d] TurboVec Sidecar Smoke Test');
  console.log(`[phase-d] Host: ${TURBOVEC_HOST}\n`);

  const health = await checkHealth();
  console.log('[check-1] Health:', health.ok ? '✅ PASS' : '❌ FAIL', `(${health.latency}ms)`);

  const query = await testQuery('authentication session');
  console.log('[check-2] Query:', query.ok ? '✅ PASS' : '❌ FAIL', `(${query.results?.length || 0} results)`);

  const allPass = health.ok && query.ok;
  console.log('\n[summary]', allPass ? '✅ PASS' : '⚠️ FAIL');

  if (!allPass) {
    console.log('[action] Check: docker ps | grep turbovec');
    process.exit(1);
  }
}

main();
