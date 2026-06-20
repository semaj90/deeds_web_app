// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetContextCacheWithSource, mockBumpContextCacheHit, mockSetContextCache } = vi.hoisted(() => ({
  mockGetContextCacheWithSource: vi.fn(),
  mockBumpContextCacheHit: vi.fn(),
  mockSetContextCache: vi.fn(),
}));

vi.mock('$lib/server/ace/llm-context-cache.js', () => ({
  buildContextCacheKey: (identity: { queryHash: string; repoGitSha: string; systemPromptHash: string }) =>
    `llmctx:${identity.queryHash}:${identity.repoGitSha}:${identity.systemPromptHash}`,
  getContextCacheWithSource: (...args: unknown[]) => mockGetContextCacheWithSource(...args),
  setContextCache: (...args: unknown[]) => mockSetContextCache(...args),
  bumpContextCacheHit: (...args: unknown[]) => mockBumpContextCacheHit(...args),
  normalizeCachedContextPacket: <T>(pack: T) => pack,
}));

describe('context-cache-planner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    mockBumpContextCacheHit.mockResolvedValue(undefined);
    mockSetContextCache.mockResolvedValue(undefined);
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
      source: 'local-json',
      pack: {
        summary: 'cached summary',
        chunkIds: ['chunk-1'],
        graphPaths: ['a | b | c'],
        toolPolicy: { allowWriteTools: false },
        prefixTokensEstimated: 42,
        cacheHit: true,
        retrievalSkipped: true,
        backend: state.backend,
        modelName: state.modelName,
        modelQuant: state.modelQuant,
        kvQuant: state.kvQuant,
        draftModel: state.draftModel,
        tokenizerHash: state.tokenizerHash,
        systemPromptHash: state.systemPromptHash,
        toolDefinitionsHash: state.toolDefinitionsHash,
        repoGitSha: 'repo-a',
        corpusHash: state.corpusHash,
        ragBundleHash: state.ragBundleHash,
        graphSnapshotHash: state.graphSnapshotHash,
        featureId: 'ace-context',
        glyphMask: 0,
        topFiles: ['context-assembler.ts'],
        topTriples: [['a', 'b', 'c']],
        selectedSourceIds: ['chunk-1'],
        cacheKeys: ['key-1'],
        warnings: [],
        plannerState: {
          queryHash: state.queryHash,
          modelName: state.modelName,
          modelQuant: state.modelQuant,
          kvQuant: state.kvQuant,
          draftModel: state.draftModel,
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
    expect(hit?.meta.source).toBe('local-json');
    expect(hit?.meta.deltaFields).toEqual(['repoGitSha']);
    expect(hit?.packet.toolPolicy).toEqual({ allowWriteTools: false });
    expect(mockBumpContextCacheHit).toHaveBeenCalledWith(state.cacheKey);
  });

  it('stores context hit in Redis and local JSON', async () => {
    const { buildAceContextPlannerState, storeAceContextPlannerHit } = await import(
      '$lib/server/ace/context-cache-planner.js'
    );
    const state = buildAceContextPlannerState({ query: 'test' });
    const packet = { 
      featureId: 'test-feature',
      glyphMask: 0,
      summary: 'test summary',
      topFiles: [],
      topTriples: [],
      selectedSourceIds: [],
      cacheKeys: [],
      warnings: []
    };
    const meta = { source: 'qdrant', retrievedAt: new Date().toISOString(), estimatedPrefixTokens: 10 };

    await storeAceContextPlannerHit(state, packet as any, meta as any);

    expect(mockSetContextCache).toHaveBeenCalled();
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
