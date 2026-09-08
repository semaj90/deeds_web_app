import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./runtime-contract.js', () => ({
  LLM_MODEL_ID: 'ornith-1.5-9b@fixture',
  resolveLlamaInferenceTarget: vi.fn(),
}));

import { resolveLlamaInferenceTarget } from './runtime-contract.js';
import { summarizeWithGemma4 } from './gemma4-summary-wrapper.js';
import { kvCacheMonitor } from '../ai/context-prompt-streamer.js';

const resolveTarget = vi.mocked(resolveLlamaInferenceTarget);

describe('Gemma4 summary prompt-cache telemetry', () => {
  beforeEach(() => {
    resolveTarget.mockResolvedValue({
      baseUrl: 'http://127.0.0.1:8090',
      model: 'ornith-1.5-9b@fixture',
      configuredModel: 'ornith-1.5-9b@fixture',
      modelSource: 'configured-match',
      selectionPolicy: 'CONFIGURED_VERIFY',
      selectionReceiptChecksum: 'a'.repeat(64),
    });
  });

  it('requests usage and records resolved-model cache counters', async () => {
    const model = 'ornith-1.5-9b@fixture';
    const requestBodies: Array<Record<string, unknown>> = [];
    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'A concise summary.' } }],
        usage: {
          prompt_tokens: 80,
          completion_tokens: 6,
          prompt_tokens_details: { cached_tokens: 50 },
        },
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    try {
      const result = await summarizeWithGemma4({ prompt: 'Summarize this fixture.' });
      expect(result.model).toBe(model);
      expect((requestBodies[0]?.stream_options as { include_usage?: boolean }).include_usage).toBe(true);
      expect(requestBodies[0]?.cache_prompt).toBe(true);
      expect(kvCacheMonitor.getStats(model)).toMatchObject({
        totalRequests: 1,
        contextTokens: 80,
        cachedTokens: 50,
        newTokens: 30,
        consumerCounts: { summary: 1 },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not count a response that omits cache telemetry', async () => {
    const model = `ornith-summary-no-cache-${Date.now()}`;
    resolveTarget.mockResolvedValue({
      baseUrl: 'http://127.0.0.1:8090',
      model,
      configuredModel: model,
      modelSource: 'configured-match',
      selectionPolicy: 'CONFIGURED_VERIFY',
      selectionReceiptChecksum: 'b'.repeat(64),
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: 'Summary.' } }],
      usage: { prompt_tokens: 12, completion_tokens: 2 },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));

    try {
      await summarizeWithGemma4({ prompt: 'No cache fixture.' });
      expect(kvCacheMonitor.getStats(model)).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
