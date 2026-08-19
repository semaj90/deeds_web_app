import { describe, expect, it } from 'vitest';
import { SEMANTIC_DIMENSION } from '$lib/server/embedding/embedding-contract-768.js';
import { runCuvsSemanticChallenger } from './cuvs-semantic-challenger.js';
import type { RapidsKnnResponse, RapidsSidecarClient } from './rapids-sidecar-client.js';

const vector = (seed: number) => Array.from({ length: SEMANTIC_DIMENSION }, (_, index) => ((index + seed) % 17) / 17);
const corpus = ['p1', 'p2', 'p3', 'p4'].map((packetKey, index) => ({
  packetKey,
  sourceRevision: `s${index + 1}`,
  symbolVersionId: null,
  vector: vector(index + 1),
}));

function response(
  operation: RapidsKnnResponse['operation'],
  backend: RapidsKnnResponse['backend'],
  rows: Array<[string, string, number]>,
  corpusRows: number,
): RapidsKnnResponse {
  return {
    operation,
    backend,
    representationId: 'semantic_768',
    dimension: SEMANTIC_DIMENSION,
    results: rows.map(([packetKey, sourceRevision, distance], index) => ({
      rank: index + 1,
      packetKey,
      sourceRevision,
      symbolVersionId: null,
      distance,
    })),
    corpusRows,
    gpuMemoryBeforeMb: 1000,
    gpuMemoryAfterMb: 950,
    durationMs: 3,
    truncated: false,
  };
}

function client(): RapidsSidecarClient {
  return {
    baseUrl: 'test://rapids',
    health: async () => ({ status: 'ok' }),
    capabilities: async () => ({
      sidecar_version: 'test',
      schema_version: 1,
      operations: [],
      row_identity_contract: 'packetKey+sourceRevision',
    }),
    knnCagra: async (request) => response(
      'knn.cagra',
      'cuvs.cagra',
      [
        ['p1', 's1', 0.10],
        ['p3', 's3', 0.12],
        ['p2', 's2', 0.14],
      ].slice(0, request.topK) as Array<[string, string, number]>,
      request.corpus.length,
    ),
    knnExact: async (request) => {
      const isFullOracle = request.corpus.length === 4;
      return response(
        'knn.exact',
        'cuvs.brute_force',
        isFullOracle
          ? [['p2', 's2', 0.05], ['p4', 's4', 0.08]]
          : [['p2', 's2', 0.05], ['p1', 's1', 0.10]],
        request.corpus.length,
      );
    },
  };
}

describe('runCuvsSemanticChallenger', () => {
  it('uses CAGRA only for shortlist generation and emits exact-promoted results', async () => {
    const result = await runCuvsSemanticChallenger({
      schema: 'atlas.cuvs-semantic-challenger-input.v1',
      requestId: 'cuvs-1',
      queryVector: vector(9),
      corpus,
      topK: 2,
      oversampleFactor: 1.5,
      runFullOracle: false,
      maxOracleCorpusRows: 100,
      deadlineMs: 1000,
      representationRevision: 'sem-r1',
      producerRevision: 'test-r1',
    }, client());

    expect(result.cagraShortlistK).toBe(3);
    expect(result.promoted.map((row) => row.packetKey)).toEqual(['p2', 'p1']);
    expect(result.promoted[0].exactDistance).toBe(0.05);
    expect(result.invariants.laneVoteCount).toBe(1);
    expect(result.invariants.cagraIndependentLaneVote).toBe(false);
    expect(result.invariants.exactIndependentLaneVote).toBe(false);
    expect(result.invariants.approximateResultsMayBypassPromotion).toBe(false);
  });

  it('can run a bounded full-corpus oracle and report Recall@K', async () => {
    const result = await runCuvsSemanticChallenger({
      schema: 'atlas.cuvs-semantic-challenger-input.v1',
      requestId: 'cuvs-2',
      queryVector: vector(9),
      corpus,
      topK: 2,
      oversampleFactor: 1.5,
      runFullOracle: true,
      maxOracleCorpusRows: 10,
      deadlineMs: 1000,
      representationRevision: 'sem-r1',
      producerRevision: 'test-r1',
    }, client());

    expect(result.oracle.ran).toBe(true);
    expect(result.oracle.reason).toBe('FULL_CORPUS_BRUTE_FORCE_ORACLE');
    expect(result.oracle.recallAtK).toBe(0);
  });

  it('skips the full oracle when the corpus exceeds the configured oracle envelope', async () => {
    const result = await runCuvsSemanticChallenger({
      schema: 'atlas.cuvs-semantic-challenger-input.v1',
      requestId: 'cuvs-3',
      queryVector: vector(9),
      corpus,
      topK: 2,
      oversampleFactor: 1.5,
      runFullOracle: true,
      maxOracleCorpusRows: 3,
      deadlineMs: 1000,
      representationRevision: 'sem-r1',
      producerRevision: 'test-r1',
    }, client());

    expect(result.oracle.ran).toBe(false);
    expect(result.oracle.reason).toContain('ORACLE_SKIPPED_CORPUS_ROWS_EXCEED_LIMIT');
  });
});
