import { test, expect } from './fixtures/qa';

// Contracts for the ACP execute route as it is implemented. Error bodies carry a top-level
// `code` next to the `error` text (additive; existing clients still read `error`).

test('ACP rejects malformed JSON with 400 and ACP_INVALID_JSON', { tag: '@feature:agent.acp.execute' }, async ({ request }) => {
  // Buffer = raw bytes. A string with a JSON content-type is serialized as a JSON string,
  // which is valid JSON and tests the wrong thing (it yields ACP_INVALID_INPUT).
  const response = await request.post('/api/acp/execute', {
    data: Buffer.from('{invalid-json'),
    headers: { 'content-type': 'application/json' },
  });
  expect(response.status()).toBe(400);
  const body = await response.json();
  expect(body.code).toBe('ACP_INVALID_JSON');
});

test('ACP does not dispatch inherited Object.prototype keys', { tag: '@feature:agent.acp.execute' }, async ({ request }) => {
  for (const tool of ['constructor', '__proto__']) {
    const response = await request.post('/api/acp/execute', {
      data: { tool, args: {}, dryRun: true },
    });
    expect(response.status(), `tool=${tool}`).toBe(404);
    const body = await response.json();
    expect(body.code, `tool=${tool}`).toBe('ACP_TOOL_NOT_FOUND');
  }
});
