import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createTopologySearchServer } from './topology-search-server.mjs';
import { validateSearchRequest } from './topology-search-contract.mjs';

async function withServer(t, handlers, options = {}) {
  const server = createTopologySearchServer({ handlers, allowedOrigin: 'http://127.0.0.1:5173', ...options });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  return base;
}

const handlers = (overrides = {}) => ({
  health: async () => ({ status: 200, body: { ok: true, status: 'live', readiness: 'not_checked' } }),
  ready: async () => ({ status: 503, body: { ok: false, status: 'not_ready', checks: { postgres: 'unavailable', qdrant: 'unavailable' } } }),
  search: async ({ body }) => ({ status: 200, body: { ok: true, rankingMode: 'topology_only', topologyStatus: 'used', hits: [], received: body } }),
  cosine: async ({ body }) => ({ status: 200, body: { ok: true, rankingMode: 'cosine', topologyStatus: 'not_requested', hits: [], received: body } }),
  hybrid: async ({ body }) => ({ status: 200, body: { ok: true, rankingMode: 'cosine_only', topologyStatus: 'unavailable', fallbackReason: 'topology_query_failed', hits: [], received: body } }),
  ...overrides,
});

test('HTTP health stays live while readiness reports missing dependencies', async (t) => {
  const base = await withServer(t, handlers());
  const live = await fetch(`${base}/health`);
  const ready = await fetch(`${base}/ready`);
  assert.equal(live.status, 200);
  assert.deepEqual(await live.json(), { ok: true, status: 'live', readiness: 'not_checked' });
  assert.equal(ready.status, 503);
  assert.deepEqual((await ready.json()).checks, { postgres: 'unavailable', qdrant: 'unavailable' });
});

test('HTTP search routes preserve route-specific ranking and fallback metadata', async (t) => {
  const base = await withServer(t, handlers());
  const cases = [
    ['/search', { center: [1, 2, 3, 4] }, 'topology_only', 'used'],
    ['/search/cosine', { query: 'case law' }, 'cosine', 'not_requested'],
    ['/search/hybrid', { query: 'case law' }, 'cosine_only', 'unavailable'],
  ];
  for (const [path, body, rankingMode, topologyStatus] of cases) {
    const response = await fetch(`${base}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.rankingMode, rankingMode);
    assert.equal(payload.topologyStatus, topologyStatus);
    if (path === '/search/hybrid') assert.equal(payload.fallbackReason, 'topology_query_failed');
  }
});

test('HTTP rejects malformed JSON and invalid route parameters before calling a service', async (t) => {
  let calls = 0;
  const base = await withServer(t, handlers({
    hybrid: async ({ body }) => {
      calls += 1;
      const validation = validateSearchRequest('/search/hybrid', body);
      return validation.ok
        ? { status: 200, body: { ok: true, rankingMode: 'hybrid', topologyStatus: 'used', hits: [] } }
        : { status: 400, body: { ok: false, code: 'INVALID_SEARCH_REQUEST', error: validation.error } };
    },
  }));
  const malformed = await fetch(`${base}/search/hybrid`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).code, 'INVALID_JSON');
  const invalid = await fetch(`${base}/search/hybrid`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'valid', limit: 101 }) });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).code, 'INVALID_SEARCH_REQUEST');
  assert.equal(calls, 1);
});

test('HTTP bounds request/response sizes and maps timeouts and dependency failures explicitly', async (t) => {
  const base = await withServer(t, handlers({
    search: async () => { throw Object.assign(new Error('database details must not leak'), { code: 'TOPOLOGY_QUERY_FAILED' }); },
    cosine: async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); },
    hybrid: async () => ({ status: 200, body: { ok: true, rankingMode: 'cosine_only', topologyStatus: 'unavailable', fallbackReason: 'topology_query_failed', hits: [], detail: 'x'.repeat(600 * 1024) } }),
  }), { maxBodyBytes: 64 });

  const tooLargeRequest = await fetch(`${base}/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ center: [1, 2, 3, 4], padding: 'x'.repeat(100) }) });
  assert.equal(tooLargeRequest.status, 413);
  assert.equal((await tooLargeRequest.json()).code, 'REQUEST_TOO_LARGE');

  const dependencyFailure = await fetch(`${base}/search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(dependencyFailure.status, 503);
  const dependencyBody = await dependencyFailure.json();
  assert.equal(dependencyBody.error, 'Dependency unavailable');
  assert.equal(dependencyBody.code, 'TOPOLOGY_QUERY_FAILED');

  const timeout = await fetch(`${base}/search/cosine`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'law' }) });
  assert.equal(timeout.status, 504);
  assert.equal((await timeout.json()).code, 'DEPENDENCY_TIMEOUT');

  const largeResponse = await fetch(`${base}/search/hybrid`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: 'law' }) });
  assert.equal(largeResponse.status, 500);
  assert.equal((await largeResponse.json()).code, 'RESPONSE_TOO_LARGE');
});

test('HTTP reports methods and paths without accidentally invoking search handlers', async (t) => {
  let calls = 0;
  const base = await withServer(t, handlers({ hybrid: async () => { calls += 1; return { status: 200, body: {} }; } }));
  assert.equal((await fetch(`${base}/search/hybrid`)).status, 405);
  assert.equal((await fetch(`${base}/not-a-route`)).status, 404);
  assert.equal(calls, 0);
});
