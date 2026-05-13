// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetContextCacheWithSource, mockBumpContextCacheHit } = vi.hoisted(() => ({
  mockGetContextCacheWithSource: vi.fn(),
  mockBumpContextCacheHit: vi.fn(),
}));

vi.mock('$lib/server/ace/llm-context-cache.js', () => ({
  buildContextCacheKey: (identity: { queryHash: string; repoGitSha: string; systemPromptHash: string }) =>
    `llmctx:${identity.queryHash}:${identity.repoGitSha}:${identity.systemPromptHash}`,
  getContextCacheWithSource: (...args: unknown[]) => mockGetContextCacheWithSource(...args),
  setContextCache: vi.fn(async () => {}),
  bumpContextCacheHit: (...args: unknown[]) => mockBumpContextCacheHit(...args),
  normalizeContextPack: <T>(pack: T) => pack,
}));

describe('context-cache-planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockBumpContextCacheHit.mockResolvedValue(undefined);
  });

  it('reports local cache hits and computes delta fields from cached planner state', async () => {
    const { buildAceContextPlannerState, loadAceContextPlannerHit } = await import(
      '$lib/server/ace/context-cache-planner.js'
    );

    const state = buildAceContextPlannerState({
      query: 'explain hearsay evidence',
      repoGitSha: 'repo-b',
      systemPromptHash: 'sys-a',
      tokenAwarePacking: true,
      enableCodebaseContext: true,
      includeResearch: false,
    });

    mockGetContextCacheWithSource.mockResolvedValue({
      source: 'local',
      pack: {
        summary: 'cached summary',
        chunk_ids: ['chunk-1'],
        graph_paths: ['a | b | c'],
        tool_policy: { allowWriteTools: false },
        prefix_tokens_estimated: 42,
        cache_hit: true,
        retrieval_skipped: true,
        backend: state.backend,
        model_name: state.modelName,
        model_quant: state.modelQuant,
        tokenizer_hash: state.tokenizerHash,
        system_prompt_hash: state.systemPromptHash,
        tool_definitions_hash: state.toolDefinitionsHash,
        repo_git_sha: 'repo-a',
        corpus_hash: state.corpusHash,
        rag_bundle_hash: state.ragBundleHash,
        graph_snapshot_hash: state.graphSnapshotHash,
        featureId: 'ace-context',
        glyphMask: 0,
        topFiles: ['context-assembler.ts'],
        topTriples: [['a', 'b', 'c']],
        selectedSourceIds: ['chunk-1'],
        cacheKeys: ['key-1'],
        warnings: [],
        planner_state: {
          queryHash: state.queryHash,
          modelName: state.modelName,
          modelQuant: state.modelQuant,
          backend: state.backend,
          tokenizerHash: state.tokenizerHash,
          systemPromptHash: state.systemPromptHash,
          toolDefinitionsHash: state.toolDefinitionsHash,
          repoGitSha: 'repo-a',
          corpusHash: state.corpusHash,
          evidenceBundleHash: state.evidenceBundleHash,
          ragBundleHash: state.ragBundleHash,
          graphSnapshotHash: state.graphSnapshotHash,
          retrievalModeHash: state.retrievalModeHash,
          sectionTypesHash: state.sectionTypesHash,
          personaKey: state.personaKey,
          tokenAwarePacking: state.tokenAwarePacking,
          userId: state.userId,
          caseId: state.caseId,
          conversationId: state.conversationId,
          filePath: state.filePath,
        },
      },
    });

    const hit = await loadAceContextPlannerHit(state);

    expect(hit).not.toBeNull();
    expect(hit?.meta.source).toBe('local');
    expect(hit?.meta.deltaFields).toEqual(['repoGitSha']);
    expect(hit?.packet.toolPolicy).toEqual({ allowWriteTools: false });
    expect(mockBumpContextCacheHit).toHaveBeenCalledWith(state.cacheKey);
  });

  it('returns null when every cache layer misses', async () => {
    const { buildAceContextPlannerState, loadAceContextPlannerHit } = await import(
      '$lib/server/ace/context-cache-planner.js'
    );

    const state = buildAceContextPlannerState({ query: 'miss path' });
    mockGetContextCacheWithSource.mockResolvedValue({ source: 'miss', pack: null });

    const hit = await loadAceContextPlannerHit(state);

    expect(hit).toBeNull();
    expect(mockBumpContextCacheHit).not.toHaveBeenCalled();
  });
});