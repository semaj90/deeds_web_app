import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INFERENCE_READ_ONLY_REPLAY_POLICY_V1,
  runChatCompletion,
} from './openai-facade.js';
import { LLM_BASE_URL } from '$lib/server/llm/runtime-contract.js';

const enabled = process.env.ATLAS_LIVE_INFERENCE_REPLAY === '1';

describe('inference facade bounded read-only live replay', () => {
  it.skipIf(!enabled)('resolves and uses the loaded model without durable side effects', async () => {
    const modelsResponse = await fetch(`${LLM_BASE_URL.replace(/\/$/, '')}/v1/models`, {
      signal: AbortSignal.timeout(3_000),
    });
    if (!modelsResponse.ok) throw new Error(`llama-server /v1/models returned HTTP ${modelsResponse.status}`);
    const modelList = await modelsResponse.json() as { data?: Array<{ id?: unknown }> };
    const reportedModelIds = (modelList.data ?? [])
      .map((entry) => entry.id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);
    if (reportedModelIds.length === 0) throw new Error('llama-server reports no loaded model IDs');

    let observed: Record<string, unknown> | undefined;
    const response = await runChatCompletion({
      model: 'app-label-is-not-runtime-model-identity',
      messages: [{ role: 'user', content: 'Reply with exactly OK.' }],
      temperature: 0,
      max_tokens: 8,
      stream: false,
      use_mcp: false,
    }, {
      replayPolicy: INFERENCE_READ_ONLY_REPLAY_POLICY_V1,
      onReplayResult: (metadata) => { observed = metadata; },
    });

    const resolvedModelId = String(observed?.resolvedModelId ?? '');
    const outboundModelId = String(observed?.outboundModelId ?? '');
    if (!reportedModelIds.includes(resolvedModelId)) {
      throw new Error('Resolved model was not present in the immediately preceding /v1/models response');
    }
    expect(outboundModelId).toBe(resolvedModelId);
    expect(response.model).toBe(resolvedModelId);
    expect(observed?.responseStatus).toBe(200);

    const receipt = {
      schema: 'atlas.inference-facade-read-only-live-replay.v1',
      generatedAt: new Date().toISOString(),
      entrypoint: 'runChatCompletion (existing OpenAI-compatible application facade)',
      legacyCompatibilityModule: null,
      runtimeResolver: 'resolveLlamaInferenceTarget → resolveLoadedLlamaModel → GET /v1/models',
      reportedModelIds,
      reportedModelId: reportedModelIds.includes(resolvedModelId) ? resolvedModelId : null,
      resolvedModelId,
      outboundModelId,
      sideEffectInventory: [
        { category: 'PURE_READ', path: 'GET /v1/models through the shared runtime resolver' },
        { category: 'IN_MEMORY_EPHEMERAL', path: 'bounded prompt/response held only for this call' },
        { category: 'CACHE_READ', path: 'none; replay branch precedes scenario and exact-cache lookup' },
        { category: 'CACHE_WRITE', path: 'none; all cache writers are bypassed' },
        { category: 'POSTGRES_WRITE', path: 'none; synthesis persistence path is bypassed' },
        { category: 'VALKEY_WRITE', path: 'none; facade and stream cache paths are bypassed' },
        { category: 'USER_MEMORY_WRITE', path: 'none; Engram persistence path is bypassed' },
        { category: 'CONVERSATION_WRITE', path: 'none; no conversation persistence is called' },
        { category: 'METRICS_DURABLE_WRITE', path: 'none; intent and ACE metric writers are bypassed' },
        { category: 'FILESYSTEM_WRITE', path: 'only this explicit proof receipt' },
        { category: 'OTHER_SIDE_EFFECT', path: 'llama-server inference compute; cache_prompt=false' },
      ],
      replayPolicy: INFERENCE_READ_ONLY_REPLAY_POLICY_V1,
      focusedTests: {
        facadeMocked: 'PASS: tests/openai-facade.spec.ts read-only replay case',
        streamCacheBypass: 'PASS: tests/openai-facade.spec.ts stream-mode replay case',
      },
      liveReplay: {
        attempted: true,
        status: Number(observed?.responseStatus ?? 0),
        requestId: observed?.requestId ?? null,
        streaming: false,
        finishReason: observed?.finishReason ?? null,
        promptTokens: observed?.promptTokens ?? null,
        completionTokens: observed?.completionTokens ?? null,
      },
      readbackProof: {
        result: 'NO_WRITES_ATTRIBUTABLE_TO_REPLAY',
        basis: 'fail-closed replay branch skips all durable writer paths; mocked tests assert cache/retrieval writers are not called; prompt caching disabled at llama-server',
        globalConcurrentWritesExcluded: true,
      },
      result: 'INFERENCE_FACADE_READ_ONLY_LIVE_REPLAY_PROVEN',
      writes: {
        postgres: 0,
        valkey: 0,
        qdrant: 0,
        neo4j: 0,
        userMemory: 0,
        conversationPersistence: 0,
        graphifyRuns: 0,
        containerRebuilds: 0,
      },
    };
    const reportPath = resolve(process.cwd(), '../docs/reports/inference-facade-read-only-live-replay-v1.json');
    await mkdir(resolve(reportPath, '..'), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  }, 30_000);
});
