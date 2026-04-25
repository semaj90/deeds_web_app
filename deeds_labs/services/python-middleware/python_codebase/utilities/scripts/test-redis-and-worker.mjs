#!/usr/bin/env node
// scripts/test-redis-and-worker.mjs
// Quick smoke test: verifies Redis endpoint and triggers the AI orchestrator test.
// Usage:
//   DEV_URL=http://localhost:5173 node ./scripts/test-redis-and-worker.mjs

import fetch from 'node-fetch';

const DEV_URL = process.env.DEV_URL || 'http://localhost:5173';
const TIMEOUT = Number(process.env.SMOKE_TIMEOUT || 15000);

function timeout(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function request(path, opts = {}) {
  const url = `${DEV_URL}${path}`;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    const res = await fetch(url, { signal: controller.signal, ...opts });
    clearTimeout(id);
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { ok: res.ok, status: res.status, body: json };
  } catch (err) {
    clearTimeout(id);
    return { ok: false, status: 0, error: err.message || String(err) };
  }
}

async function main() {
  console.log('Smoke test starting - dev url:', DEV_URL);

  console.log('\n1) Checking Redis health via /api/test/redis-connection');
  const redisResp = await request('/api/test/redis-connection');
  if (redisResp.ok) {
    console.log('  ✅ Redis endpoint OK:', redisResp.status);
    console.log('  Response:', redisResp.body);
  } else {
    console.error('  ❌ Redis endpoint failed:', redisResp.status || '', redisResp.error || '');
  }

  console.log('\n2) Triggering orchestrator test via POST /api/ai/test-orchestrator');
  const payload = {
    type: 'chat',
    content: 'Smoke test - please process',
    orchestrator: 'auto',
    priority: 'normal',
    useGPU: false
  };

  const orchestratorResp = await request('/api/ai/test-orchestrator', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (orchestratorResp.ok) {
    console.log('  ✅ Orchestrator request accepted:', orchestratorResp.status);
    console.log('  Response summary:', typeof orchestratorResp.body === 'object' ? orchestratorResp.body.type || '(object)' : orchestratorResp.body);
    console.log('  Full response:', orchestratorResp.body);
  } else {
    console.error('  ❌ Orchestrator request failed:', orchestratorResp.status || '', orchestratorResp.error || '');
  }

  // Basic pass/fail
  const passed = redisResp.ok && orchestratorResp.ok;
  console.log('\nSmoke test', passed ? 'PASSED ✅' : 'FAILED ❌');
  process.exit(passed ? 0 : 2);
}

// Run
main().catch((err) => {
  console.error('Smoke test error:', err);
  process.exit(3);
});
