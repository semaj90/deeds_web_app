// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  assembleACEContext: vi.fn(),
  buildACEPromptCached: vi.fn(),
}));

vi.mock('$lib/server/ace/context-assembler.js', () => ({
  assembleACEContext: (...args: unknown[]) => mocks.assembleACEContext(...args),
  buildACEPromptCached: (...args: unknown[]) => mocks.buildACEPromptCached(...args),
}));

vi.mock('$lib/server/ai/local-llama-provider.js', () => ({
  LLAMA_SERVER_BASE_URL: 'http://127.0.0.1:8090',
  LOCAL_VLM_MODEL: 'test-model',
}));

describe('/api/ace/summarize', () => {
  beforeEach(() => {
    mocks.assembleACEContext.mockReset();
    mocks.buildACEPromptCached.mockReset();
    mocks.assembleACEContext.mockResolvedValue({
      caseContext: 'case context',
      contextManifest: {
        manifest_id: 'manifest-1',
        request_id: 'req-1',
        source_refs: ['src/lib/server/ace/context-assembler.ts'],
        retrieved_candidates: 1,
        warmed_candidates: 0,
        cache_hits: 0,
        selected_packet_keys: ['code:1'],
        rejected_packet_keys: [],
        token_budget: 100,
        reserved_tokens: 10,
        usable_token_budget: 90,
        selected_tokens: 12,
        rejected_tokens: 0,
        selection_policy_version: 'atlas.context.ace-bridge.v1',
        spec_refs: [],
        lanes: { exact: 0, lexical: 0, dense: 1, graph: 0, bitfrost: 0 },
        selected_by_lane: { exact: 0, lexical: 0, dense: 1, graph: 0, bitfrost: 0 },
        warming: {
          warmed_candidates: 0,
          warmed_selected: 0,
          warmed_rejected: 0,
          cache_hits: 0,
          cache_hit_selected: 0,
          selection_rate: 1,
          cache_hit_selection_rate: 0,
          avoided_prompt_tokens: 0,
        },
        created_at: new Date().toISOString(),
      },
      ragChunks: [],
      kbChunks: [],
      caseChunks: [],
      docChunks: [],
      kagNeighbors: [],
      chatHistory: [],
      chatMemory: [],
      entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
      practiceTemplate: null,
      queryTags: [],
      webSearchContext: null,
      persona: 'neutral',
      evidenceMetadata: null,
      evidenceConnections: null,
      userAnalyticsContext: null,
      codebaseContext: [],
      policyDecision: null,
      agentsMd: null,
      retrievalTrace: {},
      clusterContext: null,
      multiLaneOutput: null,
      dbSchemaContext: null,
      schemaDependentsContext: null,
      compactSearch: null,
      topologyResults: null,
      aceContextPacket: null,
      ontology: null,
    });
    mocks.buildACEPromptCached.mockResolvedValue({
      systemPrompt: 'system prompt',
      userPrompt: 'user prompt',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify({ summary: 'ok', keyInsights: ['one'], confidence: 0.9 }) } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
  });

  it('returns the summarize route response shape and consumes the ACE context with a manifest attached', async () => {
    const { POST } = await import('./+server.js');
    const request = new Request('http://localhost/api/ace/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Demo', content: 'Demo content' }),
    });

    const response = await POST({ request, locals: { user: { id: '42' } } } as any);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.summary).toBe('ok');
    expect(body.keyInsights).toEqual(['one']);
    expect(body.confidence).toBe(0.9);
    expect(body.aceContext.caseContext).toBe(true);
    expect(body.aceContext.ragChunks).toBe(0);
    expect(mocks.assembleACEContext).toHaveBeenCalledTimes(1);
    expect(mocks.buildACEPromptCached).toHaveBeenCalledTimes(1);
    expect(mocks.assembleACEContext.mock.calls[0][0]).toMatchObject({
      query: 'Summarize this evidence: Demo',
      userId: '42',
      maxTokens: 2000,
    });
  });
});
