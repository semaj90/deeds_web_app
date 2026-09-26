import assert from 'node:assert/strict';
import test from 'node:test';
import { discoverOrnithModel, streamChatCompletion } from './workstation-ornith-adapter.mjs';

test('discoverOrnithModel returns the sole allowlisted model details', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [
    { id: 'other-model' },
    { id: 'ornith-1.5-9b', meta: { n_params: 9_000_000_000 } },
  ] }), { status: 200 });
  try {
    const discovered = await discoverOrnithModel('http://test');
    assert.equal(discovered.loadedModel, 'ornith-1.5-9b');
    assert.equal(discovered.loadedModelDetails.meta.n_params, 9_000_000_000);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('discoverOrnithModel rejects multiple allowlisted model identities', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ data: [
    { id: 'ornith-1.5-9b' }, { id: 'ornith-1.5-27b' },
  ] }), { status: 200 });
  try {
    await assert.rejects(() => discoverOrnithModel('http://test'), /AMBIGUOUS_ORNITH_MODELS/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('streamChatCompletion preserves generation parameters and checksums streamed bytes', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  const body = [
    'data: {"choices":[{"delta":{"content":"grounded "},"finish_reason":null}]}\n\n',
    'data: {"choices":[{"delta":{"content":"summary"},"finish_reason":"stop"}],"usage":{"completion_tokens":2}}\n\n',
    'data: [DONE]\n\n',
  ].join('');
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
  try {
    const result = await streamChatCompletion('http://test', 'ornith-1.5-9b', [], {
      maxTokens: 192, temperature: 0, topP: 1, seed: 42, presencePenalty: 0, frequencyPenalty: 0,
    });
    assert.equal(request.stream, true);
    assert.equal(request.max_tokens, 192);
    assert.equal(request.top_p, 1);
    assert.equal(request.seed, 42);
    assert.equal(result.assembled, 'grounded summary');
    assert.deepEqual(result.usage, { completion_tokens: 2 });
    assert.match(result.requestChecksum, /^sha256:[0-9a-f]{64}$/);
    assert.match(result.responseChecksum, /^sha256:[0-9a-f]{64}$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
