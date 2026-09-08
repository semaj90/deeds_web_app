import { describe, expect, it, vi } from 'vitest';
import { extractLlamaPromptCacheTelemetryV1 } from './llama-prompt-cache-telemetry-v1.js';
import {
  kvCacheMonitor,
  recordLlamaPromptCacheTelemetry,
  streamDirectToLlamaServer,
} from '../../ai/context-prompt-streamer.js';
import { buildContextPrefixIdentityV1 } from './context-prefix-identity-v1.js';

describe('llama prompt cache telemetry', () => {
  it('prefers the current nested cached-token field', () => {
    expect(extractLlamaPromptCacheTelemetryV1({
      usage: {
        prompt_tokens: 100,
        completion_tokens: 12,
        prompt_tokens_details: { cached_tokens: 70 },
        prompt_tokens_cached: 20,
      },
    })).toEqual({
      schema: 'parent-atlas.llama-prompt-cache-telemetry.v1',
      promptTokens: 100,
      cachedPrefillTokens: 70,
      newPrefillTokens: 30,
      completionTokens: 12,
      cacheTelemetryAvailable: true,
      source: 'usage.prompt_tokens_details.cached_tokens',
    });
  });

  it('supports the legacy cached-token field', () => {
    const telemetry = extractLlamaPromptCacheTelemetryV1({
      usage: { prompt_tokens: 40, completion_tokens: 8, prompt_tokens_cached: 10 },
    });
    expect(telemetry.cachedPrefillTokens).toBe(10);
    expect(telemetry.newPrefillTokens).toBe(30);
    expect(telemetry.source).toBe('usage.prompt_tokens_cached');
  });

  it('fails closed to unavailable telemetry instead of treating completion as prompt reuse', () => {
    const telemetry = extractLlamaPromptCacheTelemetryV1({
      usage: { prompt_tokens: 40, completion_tokens: 8 },
    });
    expect(telemetry.cacheTelemetryAvailable).toBe(false);
    expect(telemetry.cachedPrefillTokens).toBe(0);
    expect(telemetry.newPrefillTokens).toBe(40);
    expect(telemetry.completionTokens).toBe(8);
  });

  it('records only observed cache telemetry through the shared monitor helper', () => {
    const model = `telemetry-test-${Date.now()}`;
    const recorded = recordLlamaPromptCacheTelemetry(model, {
      usage: {
        prompt_tokens: 100,
        completion_tokens: 8,
        prompt_tokens_details: { cached_tokens: 75 },
      },
    }, 'cline');

    expect(recorded?.cacheTelemetryAvailable).toBe(true);
    expect(kvCacheMonitor.getStats(model)).toMatchObject({
      modelId: model,
      totalRequests: 1,
      contextTokens: 100,
      cachedTokens: 75,
      newTokens: 25,
      consumerCounts: { cline: 1 },
    });

    expect(recordLlamaPromptCacheTelemetry(model, {
      usage: { prompt_tokens: 100, completion_tokens: 8 },
    }, 'cline')).toBeNull();
    expect(kvCacheMonitor.getStats(model)?.totalRequests).toBe(1);
  });

  it('wires streamed usage into the monitor and emits only verified prefix observations', async () => {
    const model = `stream-telemetry-test-${Date.now()}`;
    const stablePrefix = 'You are Parent Atlas. Use grounded evidence.';
    const identity = buildContextPrefixIdentityV1({
      modelRevision: 'ornith-1.5-9b@fixture',
      templateRevision: 'chat-template@fixture',
      toolSchemaRevision: 'tools@fixture',
      systemPolicyRevision: 'policy@fixture',
      stableEvidenceRevision: 'evidence@fixture',
      stablePrefix,
    });
    let requestBody: Record<string, unknown> | undefined;
    const observations: Array<Record<string, unknown>> = [];
    const responseChunks = [
      `data: ${JSON.stringify({
        id: 'chatcmpl-fixture',
        object: 'chat.completion.chunk',
        choices: [{ delta: { content: 'ok' } }],
      })}\n\n`,
      `data: ${JSON.stringify({
        id: 'chatcmpl-fixture',
        object: 'chat.completion.chunk',
        choices: [],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 2,
          prompt_tokens_details: { cached_tokens: 60 },
        },
      })}\n\n`,
      'data: [DONE]\n\n',
    ];

    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of responseChunks) controller.enqueue(encoder.encode(chunk));
          controller.close();
        },
      });
      return new Response(body, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      });
    }));

    try {
      const received: Array<unknown> = [];
      for await (const chunk of streamDirectToLlamaServer({
        llamaBaseUrl: 'http://127.0.0.1:8090',
        model,
        temperature: 0,
        maxTokens: 8,
        telemetrySource: 'cline',
        contextPrefixIdentity: identity,
        previousStablePrefix: stablePrefix,
        onContextPrefixReuseObservation: (observation) => observations.push(observation),
      }, [{ role: 'system', content: stablePrefix }, { role: 'user', content: 'hello' }])) {
        received.push(chunk);
      }

      expect((requestBody?.stream_options as { include_usage?: boolean }).include_usage).toBe(true);
      expect(requestBody?.cache_prompt).toBe(true);
      expect(received).toHaveLength(2);
      expect(kvCacheMonitor.getStats(model)).toMatchObject({
        totalRequests: 1,
        contextTokens: 100,
        cachedTokens: 60,
        newTokens: 40,
        consumerCounts: { cline: 1 },
      });
      expect(observations).toHaveLength(1);
      expect(observations[0]).toMatchObject({
        contextPrefixIdentityChecksum: identity.checksum,
        cachedPrefillTokens: 60,
        newPrefillTokens: 40,
        prefixReuseRatio: 0.6,
        cacheStatus: 'PARTIAL',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not emit a prefix observation when the supplied identity is for another prefix', async () => {
    const model = `stream-identity-mismatch-${Date.now()}`;
    const identity = buildContextPrefixIdentityV1({
      modelRevision: 'ornith-1.5-9b@fixture',
      templateRevision: 'chat-template@fixture',
      toolSchemaRevision: 'tools@fixture',
      systemPolicyRevision: 'policy@fixture',
      stableEvidenceRevision: 'evidence@fixture',
      stablePrefix: 'different prefix',
    });
    const observations: Array<unknown> = [];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'data: ' + JSON.stringify({
        id: 'chatcmpl-fixture',
        object: 'chat.completion.chunk',
        choices: [],
        usage: { prompt_tokens: 10, prompt_tokens_details: { cached_tokens: 5 } },
      }) + '\n\ndata: [DONE]\n\n',
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    )));

    try {
      for await (const _chunk of streamDirectToLlamaServer({
        llamaBaseUrl: 'http://127.0.0.1:8090',
        model,
        temperature: 0,
        maxTokens: 8,
        contextPrefixIdentity: identity,
        onContextPrefixReuseObservation: (observation) => observations.push(observation),
      }, [{ role: 'system', content: 'actual prefix' }])) {
        // Drain the generator so its post-stream observation path executes.
      }
      expect(observations).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('parses a final unterminated usage event instead of losing telemetry', async () => {
    const model = `stream-unterminated-${Date.now()}`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      'data: ' + JSON.stringify({
        id: 'chatcmpl-fixture',
        object: 'chat.completion.chunk',
        choices: [],
        usage: { prompt_tokens: 20, prompt_tokens_details: { cached_tokens: 12 } },
      }),
      { status: 200, headers: { 'content-type': 'text/event-stream' } },
    )));

    try {
      const received: Array<unknown> = [];
      for await (const chunk of streamDirectToLlamaServer({
        llamaBaseUrl: 'http://127.0.0.1:8090',
        model,
        temperature: 0,
        maxTokens: 8,
        telemetrySource: 'context-stream',
      }, [{ role: 'user', content: 'hello' }])) {
        received.push(chunk);
      }
      expect(received).toHaveLength(1);
      expect(kvCacheMonitor.getStats(model)).toMatchObject({
        totalRequests: 1,
        contextTokens: 20,
        cachedTokens: 12,
        newTokens: 8,
        consumerCounts: { 'context-stream': 1 },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
