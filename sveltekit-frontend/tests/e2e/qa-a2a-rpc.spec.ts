import { test, expect } from './fixtures/qa';

// JSON-RPC 2.0 contract for /api/agent/rpc (A2A-facing gateway).
// Codes: -32700 parse error, -32602 invalid params, -32601 method not found.

test('A2A RPC: malformed JSON -> 400 with JSON-RPC -32700', { tag: '@feature:agent.a2a.rpc' }, async ({ request }) => {
  const response = await request.post('/api/agent/rpc', {
    data: Buffer.from('{bad'),
    headers: { 'content-type': 'application/json' },
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.jsonrpc).toBe('2.0');
  expect(body.error.code).toBe(-32700);
});

test('A2A RPC: missing method -> 400 with JSON-RPC -32602', { tag: '@feature:agent.a2a.rpc' }, async ({ request }) => {
  const response = await request.post('/api/agent/rpc', {
    data: { jsonrpc: '2.0', id: 1 },
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.error.code).toBe(-32602);
});

// KNOWN GAP (open task A2A-RPC-32601 in openspec/changes/e2e-error-intelligence-kanban).
// Today an unknown method returns HTTP 200 with result.ok=false, not a JSON-RPC error.
// test.fail() keeps the sweep green while the gap is open and turns red once it is fixed,
// so the expectation can then be promoted to a normal test.
test('A2A RPC: unknown method -> JSON-RPC -32601 error', { tag: '@feature:agent.a2a.rpc' }, async ({ request }) => {
  test.fail(true, 'open gap A2A-RPC-32601: unknown method returns result.ok=false, not an error');
  const response = await request.post('/api/agent/rpc', {
    data: { jsonrpc: '2.0', id: 2, method: 'no/such/method' },
  });
  const body = await response.json();
  expect(body.error?.code).toBe(-32601);
});
