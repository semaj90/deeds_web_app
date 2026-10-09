import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWithOrnithV1 } from './ornith-chat-client.mjs';

test('uses the advertised Ornith model and returns a bounded chat response', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith('/v1/models')) {
      return Response.json({ data: [{ id: 'ornith-1.5-9b' }] });
    }
    return Response.json({
      choices: [{ message: { content: ' grounded response ' } }],
      usage: { prompt_tokens: 12, completion_tokens: 4 },
    });
  };

  const result = await generateWithOrnithV1({
    baseUrl: 'http://127.0.0.1:8090/v1/',
    modelId: 'ornith-1.5-9b',
    systemPrompt: 'system',
    userPrompt: 'query',
    fetchImpl,
  });

  assert.equal(result.modelId, 'ornith-1.5-9b');
  assert.equal(result.endpoint, 'http://127.0.0.1:8090');
  assert.equal(result.content, 'grounded response');
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, 'http://127.0.0.1:8090/v1/chat/completions');
  assert.equal(JSON.parse(calls[1].options.body).model, 'ornith-1.5-9b');
});

test('fails closed when the requested model is not advertised', async () => {
  await assert.rejects(
    generateWithOrnithV1({
      modelId: 'ornith-1.5-9b',
      systemPrompt: 'system',
      userPrompt: 'query',
      fetchImpl: async () => Response.json({ data: [{ id: 'different-model' }] }),
    }),
    /ORNITH_MODEL_NOT_ADVERTISED/,
  );
});
