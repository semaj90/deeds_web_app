// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { AceHmmMeta, RetrievalTrace } from '$lib/server/ai/openai-types.js';

// This file doesn't mock $lib/server/env.server.js, so LLM_MODEL_ID
// (runtime-contract.ts) resolves from the real .env: ENV.LLAMA_SERVER_MODEL
// if set, else basename(ROTORQUANT_MODEL_PATH). 'yorha-legal'/'yorha-*'
// requests resolve to this same value via resolveInternalModel() in
// openai-facade.ts. Compute it the same way rather than hardcoding the old
// Ollama-era 'gemma4-rotorquant:latest' string, which goes stale whenever
// the configured model changes (as it already has — this repo is on Ornith
// 1.5 now, not Gemma4, per CLAUDE.md's Ollama Phase-Out section).
const EXPECTED_INTERNAL_MODEL = (() => {
  if (process.env.LLAMA_SERVER_MODEL) return process.env.LLAMA_SERVER_MODEL;
  const modelPath = process.env.ROTORQUANT_MODEL_PATH ?? process.env.TURBO_MODEL_PATH ?? '';
  const base = modelPath.split(/[\\/]/).pop();
  return base && base.length > 0 ? base : 'unknown-model';
})();

// Mock the heavy deps so this is a unit test on the facade orchestration,
// not a full integration test (the route handler test covers wiring).
const mocks = vi.hoisted(() => ({
  assembleACEContext: vi.fn(),
  buildACEPromptCached: vi.fn(),
  bifrostChat: vi.fn(),
  getExactMatchCache: vi.fn(),
  setExactMatchCache: vi.fn(),
  turboQuantChat: vi.fn(),
  runGemma4Agent: vi.fn(),
  recordRagAnswer: vi.fn(),
  buildDevContextPlan: vi.fn(),
  isCodingPrompt: vi.fn(),
  classifyQuerySection: vi.fn(),
  callTraceMcp: vi.fn(),
  runTurbovecPreIngestion: vi.fn(),
  lookupScenario: vi.fn(),
  storeScenario: vi.fn(),
}));

vi.mock('$lib/server/ai/turbovec-ingest-sidecar.js', () => ({
  runTurbovecPreIngestion: mocks.runTurbovecPreIngestion,
}));

vi.mock('$lib/server/ace/context-assembler.js', () => ({
  assembleACEContext:    mocks.assembleACEContext,
  buildACEPromptCached:  mocks.buildACEPromptCached,
}));

vi.mock('$lib/server/cache-keys.js', () => ({
  buildAceCompletionCacheKey: (packetKey: string, queryHash: string) => {
    // Replicate the real logic: replace ace:packet: with ace:completion: and append query hash
    return packetKey.replace('ace:packet:', 'ace:completion:') + `:${queryHash}`;
  },
  // Input-sensitive stubs — several tests assert that the completion cache
  // key VARIES when history/context/routing labels change (it must, so
  // different conversations don't collide on one cached answer). A flat
  // 'ace:packet:mock' / 'hash_mock' constant defeated that on purpose for
  // every other test's convenience, but silently made those variance
  // assertions untestable (same key in, same key out, always).
  buildAcePacketCacheKey: (input: any) => `ace:packet:mock:${JSON.stringify(input)}`,
  hashStr: (input: string) => `hash_mock:${String(input)}`,
  generateCacheKey: (input: string) => 'cache:key:mock',
  TTL: { ACE_PROMPT: 86400 },
}));

vi.mock('$lib/server/cache/redis-exact-match.js', () => ({
  getExactMatchCache: mocks.getExactMatchCache,
  setExactMatchCache: mocks.setExactMatchCache,
  generateCacheKey: (input: string) => 'cache:key:mock',
}));

vi.mock('$lib/server/ai/inference-configs.js', () => ({
  resolveRuntimeConfig: () => ({
    profile: 'atomicbot-turboquant',
    runtimeAvailable: true,
    turboQuant: true,
    rotorQuantKv: false,
  }),
}));

vi.mock('$lib/server/ollama.js', () => ({
  bifrostChat:    mocks.bifrostChat,
  turboQuantChat: mocks.turboQuantChat,
  ollamaFetch:    vi.fn().mockResolvedValue({ embedding: new Array(384).fill(0) }),
  VLM_MODELS:     { legal: 'gemma4-rotorquant:latest', tool: 'gemma4-rotorquant:latest' },
  getOllamaEmbeddingEndpoint: () => 'http://127.0.0.1:11434',
}));

vi.mock('$lib/server/ai/gemma4-agent.js', () => ({
  runGemma4Agent: mocks.runGemma4Agent,
}));

vi.mock('$lib/server/ai/dev-context-planner.js', () => ({
  buildDevContextPlan: mocks.buildDevContextPlan,
  isCodingPrompt:      mocks.isCodingPrompt,
}));

vi.mock('$lib/server/cache/code-llm-index.js', () => ({
  recordRagAnswer: mocks.recordRagAnswer,
}));

vi.mock('$lib/server/mcp/trace-http.js', () => ({
  callTraceMcp: mocks.callTraceMcp,
}));

vi.mock('$lib/server/analysis/hmm-ace-analyzer.js', () => ({
  classifyQuerySection: mocks.classifyQuerySection,
}));

vi.mock('$lib/server/ai/scenario-cache.js', () => ({
  lookupScenario: mocks.lookupScenario,
  storeScenario: mocks.storeScenario,
}));

describe('openai-facade — runChatCompletion', () => {
  beforeEach(() => {
    mocks.assembleACEContext.mockReset();
    mocks.buildACEPromptCached.mockReset();
    mocks.bifrostChat.mockReset();
    mocks.getExactMatchCache.mockReset();
    mocks.setExactMatchCache.mockReset();
    mocks.turboQuantChat.mockReset();
    mocks.runGemma4Agent.mockReset();
    mocks.runTurbovecPreIngestion.mockReset();
    mocks.recordRagAnswer.mockResolvedValue(undefined);
    mocks.buildDevContextPlan.mockResolvedValue(undefined);
    // Default: non-coding prompts; tests that want coding override this
    mocks.isCodingPrompt.mockReturnValue(false);
    mocks.getExactMatchCache.mockResolvedValue(null);
    mocks.setExactMatchCache.mockResolvedValue(undefined);
    mocks.turboQuantChat.mockRejectedValue(new Error('TurboQuant unavailable'));
    mocks.callTraceMcp.mockResolvedValue({ ok: false, ms: 0, data: null, error: 'stub' });
    // Default: HMM returns a real classification so the data path is exercised
    mocks.classifyQuerySection.mockReturnValue({ section: 'FACTS', confidence: 0.82 });
    mocks.bifrostChat.mockResolvedValue('Default response');
    mocks.runTurbovecPreIngestion.mockResolvedValue('=== TURBOVEC PRE-INGEST SCAN ===\nNo direct task references found for terms.\n================================\n');
    // Default: scenario cache returns null (tests that want a hit override this)
    mocks.lookupScenario.mockResolvedValue(null);
    mocks.storeScenario.mockResolvedValue(undefined);
  });

  it('extracts last user message as query, earlier messages as history', async () => {
    mocks.assembleACEContext.mockResolvedValue({
      ragChunks: [{}, {}],
      kbChunks: [],
      caseChunks: [],
      chatHistory: [],
      agentsMd: null,
      codeLlmHit: null,
    });
    mocks.buildACEPromptCached.mockResolvedValue({
      systemPrompt:   'You are YorHA.',
      contextWindow:  '...chunks...',
    });
    mocks.bifrostChat.mockResolvedValue('Test response');

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model:    'yorha-legal',
      messages: [
        { role: 'system',    content: 'Be concise.' },
        { role: 'user',      content: 'first turn' },
        { role: 'assistant', content: 'replied' },
        { role: 'user',      content: 'what is hearsay?' },
      ],
      temperature: 0.3,
      raw:    false,
      stream: false,
    });

    expect(res.object).toBe('chat.completion');
    expect(res.choices).toHaveLength(1);
    expect(res.choices[0].message.content).toBe('Test response');
    expect(res.choices[0].finish_reason).toBe('stop');
    expect(res.model).toBe(EXPECTED_INTERNAL_MODEL); // mapped from yorha-legal
    expect(mocks.setExactMatchCache).toHaveBeenCalledWith(
      expect.stringMatching(/^ace:completion:/),
      expect.objectContaining({
        content: 'Test response',
        model: EXPECTED_INTERNAL_MODEL,
        backend: 'openai-facade',
      }),
      86400
    );

    // ACE called with the LAST user message as query
    expect(mocks.assembleACEContext).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'what is hearsay?' }),
    );

    // bifrostChat received system + history + last user
    const messages = mocks.bifrostChat.mock.calls[0][0];
    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Be concise.'); // system preamble preserved
    expect(messages[messages.length - 1]).toEqual({ role: 'user', content: 'what is hearsay?' });
  });

  it('returns a 24-hour prompt-cache hit before generation', async () => {
    mocks.assembleACEContext.mockResolvedValue({
      ragChunks: [{}],
      kbChunks: [],
      caseChunks: [],
      chatHistory: [],
      agentsMd: null,
      codeLlmHit: null,
    });
    mocks.buildACEPromptCached.mockResolvedValue({
      systemPrompt: 'You are YorHA.',
      contextWindow: '...chunks...',
    });
    mocks.getExactMatchCache.mockResolvedValueOnce({
      content: 'Cached prompt answer',
      model: 'gemma4-rotorquant:latest',
      backend: 'openai-facade',
      cachedAt: new Date().toISOString(),
    });

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model: 'yorha-legal',
      messages: [{ role: 'user', content: 'what is hearsay?' }],
      temperature: 0.3,
      raw: false,
      stream: false,
    });

    expect(res.choices[0].message.content).toBe('Cached prompt answer');
    expect(res.yorha?.cacheHit).toBe('prompt-cache');
    expect(mocks.bifrostChat).not.toHaveBeenCalled();
    expect(mocks.turboQuantChat).not.toHaveBeenCalled();
    expect(mocks.setExactMatchCache).not.toHaveBeenCalled();
  });

  it('includes dynamic history and KV context in the prompt-cache key', async () => {
    mocks.assembleACEContext.mockResolvedValue({
      ragChunks: [],
      kbChunks: [],
      caseChunks: [],
      chatHistory: [],
      agentsMd: null,
      codeLlmHit: null,
    });
    mocks.buildACEPromptCached.mockResolvedValue({
      systemPrompt: 'You are YorHA.',
      contextWindow: '...chunks...',
    });
    mocks.bifrostChat.mockResolvedValue('Answer A');

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    await runChatCompletion({
      model: 'yorha-legal',
      messages: [{ role: 'user', content: 'what is hearsay?' }],
      temperature: 0.3,
      raw: false,
      stream: false,
    });

    const firstKey = mocks.getExactMatchCache.mock.calls[0]?.[0] as string;

    await runChatCompletion({
      model: 'yorha-legal',
      messages: [
        { role: 'user', content: 'what is hearsay?' },
        { role: 'assistant', content: 'Sure.' },
        { role: 'user', content: 'what is hearsay?' },
      ],
      temperature: 0.3,
      raw: false,
      stream: false,
    });

    const secondKey = mocks.getExactMatchCache.mock.calls[1]?.[0] as string;
    expect(firstKey).not.toBe(secondKey);
  });

  it('routes raw:true requests directly to bifrostChat (skips ACE)', async () => {
    mocks.bifrostChat.mockResolvedValue('Raw response');

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model:    'yorha-legal',
      messages: [{ role: 'user', content: 'hi' }],
      raw:      true,
      stream:   false,
      temperature: 0.3,
    });

    expect(res.choices[0].message.content).toBe('Raw response');
    expect(mocks.assembleACEContext).not.toHaveBeenCalled();
    expect(res.yorha?.aceUsed).toBe(false);
    expect(res.yorha?.selectedLane).toBe('bifrost');
    expect(res.yorha?.inferenceLane).toBe('bifrost');
  });

  it('calls ace.compact_search via MCP and injects compact hits into ACE context when use_mcp is true', async () => {
    mocks.callTraceMcp.mockResolvedValue({
      ok: true,
      ms: 12,
      error: undefined,
      data: {
        context_tree_id: 'ctx_123',
        query: 'what is hearsay?',
        hits: [
          {
            rank: 1,
            chunkId: 'openai-facade.ts:300-420',
            path: 'src/lib/server/ai/openai-facade.ts',
            snippet:
              'Hearsay is an out of court statement offered for the truth of the matter asserted.',
            score: 0.92,
            topoClass: 'legal',
            sources: ['qdrant'],
            weights: { lex: 0.45, semantic: 0.35, authority: 0.2 },
          },
        ],
        totalCharsEstimate: 1200,
        cacheHit: false,
        elapsedMs: 12,
        nextAction:
          'Use chunkId from hits[0] with context.get_compressed_card or read the path directly',
        embedCached: false,
      },
    });

    mocks.assembleACEContext.mockResolvedValue({
      ragChunks: [],
      kbChunks: [],
      caseChunks: [],
      chatHistory: [],
      agentsMd: null,
      codeLlmHit: null,
    });
    mocks.buildACEPromptCached.mockResolvedValue({ systemPrompt: 'sys', contextWindow: '' });
    mocks.bifrostChat.mockResolvedValue('MCP answer');

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model: 'yorha-legal',
      messages: [{ role: 'user', content: 'what is hearsay?' }],
      raw: false,
      stream: false,
      temperature: 0.3,
      use_mcp: true,
    });

    expect(mocks.callTraceMcp).toHaveBeenCalledWith(
      'ace.compact_search',
      expect.objectContaining({ query: 'what is hearsay?' }),
      expect.anything()
    );
    expect(res.choices[0].message.content).toBe('MCP answer');
    expect(res.yorha?.mcpCompactSearchHitCount).toBe(1);
    expect(res.yorha?.mcpCompactSearchCacheHit).toBe(false);
    expect(res.yorha?.mcpCompactSearchMs).toBe(12);
  });

  it('bakes normalized routing labels into the prompt-cache key', async () => {
    mocks.assembleACEContext.mockResolvedValueOnce({
      ragChunks: [],
      kbChunks: [],
      caseChunks: [],
      chatHistory: [],
      agentsMd: null,
      codeLlmHit: null,
      clusterContext: [
        {
          clusterId: 12,
          clusterKey: 'cluster:gpu:12',
          centroidLabel: 'gpu:12',
          topoClass: 'api-route',
          topoLabel: 'api-route',
          hotnessBucket: 'hot',
          featureFamily: 'api-route',
          topTags: ['api', 'routes'],
          chunkCount: 3,
          topFiles: ['src/routes/api/foo.ts'],
          synthesisSuggestion: 'API hot cluster',
          summaryLens: 'api-route · hot',
        },
      ],
      codebaseContext: [
        {
          filePath: 'src/routes/api/foo.ts',
          content: 'export const GET = () => new Response();',
          score: 0.91,
          tags: ['api'],
          gpuCluster: 12,
          clusterKey: 'cluster:gpu:12',
          centroidLabel: 'gpu:12',
          topologyLabel: 'api-route',
          hotnessBucket: 'hot',
          featureFamily: 'api-route',
          topoClass: 'api-route',
        },
      ],
    });
    mocks.buildACEPromptCached.mockResolvedValue({
      systemPrompt: 'You are YorHA.',
      contextWindow: '...chunks...',
    });
    mocks.bifrostChat.mockResolvedValue('First response');

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    await runChatCompletion({
      model: 'yorha-legal',
      messages: [{ role: 'user', content: 'what is hearsay?' }],
      temperature: 0.3,
      raw: false,
      stream: false,
    });

    const firstKey = mocks.getExactMatchCache.mock.calls.at(-1)?.[0] as string;

    mocks.assembleACEContext.mockResolvedValueOnce({
      ragChunks: [],
      kbChunks: [],
      caseChunks: [],
      chatHistory: [],
      agentsMd: null,
      codeLlmHit: null,
      clusterContext: [
        {
          clusterId: 99,
          clusterKey: 'cluster:gpu:99',
          centroidLabel: 'gpu:99',
          topoClass: 'evidence',
          topoLabel: 'evidence',
          hotnessBucket: 'cool',
          featureFamily: 'evidence',
          topTags: ['evidence'],
          chunkCount: 1,
          topFiles: ['src/routes/api/evidence.ts'],
          synthesisSuggestion: 'Evidence cluster',
          summaryLens: 'evidence · cool',
        },
      ],
      codebaseContext: [
        {
          filePath: 'src/routes/api/evidence.ts',
          content: 'export const GET = () => new Response();',
          score: 0.67,
          tags: ['evidence'],
          gpuCluster: 99,
          clusterKey: 'cluster:gpu:99',
          centroidLabel: 'gpu:99',
          topologyLabel: 'evidence',
          hotnessBucket: 'cool',
          featureFamily: 'evidence',
          topoClass: 'evidence',
        },
      ],
    });
    mocks.buildACEPromptCached.mockResolvedValue({
      systemPrompt: 'You are YorHA.',
      contextWindow: '...chunks...',
    });
    mocks.bifrostChat.mockResolvedValue('Second response');

    await runChatCompletion({
      model: 'yorha-legal',
      messages: [{ role: 'user', content: 'what is hearsay?' }],
      temperature: 0.3,
      raw: false,
      stream: false,
    });

    const secondKey = mocks.getExactMatchCache.mock.calls.at(-1)?.[0] as string;
    expect(firstKey).not.toBe(secondKey);
  });

  it('reports yorha.cacheHit=prior-answer when codeLlmHit is present', async () => {
    mocks.assembleACEContext.mockResolvedValue({
      ragChunks: [], kbChunks: [], caseChunks: [], chatHistory: [],
      agentsMd: null,
      codeLlmHit: { llmOutput: 'cached', path: 'src/foo.ts', source: 'rag', priorHits: 2, generatedAt: new Date().toISOString() },
    });
    mocks.buildACEPromptCached.mockResolvedValue({ systemPrompt: 'sys', contextWindow: '' });
    mocks.bifrostChat.mockResolvedValue('Refined answer');

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model:    'gemma4-rotorquant:latest',
      messages: [{ role: 'user', content: 'q' }],
      file_path: 'src/foo.ts',
      raw:      false,
      stream:   false,
      temperature: 0.3,
    });

    expect(res.yorha?.codeLlmHit).toBe(true);
    expect(res.yorha?.cacheHit).toBe('prior-answer');
    expect(res.model).toBe(EXPECTED_INTERNAL_MODEL);
  });

  it('routes coding prompts through the agent path and populates yorha.toolsUsed', async () => {
    mocks.isCodingPrompt.mockReturnValue(true);
    mocks.buildDevContextPlan.mockResolvedValue({
      contextSummary:     'auth module context',
      kvPacketTaskId:     'task:abc123',
      stablePrefixHash:   'hash:abc',
      selectedStableKeys: ['src/lib/server/auth/session.ts:1'],
      selectedFiles:      ['src/lib/server/auth/session.ts'],
      contextHitCount:    1,
      isCodingPrompt:     true,
      toolsUsed:          ['search.dev_context'],
    });
    mocks.runGemma4Agent.mockResolvedValue({
      answer:    'Here is the TypeScript fix...',
      toolsUsed: ['search.dev_context'],
      rounds:    1,
      cacheTier: undefined,
    });

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model:     'yorha-legal',
      messages:  [{ role: 'user', content: 'Fix the TypeScript error in the auth module' }],
      file_path: 'src/lib/server/auth/session.ts',
      raw:       false,
      stream:    false,
      temperature: 0.2,
    });

    // Agent path — ACE not called
    expect(mocks.runGemma4Agent).toHaveBeenCalledWith(
      'Fix the TypeScript error in the auth module',
      expect.objectContaining({ pipeline: 'openai-facade' }),
    );
    expect(mocks.assembleACEContext).not.toHaveBeenCalled();
    // toolsUsed populated from agent result
    expect(res.yorha?.toolsUsed).toContain('search.dev_context');
    expect(res.yorha?.aceUsed).toBe(true);
    expect(res.choices[0].message.content).toBe('Here is the TypeScript fix...');
  });

  it('throws when last message is not a user message', async () => {
    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    await expect(
      runChatCompletion({
        model:    'yorha-legal',
        messages: [{ role: 'system', content: 'system only' }],
        raw:      false,
        stream:   false,
        temperature: 0.3,
      }),
    ).rejects.toThrow(/No user query/);
  });

  it('ACE path: populates yorha.hmm and retrievalTrace.hmm from classifyQuerySection', async () => {
    mocks.classifyQuerySection.mockReturnValue({ section: 'LEGAL_AUTHORITY', confidence: 0.91 });
    mocks.assembleACEContext.mockResolvedValue({
      ragChunks: [{}], kbChunks: [], caseChunks: [], chatHistory: [],
      agentsMd: null, codeLlmHit: null,
    });
    mocks.buildACEPromptCached.mockResolvedValue({ systemPrompt: 'sys', contextWindow: '' });
    mocks.bifrostChat.mockResolvedValue('ACE answer');

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const uniqueQuery = `hmm test ${Date.now()} unique query for test case authority`;
    const res = await runChatCompletion({
      model:    'yorha-legal',
      messages: [{ role: 'user', content: uniqueQuery }],
      raw: false, stream: false, temperature: 0.3,
    });

    // yorha.hmm populated — AceHmmMeta shape
    const hmm = res.yorha?.hmm as AceHmmMeta | undefined;
    expect(hmm?.hmmAnalyzerUsed).toBe(true);
    expect(hmm?.intent).toBe('LEGAL_AUTHORITY');
    expect(typeof hmm?.confidence).toBe('number');
    expect(Array.isArray(hmm?.signals)).toBe(true);

    // retrievalTrace.hmm mirrors yorha.hmm — RetrievalTrace shape
    const trace = res.retrievalTrace as RetrievalTrace | undefined;
    expect(trace?.hmm?.hmmAnalyzerUsed).toBe(true);
    expect(trace?.hmm?.intent).toBe('LEGAL_AUTHORITY');
  });

  it('agent path: populates yorha.hmm and retrievalTrace.hmm for agentic tool calling', async () => {
    mocks.classifyQuerySection.mockReturnValue({ section: 'CLAIMS', confidence: 0.78 });
    mocks.isCodingPrompt.mockReturnValue(false);
    mocks.runGemma4Agent.mockResolvedValue({
      answer:    'Agent answer with tool results',
      toolsUsed: ['rag_search', 'case_search'],
      rounds:    2,
      cacheTier: undefined,
    });

    const { runChatCompletion } = await import('$lib/server/ai/openai-facade.js');
    const res = await runChatCompletion({
      model:    'gemma4-agent',
      messages: [{ role: 'user', content: 'What claims are supported by the evidence?' }],
      raw: false, stream: false, temperature: 0.3,
    });

    expect(res.choices[0].message.content).toBe('Agent answer with tool results');

    // HMM on agent path
    const hmm = res.yorha?.hmm as AceHmmMeta | undefined;
    expect(hmm?.hmmAnalyzerUsed).toBe(true);
    expect(hmm?.intent).toBe('CLAIMS');
    expect(hmm?.state).toBe('agent_loop');
    expect(hmm?.signals).toContain('gemma4_agent');
    expect(hmm?.signals).toContain('rag_search');

    // retrievalTrace.hmm also present
    const trace = res.retrievalTrace as RetrievalTrace | undefined;
    expect(trace?.hmm?.intent).toBe('CLAIMS');

    // toolsUsed exposed in yorha
    expect(res.yorha?.toolsUsed).toContain('rag_search');
    expect(res.yorha?.toolRounds).toBe(2);
  });
});

describe('openai-facade — POST /api/v1/chat/completions handler', () => {
  beforeEach(() => {
    mocks.assembleACEContext.mockReset();
    mocks.buildACEPromptCached.mockReset();
    mocks.bifrostChat.mockReset();
    mocks.getExactMatchCache.mockReset();
    mocks.getExactMatchCache.mockResolvedValue(null);
    mocks.setExactMatchCache.mockReset();
    mocks.setExactMatchCache.mockResolvedValue(undefined);
    mocks.turboQuantChat.mockReset();
    mocks.runGemma4Agent.mockReset();
    mocks.recordRagAnswer.mockResolvedValue(undefined);
    mocks.buildDevContextPlan.mockResolvedValue(undefined);
    mocks.isCodingPrompt.mockReturnValue(false);
    mocks.turboQuantChat.mockRejectedValue(new Error('TurboQuant unavailable'));
    // This describe block must not depend on the sibling "runChatCompletion"
    // describe block's beforeEach having already configured these — that
    // cross-describe mock-state leakage broke as soon as vitest's actual
    // run order/isolation changed and produced "Cannot read properties of
    // undefined (reading 'catch')" from the unconfigured storeScenario().
    mocks.lookupScenario.mockReset();
    mocks.lookupScenario.mockResolvedValue(null);
    mocks.storeScenario.mockReset();
    mocks.storeScenario.mockResolvedValue(undefined);
  });

  it('returns 401 without locals.user', async () => {
    const oldBypass = process.env.DEV_BYPASS_AUTH;
    process.env.DEV_BYPASS_AUTH = 'false';
    let caught = false;
    let error401 = false;
    try {
      const { POST } = await import('../src/routes/api/v1/chat/completions/+server.js');
      await POST({
        request: new Request('http://x', { method: 'POST', body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'q' }] }) }),
        locals:  {},
      } as Parameters<typeof POST>[0]);
    } catch (err: any) {
      caught = true;
      error401 = err?.status === 401;
    } finally {
      process.env.DEV_BYPASS_AUTH = oldBypass;
    }
    expect(caught).toBe(true);
    expect(error401).toBe(true);
  });

  it('streams SSE when stream:true is requested', async () => {
    mocks.assembleACEContext.mockResolvedValue({
      ragChunks: [],
      kbChunks: [],
      caseChunks: [],
      chatHistory: [],
      agentsMd: null,
      codeLlmHit: null,
    });
    mocks.buildACEPromptCached.mockResolvedValue({
      systemPrompt: 'You are YorHA.',
      contextWindow: '...chunks...',
    });
    mocks.bifrostChat.mockResolvedValue('streamed response');

    const { POST } = await import('../src/routes/api/v1/chat/completions/+server.js');
    const res = await POST({
      request: new Request('http://x', {
        method: 'POST',
        body: JSON.stringify({
          model: 'yorha-legal',
          messages: [{ role: 'user', content: 'q' }],
          stream: true,
        }),
      }),
      locals: { user: { id: 'u1' } },
    } as Parameters<typeof POST>[0]);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const text = await res.text();
    expect(text).toContain('data: ');
    expect(text).toContain('[DONE]');
  });

  it('returns 400 on missing messages', async () => {
    const { POST } = await import('../src/routes/api/v1/chat/completions/+server.js');
    let caught = false;
    let error400 = false;
    try {
      await POST({
        request: new Request('http://x', { method: 'POST', body: JSON.stringify({ model: 'm' }) }),
        locals:  { user: { id: 'u1' } },
      } as Parameters<typeof POST>[0]);
    } catch (err: any) {
      caught = true;
      error400 = err?.status === 400;
    }
    expect(caught).toBe(true);
    expect(error400).toBe(true);
  });
});
