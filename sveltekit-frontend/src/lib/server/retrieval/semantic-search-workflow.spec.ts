// @vitest-environment node
import path from 'node:path';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const {
  memoryStore,
  mkdirMock,
  writeFileMock,
  readFileMock,
  existsSyncMock,
  searchMock,
} = vi.hoisted(() => {
  const memoryStore = new Map<string, string>();

  function normalizePath(filePath: string): string {
    return path.isAbsolute(filePath) ? path.normalize(filePath) : path.normalize(path.resolve(process.cwd(), filePath));
  }

  const mkdirMock = vi.fn().mockResolvedValue(undefined);
  const writeFileMock = vi.fn(async (filePath: string, data: string) => {
    memoryStore.set(normalizePath(filePath), data);
  });
  const readFileMock = vi.fn(async (filePath: string) => {
    const content = memoryStore.get(normalizePath(filePath));
    if (content === undefined) throw new Error(`missing test file: ${filePath}`);
    return content;
  });
  const existsSyncMock = vi.fn((filePath: string) => memoryStore.has(normalizePath(filePath)));

  const searchMock = vi.fn(async () => ({
    packets: [{ packetKey: 'pkt-1', title: 'Packet 1' }],
    metadata: {
      query: 'semantic search workflow proof',
      candidatesRetrieved: 1,
      candidatesFused: 1,
      candidatesScored: 1,
      candidatesReranked: 1,
      candidatesPostProcessed: 0,
      durationMs: 1,
      stages: {
        retrieve: 1,
        fuse: 0,
        score: 0,
        hydrate: 0,
        rerank: 0,
        postProcess: 0,
      },
    },
    provenance: {
      retrievalSources: ['qdrant'],
      fusionMethod: 'rrf',
      rerankModel: 'none',
      rerankerUsed: false,
      promotionAttempted: false,
    },
    topPacketKeys: ['pkt-1'],
  }));

  return { memoryStore, mkdirMock, writeFileMock, readFileMock, existsSyncMock, searchMock };
});

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock,
  promises: {
    mkdir: mkdirMock,
    writeFile: writeFileMock,
    readFile: readFileMock,
  },
}));

vi.mock('$lib/server/mcp/atlas-tools-client.js', () => ({
  buildStreamPreamble: vi.fn(async () => ({ intent: null, rag: null })),
}));

vi.mock('$lib/server/atlas/retrieval/search-runtime-adapter.js', () => ({
  createAtlasSearchAdapter: vi.fn(() => ({
    search: searchMock,
  })),
}));

vi.mock('$lib/server/search/rust-napi-search-backend.js', () => ({
  RustNapiSearchBackend: vi.fn(),
}));

vi.mock('$lib/server/features/ai/ace/kag-dag-runner.js', () => ({
  persistKagDagRunFromSteps: vi.fn(async () => null),
}));

vi.mock('./embedding-service.js', () => ({
  embedQueryForLane: vi.fn(),
}));

import { loadDailyGraphifyBoard } from '../atlas/board/daily-graphify-board.js';
import { runSemanticSearchWorkflow } from './semantic-search-workflow.js';

describe('semantic search workflow', () => {
  beforeEach(() => {
    memoryStore.clear();
    mkdirMock.mockClear();
    writeFileMock.mockClear();
    readFileMock.mockClear();
    existsSyncMock.mockClear();
    searchMock.mockClear();
  });

  it('persists a workflow report and makes it readable by the daily board loader', async () => {
    const result = await runSemanticSearchWorkflow(
      {
        query: 'semantic search workflow proof',
        topK: 3,
        includeWorkflowPreamble: false,
        includeAcePacket: true,
        compareRustShadow: false,
        withGraphExpansion: false,
        persistReport: true,
        filters: {
          includeGenerated: false,
          includeLegacy: false,
        },
      },
      { userId: null, caseId: 'smoke-phase-109' },
    );

    expect(result.workflowState).toBe('COMPLETE');
    expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({
      withGraphExpansion: false,
    }));
    expect(result.contextManifestShadow).toMatchObject({
      status: 'UNAVAILABLE',
      reason: 'REVISION_QUALIFIED_FEATURE_SOURCE_PROVIDER_NOT_CONFIGURED',
      writesPerformed: false,
      canonicalAuthority: false,
      rankingPromotion: false,
    });
    expect(writeFileMock).toHaveBeenCalled();
    expect(memoryStore.size).toBeGreaterThan(0);

    const board = await loadDailyGraphifyBoard();
    expect(board.workflowState).toBe('COMPLETE');
    expect(board.workflowDag.length).toBeGreaterThan(0);
    expect(board.recommendationSource).toContain('semantic-search-workflow.json');
    expect(board.temporalRecommendations).toHaveLength(0);
  });

  it('carries bounded query classification through the real workflow caller', async () => {
    const result = await runSemanticSearchWorkflow({
      query: 'Find the code that connects Valkey caching to the ACE assembler and explain its behavior',
      topK: 5,
      includeWorkflowPreamble: false,
      includeAcePacket: true,
      compareRustShadow: false,
      withGraphExpansion: true,
      persistReport: false,
    });

    expect(result.metadata.queryClassification).toMatchObject({
      schema: 'atlas.query-classification.v1',
      producerRevision: 'semantic-search-workflow-v1',
      domains: ['ace', 'cache'],
      retrievalNeeds: { lexical: true, ast: true, semantic: true, graph: true },
      operation: 'INSPECT',
    });
    expect(result.workflowDag).toContainEqual(expect.objectContaining({
      name: 'classify_query_intent',
      status: 'completed',
      detail: 'domains=ace,cache; ast=true; graph=true',
    }));
    expect(searchMock).toHaveBeenCalledWith(expect.objectContaining({
      withGraphExpansion: true,
    }));
    expect(result.metadata.queryClassification).not.toHaveProperty('canonicalAuthority');
  });
});
