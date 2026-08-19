import { describe, expect, it } from 'vitest';
import type { RepairEvidenceCandidateV1 } from '$lib/server/atlas/ranking/agentic-repair-evidence-gate.js';
import type { SourceRevisionResolutionV1 } from '$lib/server/atlas/identity/source-revision-resolver.js';
import type { RapidsSidecarClient } from './rapids-sidecar-client.js';
import {
  compileRepairSemanticCorpus,
  runRepairSemanticTournament,
  type RepairSemanticMirrorRowV1,
} from './repair-semantic-corpus.js';

const vec = (seed = 0) => Array.from({ length: 768 }, (_, index) => (index + seed) / 10_000);

function candidate(packetKey: string, sourceRef = `src/${packetKey}.ts`): RepairEvidenceCandidateV1 {
  return {
    candidateId: `candidate:${packetKey}`,
    packetKey,
    sourceRef,
    sourceRevision: null,
    ordinal: 0,
    tokenCount: 20,
    semanticScore: 0.8,
    lexicalScore: 0.2,
    graphAuthority: 0.1,
    centroidAffinity: 0.1,
    cacheHotness: 0,
    demandUtility: 0.5,
    executionUtility: 0.5,
    recency: 1,
    normalizedCost: 0.1,
    hopDistance: null,
    pathCost: null,
    communityId: null,
    communityOverlap: 0,
    pprAffinity: 0,
    exactEvidence: true,
    contentRef: `packet:${packetKey}`,
    lanes: ['canonical'],
    executors: ['test'],
    evidenceRefs: [`packet:${packetKey}`],
  };
}

function resolution(packetKey: string, sourceRevision = 'git-1'): SourceRevisionResolutionV1 {
  return {
    schema: 'atlas.source-revision-resolution.v1',
    candidateId: `candidate:${packetKey}`,
    packetKey,
    sourceRef: `src/${packetKey}.ts`,
    status: 'EXACT_PACKET_KEY',
    sourceRevision,
    contentHashes: [`sha-${packetKey}`],
    matchedRowIds: [`chunk-${packetKey}`],
    matchedRowCount: 1,
    distinctRevisionCount: 1,
    evidenceRefs: [`chunk:${packetKey}`],
    exactIdentityMatched: true,
    canonicalWritesAllowed: false,
  };
}

function mirror(packetKey: string, overrides: Partial<RepairSemanticMirrorRowV1> = {}): RepairSemanticMirrorRowV1 {
  return {
    packetKey,
    sourceRef: `src/${packetKey}.ts`,
    sourceRevision: null,
    symbolVersionId: `symbol:${packetKey}`,
    representationId: 'semantic_768',
    representationRevision: 'embeddinggemma-fixture-v1',
    vector: vec(packetKey.length),
    mirrorRef: `qdrant:${packetKey}`,
    ...overrides,
  };
}

describe('repair semantic corpus', () => {
  it('uses Postgres revision authority while allowing a mirror with no revision metadata', async () => {
    const result = await compileRepairSemanticCorpus(
      { requestId: 'r1', candidates: [candidate('p1')] },
      async () => [mirror('p1')],
      {
        maxCandidates: 16,
        producerRevision: 'test-v1',
        resolveRevisions: async () => [resolution('p1', 'git-canonical')],
      },
    );

    expect(result.corpus).toHaveLength(1);
    expect(result.corpus[0]?.sourceRevision).toBe('git-canonical');
    expect(result.invariants.postgresOwnsSourceRevision).toBe(true);
    expect(result.invariants.mirrorOwnsVectorBytesOnly).toBe(true);
  });

  it('rejects an explicitly stale mirror revision instead of trusting Qdrant lineage', async () => {
    const result = await compileRepairSemanticCorpus(
      { requestId: 'r1', candidates: [candidate('p1')] },
      async () => [mirror('p1', { sourceRevision: 'git-stale' })],
      {
        maxCandidates: 16,
        producerRevision: 'test-v1',
        resolveRevisions: async () => [resolution('p1', 'git-canonical')],
      },
    );

    expect(result.corpus).toHaveLength(0);
    expect(result.exclusions.some((row) => row.reason === 'MIRROR_REVISION_MISMATCH')).toBe(true);
  });

  it('rejects non-768 vectors before they reach cuVS', async () => {
    const result = await compileRepairSemanticCorpus(
      { requestId: 'r1', candidates: [candidate('p1')] },
      async () => [mirror('p1', { vector: Array(384).fill(0.1) })],
      {
        maxCandidates: 16,
        producerRevision: 'test-v1',
        resolveRevisions: async () => [resolution('p1')],
      },
    );

    expect(result.corpus).toHaveLength(0);
    expect(result.exclusions.some((row) => row.reason === 'VECTOR_DIMENSION_MISMATCH')).toBe(true);
  });

  it('excludes ambiguous canonical revisions before requesting mirror vectors', async () => {
    let lookupCount = 0;
    const ambiguous: SourceRevisionResolutionV1 = {
      ...resolution('p1'),
      status: 'AMBIGUOUS',
      sourceRevision: null,
      distinctRevisionCount: 2,
    };
    const result = await compileRepairSemanticCorpus(
      { requestId: 'r1', candidates: [candidate('p1')] },
      async (requests) => {
        lookupCount += requests.length;
        return [];
      },
      {
        maxCandidates: 16,
        producerRevision: 'test-v1',
        resolveRevisions: async () => [ambiguous],
      },
    );

    expect(lookupCount).toBe(0);
    expect(result.exclusions.some((row) => row.reason === 'REVISION_AMBIGUOUS')).toBe(true);
  });

  it('fails the entire corpus on mixed representation revisions', async () => {
    const result = await compileRepairSemanticCorpus(
      { requestId: 'r1', candidates: [candidate('p1'), candidate('p2')] },
      async () => [
        mirror('p1', { representationRevision: 'model-v1' }),
        mirror('p2', { representationRevision: 'model-v2' }),
      ],
      {
        maxCandidates: 16,
        producerRevision: 'test-v1',
        resolveRevisions: async () => [resolution('p1'), resolution('p2')],
      },
    );

    expect(result.corpus).toHaveLength(0);
    expect(result.representationRevision).toBeNull();
  });

  it('runs CAGRA then exact promotion as one semantic lane', async () => {
    const calls: string[] = [];
    const rapids: RapidsSidecarClient = {
      baseUrl: 'http://test',
      health: async () => ({ status: 'ok' }),
      capabilities: async () => ({ sidecar_version: 'test', schema_version: 1, operations: [], row_identity_contract: 'packetKey+sourceRevision' }),
      knnCagra: async (request) => {
        calls.push('cagra');
        return {
          operation: 'knn.cagra',
          backend: 'cuvs.cagra',
          representationId: 'semantic_768',
          dimension: 768,
          results: request.corpus.map((row, index) => ({
            rank: index + 1,
            packetKey: row.packetKey,
            sourceRevision: row.sourceRevision,
            symbolVersionId: row.symbolVersionId,
            distance: index + 0.1,
          })),
          corpusRows: request.corpus.length,
          gpuMemoryBeforeMb: 100,
          gpuMemoryAfterMb: 110,
          durationMs: 2,
          truncated: false,
        };
      },
      knnExact: async (request) => {
        calls.push('exact');
        return {
          operation: 'knn.exact',
          backend: 'cuvs.brute_force',
          representationId: 'semantic_768',
          dimension: 768,
          results: request.corpus.slice(0, request.topK).map((row, index) => ({
            rank: index + 1,
            packetKey: row.packetKey,
            sourceRevision: row.sourceRevision,
            symbolVersionId: row.symbolVersionId,
            distance: index + 0.01,
          })),
          corpusRows: request.corpus.length,
          gpuMemoryBeforeMb: 100,
          gpuMemoryAfterMb: 110,
          durationMs: 1,
          truncated: false,
        };
      },
    };

    const result = await runRepairSemanticTournament({
      requestId: 'r1',
      queryText: 'fix packet ranking',
      candidates: [candidate('p1'), candidate('p2')],
      topK: 1,
      oversampleFactor: 2,
      deadlineMs: 1000,
      runFullOracle: false,
      maxOracleCorpusRows: 100,
    }, {
      embedQuery: async () => vec(99),
      lookupMirror: async () => [mirror('p1'), mirror('p2')],
      resolveRevisions: async () => [resolution('p1'), resolution('p2')],
      rapidsClient: rapids,
    }, 'test-v1');

    expect(result.status).toBe('EXECUTED');
    expect(calls).toEqual(['cagra', 'exact']);
    expect(result.invariants.oneSemanticLaneVote).toBe(true);
    expect(result.invariants.approximateMayBypassExactPromotion).toBe(false);
    expect(result.promotedPacketKeys).toHaveLength(1);
  });
});
