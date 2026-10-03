import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { isMiniforgeNlpRunning } from './miniforge-nlp-health.mjs';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('accepts only the expected healthy service identity and uses the requested port', async () => {
  let requestedUrl;
  let requestedSignal;
  globalThis.fetch = async (url, options) => {
    requestedUrl = url;
    requestedSignal = options.signal;
    return Response.json({ status: 'ok', model: 'miniforge-nlp-sidecar' });
  };

  assert.equal(await isMiniforgeNlpRunning(8123), true);
  assert.equal(requestedUrl, 'http://127.0.0.1:8123/health');
  assert.ok(requestedSignal instanceof AbortSignal);
});

test('rejects HTTP failures, malformed JSON, and mismatched health identity', async (context) => {
  await context.test('HTTP failure', async () => {
    globalThis.fetch = async () => new Response('', { status: 503 });
    assert.equal(await isMiniforgeNlpRunning(), false);
  });

  await context.test('malformed JSON', async () => {
    globalThis.fetch = async () => new Response('{', { status: 200 });
    assert.equal(await isMiniforgeNlpRunning(), false);
  });

  await context.test('wrong model identity', async () => {
    globalThis.fetch = async () => Response.json({ status: 'ok', model: 'other-service' });
    assert.equal(await isMiniforgeNlpRunning(), false);
  });
});

test('fails closed when fetch rejects or times out', async () => {
  globalThis.fetch = async () => { throw new Error('connection refused'); };
  assert.equal(await isMiniforgeNlpRunning(), false);
});
