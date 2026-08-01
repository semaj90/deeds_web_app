// @vitest-environment node
/**
 * Unit tests for src/lib/server/parent-atlas/precall/retrieve-evidence-service.ts
 *
 * Covers the 8 proof gates from
 * openspec/changes/parent-atlas-runtime-ownership-precall/proposal.md's
 * "Best next bounded session" instruction, at the unit level (mocked
 * parallelRetrieve/tryEmbedCanonical, no live infra). The equivalent
 * live-HTTP proof (real Postgres/Qdrant, real auth session) is recorded
 * in that proposal.md's Progress section, not repeated here.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParallelRetrieveResult } from '$lib/server/retrieval/parallel-orchestrator.js';

const { mockParallelRetrieve, mockTryEmbedCanonical } = vi.hoisted(() => ({
  mockParallelRetrieve: vi.fn(),
  mockTryEmbedCanonical: vi.fn(),
}));

vi.mock('$lib/server/retrieval/parallel-orchestrator.js', () => ({
  parallelRetrieve: mockParallelRetrieve,
}));

vi.mock('$lib/server/embedding/canonical-embed.js', () => ({
  tryEmbedCanonical: mockTryEmbedCanonical,
}));

function baseOrchestratorResult(overrides?: Partial<ParallelRetrieveResult>): ParallelRetrieveResult {
  // Top-level `results` mirrors the real orchestrator's post-fan-in/dedup
  // top-K, which must include whatever the successful lane(s) below found
  // — a real parallelRetrieve() never returns a top-level results array
  // that disagrees with its own lanes[].results.
  const postgresHit = {
    id: 'chunk-1',
    source: 'postgres' as const,
    score: 0.9,
    relativeScore: 0.9,
    content: 'some matched content',
    metadata: { source_ref: 'src/lib/foo.ts' },
  };

  return {
    results: [postgresHit],
    lanes: [
      { lane: 'qdrant', status: 'not_configured', results: [], reason: 'embedding_unavailable' },
      { lane: 'turbovec', status: 'not_configured', results: [], reason: 'turbovec_grpc_not_wired' },
      { lane: 'redis', status: 'not_configured', results: [], reason: 'lane_disabled' },
      { lane: 'postgres', status: 'success', results: [postgresHit] },
      { lane: 'neo4j', status: 'not_configured', results: [], reason: 'lane_disabled' },
    ],
    ...overrides,
  } as ParallelRetrieveResult;
}

describe('retrieveEvidence', () => {
  let retrieveEvidence: typeof import('$lib/server/parent-atlas/precall/retrieve-evidence-service.js').retrieveEvidence;
  let RetrieveEvidenceInputError: typeof import('$lib/server/parent-atlas/precall/retrieve-evidence-service.js').RetrieveEvidenceInputError;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockTryEmbedCanonical.mockResolvedValue(null);
    mockParallelRetrieve.mockResolvedValue(baseOrchestratorResult());

    const mod = await import('$lib/server/parent-atlas/precall/retrieve-evidence-service.js');
    retrieveEvidence = mod.retrieveEvidence;
    RetrieveEvidenceInputError = mod.RetrieveEvidenceInputError;
  });

  it('INVALID_INPUT_REJECTED — throws RetrieveEvidenceInputError for missing required fields', async () => {
    await expect(retrieveEvidence({ query: 'test' })).rejects.toBeInstanceOf(RetrieveEvidenceInputError);
    expect(mockParallelRetrieve).not.toHaveBeenCalled();
  });

  it('INVALID_INPUT_REJECTED — rejects non-object input without throwing an unrelated error', async () => {
    await expect(retrieveEvidence('not an object')).rejects.toBeInstanceOf(RetrieveEvidenceInputError);
  });

  it('DEFAULT_LANES_APPLIED — omitting lanes falls back to the schema default', async () => {
    await retrieveEvidence({ query: 'find auth session logic', workspaceRevision: 'rev-1' });

    const [, , options] = mockParallelRetrieve.mock.calls[0];
    // Defaults are ['exact','lexical','semantic','ast'] — 'exact'/'ast' have
    // no orchestrator backing, so only lexical (FTS) and semantic (Qdrant,
    // gated on embedding availability) translate into include* flags.
    expect(options.includeFts).toBe(true);
    expect(options.includeQdrant).toBe(true);
    expect(options.includeNeo4j).toBe(false);
    expect(options.includeRedis).toBe(false);
  });

  it('WORKSPACE_REVISION_PRESERVED — echoes the input revision unchanged in the output', async () => {
    const output = await retrieveEvidence({
      query: 'find auth session logic',
      workspaceRevision: 'rev-abc-123',
    });
    expect(output.workspaceRevision).toBe('rev-abc-123');
  });

  it('CENTROID_NOT_CONFIGURED_REPORTED — centroid lane reports not_configured/centroid_routing_disabled without touching Redis when routing is not explicitly enabled', async () => {
    const output = await retrieveEvidence({
      query: 'find auth session logic',
      workspaceRevision: 'rev-1',
      lanes: ['centroid'],
    });

    const [, , options] = mockParallelRetrieve.mock.calls[0];
    expect(options.includeRedis).toBe(false); // never probes Redis unless centroidRouting.enabled === true

    const centroidLane = output.lanes.find((l) => l.lane === 'centroid');
    expect(centroidLane?.status).toBe('not_configured');
  });

  it('CENTROID_NOT_CONFIGURED_REPORTED — passes includeRedis:true only when centroidRouting.enabled is explicit', async () => {
    await retrieveEvidence({
      query: 'find auth session logic',
      workspaceRevision: 'rev-1',
      lanes: ['centroid'],
      centroidRouting: { enabled: true },
    });

    const [, , options] = mockParallelRetrieve.mock.calls[0];
    expect(options.includeRedis).toBe(true);
  });

  it('TURBOVEC_NOT_CONFIGURED_REPORTED — turbovec lane is always attempted and surfaces not_configured', async () => {
    const output = await retrieveEvidence({
      query: 'find auth session logic',
      workspaceRevision: 'rev-1',
      lanes: ['lexical'], // turbovec not even requested
    });

    const [, , options] = mockParallelRetrieve.mock.calls[0];
    expect(options.includeTurboVec).toBe(true); // always true regardless of requested lanes

    const turbovecLane = output.lanes.find((l) => l.lane === 'turbovec');
    expect(turbovecLane?.status).toBe('not_configured');
    expect(turbovecLane?.reason).toBe('turbovec_grpc_not_wired');
  });

  it('FALLBACK_LANE_EXECUTED — not_configured lanes carry fallbackUsed:true when another lane produced real results', async () => {
    const output = await retrieveEvidence({
      query: 'find auth session logic',
      workspaceRevision: 'rev-1',
    });

    const postgresLane = output.lanes.find((l) => l.lane === 'lexical');
    expect(postgresLane?.status).toBe('success');
    expect(postgresLane?.fallbackUsed).toBe(false);

    const unconfiguredLanes = output.lanes.filter((l) => l.status === 'not_configured');
    expect(unconfiguredLanes.length).toBeGreaterThan(0);
    for (const lane of unconfiguredLanes) {
      expect(lane.fallbackUsed).toBe(true);
    }
  });

  it('FALLBACK_LANE_EXECUTED — fallbackUsed is false everywhere when no lane produced any results', async () => {
    mockParallelRetrieve.mockResolvedValue(
      baseOrchestratorResult({
        results: [],
        lanes: [
          { lane: 'qdrant', status: 'not_configured', results: [], reason: 'embedding_unavailable' },
          { lane: 'turbovec', status: 'not_configured', results: [], reason: 'turbovec_grpc_not_wired' },
          { lane: 'redis', status: 'not_configured', results: [], reason: 'lane_disabled' },
          { lane: 'postgres', status: 'success', results: [] },
          { lane: 'neo4j', status: 'not_configured', results: [], reason: 'lane_disabled' },
        ],
      })
    );

    const output = await retrieveEvidence({ query: 'nothing matches', workspaceRevision: 'rev-1' });
    for (const lane of output.lanes) {
      expect(lane.fallbackUsed).toBe(false);
    }
  });

  it('OUTPUT_SCHEMA_VALIDATED — maps orchestrator SearchResult[] into schema-conformant evidence entries', async () => {
    const output = await retrieveEvidence({
      query: 'find auth session logic',
      workspaceRevision: 'rev-1',
    });

    expect(output.evidence).toHaveLength(1);
    expect(output.evidence[0]).toMatchObject({
      packetKey: 'chunk-1',
      sourceRef: 'src/lib/foo.ts',
      score: 0.9,
    });
    expect(typeof output.evidence[0].summary).toBe('string');
  });

  it('OUTPUT_SCHEMA_VALIDATED — throws rather than returning a malformed shape when the orchestrator misbehaves', async () => {
    mockParallelRetrieve.mockResolvedValue({
      // Missing `lanes` entirely — a real bug this schema exists to catch.
      results: [{ id: 'x', source: 'qdrant', score: 'not-a-number', relativeScore: 1 }],
    });

    await expect(
      retrieveEvidence({ query: 'find auth session logic', workspaceRevision: 'rev-1' })
    ).rejects.toThrow();
  });

  it('semantic lane degrades to not_configured/embedding_unavailable and does not call Qdrant when embedding fails', async () => {
    mockTryEmbedCanonical.mockResolvedValue(null);

    await retrieveEvidence({ query: 'find auth session logic', workspaceRevision: 'rev-1' });

    const [, queryVectorArg] = mockParallelRetrieve.mock.calls[0];
    expect(queryVectorArg).toBeNull();
  });

  it('semantic lane embeds and passes a Float32Array when the embedding backend succeeds', async () => {
    mockTryEmbedCanonical.mockResolvedValue({
      model: 'embeddinggemma-onnx',
      embedding: new Array(768).fill(0.1),
      source: 'onnx-local',
    });

    await retrieveEvidence({ query: 'find auth session logic', workspaceRevision: 'rev-1' });

    const [, queryVectorArg] = mockParallelRetrieve.mock.calls[0];
    expect(queryVectorArg).toBeInstanceOf(Float32Array);
    expect((queryVectorArg as Float32Array).length).toBe(768);
  });

  it('does not attempt embedding at all when the semantic lane is not requested', async () => {
    await retrieveEvidence({
      query: 'find auth session logic',
      workspaceRevision: 'rev-1',
      lanes: ['lexical'],
    });
    expect(mockTryEmbedCanonical).not.toHaveBeenCalled();
  });

  it('exact/ast lanes report not_configured/lane_not_yet_implemented without reaching the orchestrator for those lanes', async () => {
    const output = await retrieveEvidence({
      query: 'find auth session logic',
      workspaceRevision: 'rev-1',
      lanes: ['exact', 'ast'],
    });

    const exactLane = output.lanes.find((l) => l.lane === 'exact');
    const astLane = output.lanes.find((l) => l.lane === 'ast');
    expect(exactLane).toMatchObject({ status: 'not_configured', reason: 'lane_not_yet_implemented' });
    expect(astLane).toMatchObject({ status: 'not_configured', reason: 'lane_not_yet_implemented' });
  });
});
