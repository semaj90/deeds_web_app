import { describe, expect, it } from 'vitest';
import { createHyperedgeV1 } from '../../graph/hyperedge-contract.js';
import { EvidenceLocatorV1Schema } from '../contracts/evidence-locator-v1.js';
import { buildLexicalInputProof, sha256Utf8 } from '../contracts/lexical-input-proof-v1.js';
import { spanChecksumOf } from '../execution/topk-evidence-fetch-v1.js';
import { CandidateFeatureRowV1Schema } from '../features/candidate-feature-row-v1.js';
import { buildRouteMaskV1, routeHammingDistanceV1 } from '../routing/route-mask-v1.js';
import { decodeCandidateFiberLineageV1 } from './candidate-fiber-viterbi-adapter-v1.js';
import { promoteCandidateFeatureRowV1 } from './candidate-feature-to-feature-row-v1.js';
import { projectHyperedgeForRankingV1, projectHyperedgesToIncidenceV1 } from './hyperedge-projection-adapters-v1.js';

describe('Parent Atlas Aug-16 integration boundaries', () => {
  it('promotes nullable candidate features into normalized FeatureRowV1 without changing identity', () => {
    const candidate = CandidateFeatureRowV1Schema.parse({
      schema: 'atlas.candidate-feature-row.v1',
      candidateOrdinal: 7,
      canonicalId: 'symbol:auth.verify',
      packetKey: 'packet:7',
      sourceRef: 'src/auth.ts#verify',
      treeNodeId: 'tree:7',
      symbolVersionId: 'symbol-version:7',
      workspaceRevision: 'ws:1',
      sourceRevision: 'src:1',
      graphRevision: 'graph:1',
      semanticRevision: 'semantic:1',
      featureRevision: 'feature:1',
      representationBindings: [{
        representationId: 'semantic_768',
        family: 'EMBEDDINGGEMMA_MRL',
        dimensions: 768,
        modelRevision: 'embeddinggemma:test:v1',
        projectionKind: 'NONE',
        sourceRepresentationId: null,
        projectionRevision: null,
        normalized: true,
        available: true,
        availabilityReason: null,
      }],
      semanticRelevance: 0.91,
      lexicalRelevance: 0.72,
      astAffinity: 0.83,
      graphAuthority: 0.61,
      personalizedPageRank: 0.54,
      communityAffinity: 0.4,
      manifold4OrientationSimilarity: 0.2,
      crossEncoderRawScore: 3.4,
      crossEncoderCalibratedScore: 0.88,
      crossEncoderAvailable: true,
      domainAffinity: 0.77,
      executionUtility: 0.66,
      memoryUtility: 0.5,
      laneMask: ['semantic', 'lexical', 'ast', 'graph', 'cross_encoder'],
      degradedIdentity: false,
      evidenceRefs: ['evidence:7'],
    });
    const locator = EvidenceLocatorV1Schema.parse({
      schema: 'atlas.evidence-locator.v1',
      canonicalId: 'symbol:auth.verify',
      packetKey: 'packet:7',
      sourceRef: 'src/auth.ts#verify',
      sourceKind: 'code_file',
      filePath: 'src/auth.ts',
      sourceUrl: null,
      contentHash: `sha256:${sha256Utf8('fixture source')}`,
      workspaceRevision: 'ws:1',
      sourceRevision: 'src:1',
      span: { startByte: 10, endByte: 42 },
      domain: null,
    });

    const row = promoteCandidateFeatureRowV1({
      candidate,
      locator,
      semanticEvidence: {
        packetKey: candidate.packetKey!,
        canonicalId: candidate.canonicalId,
        sourceRef: candidate.sourceRef!,
        workspaceRevision: candidate.workspaceRevision,
        sourceRevision: candidate.sourceRevision,
        queryRecipe: {
          representationId: 'semantic_768', representationRevision: candidate.semanticRevision!,
          modelArtifactRevision: 'embeddinggemma:test:v1', tokenizerRevision: 'tokenizer:test:v1',
          inputPolicyRevision: 'input-policy:test:v1', promptRevision: 'prompt:test:v1', mode: 'retrieval_query',
          dimension: 768, metric: 'COSINE', normalization: 'L2', inputChecksum: 'a'.repeat(64),
        },
        documentRecipe: {
          representationId: 'semantic_768', representationRevision: candidate.semanticRevision!,
          modelArtifactRevision: 'embeddinggemma:test:v1', tokenizerRevision: 'tokenizer:test:v1',
          inputPolicyRevision: 'input-policy:test:v1', promptRevision: 'prompt:test:v1', mode: 'retrieval_document',
          dimension: 768, metric: 'COSINE', normalization: 'L2', inputChecksum: 'b'.repeat(64),
        },
      },
      lexicalEvidence: buildLexicalInputProof({
        packetKey: candidate.packetKey!,
        sourceRef: candidate.sourceRef!,
        content: 'fixture source',
        declaredContentHash: sha256Utf8('fixture source'),
        sourceRevision: candidate.sourceRevision,
        workspaceRevision: candidate.workspaceRevision,
        sourceRevisionProven: true,
        workspaceRevisionCurrent: true,
        canonicalBindingExact: true,
        tokenizerRevision: 'tokenizer:test:v1',
        lexicalDerivationRevision: 'lexical:test:v1',
        textSearchConfig: 'english',
      }),
      astEvidence: {
        treeNodeId: candidate.treeNodeId!,
        symbolVersionId: candidate.symbolVersionId!,
        canonicalId: candidate.canonicalId,
        packetKey: candidate.packetKey!,
        sourceRef: candidate.sourceRef!,
        sourceRevision: candidate.sourceRevision,
        workspaceRevision: candidate.workspaceRevision,
        sourceContentHash: sha256Utf8('fixture source'),
        startByte: 10,
        endByte: 42,
        sourceEvidence: (() => {
          const byteStart = 0;
          const byteEnd = 50;
          const text = 'x'.repeat(byteEnd - byteStart);
          return {
            schema: 'atlas.qualified-evidence.v1' as const,
            qualification: 'QUALIFIED' as const,
            rank: 1,
            ordinal: candidate.candidateOrdinal,
            canonicalId: candidate.canonicalId,
            sourceRef: candidate.sourceRef!,
            sourceRevision: candidate.sourceRevision,
            spanUnit: 'bytes' as const,
            spanStart: byteStart,
            spanEnd: byteEnd,
            byteStart,
            byteEnd,
            text,
            spanChecksum: spanChecksumOf({ sourceRevision: candidate.sourceRevision, byteStart, byteEnd, text }),
            evidenceRefs: ['source-evidence:fixture'],
            canonicalAuthority: false as const,
          };
        })(),
      },
      pagerank: {
        pagerank_l1: 0.61,
        graphRevision: candidate.graphRevision,
        status: 'promoted',
        didConverge: true,
      },
      rrf: 0.8,
      freshness: 0.9,
    });

    expect(row.canonicalId).toBe(candidate.canonicalId);
    expect(row.packetKey).toBe(candidate.packetKey);
    expect(row.graphRevision).toBe(candidate.graphRevision);
    expect(row.crossEncoder).toBe(0.88);
    expect(row.pagerankAuthority).toBe(0.61);
  });

  it('projects one canonical ordered hyperedge into incidence and relation-node ranking views', () => {
    const edge = createHyperedgeV1({
      predicate: 'CALL',
      participants: [
        { canonicalId: 'symbol:caller', role: 'caller', ordinal: 0 },
        { canonicalId: 'symbol:callee', role: 'callee', ordinal: 1 },
        { canonicalId: 'symbol:arg', role: 'argument', ordinal: 2 },
      ],
      evidenceRefs: ['evidence:call:1'],
      workspaceRevision: 'ws:1',
      graphRevision: 'graph:1',
      sourceRevision: 'src:1',
      producerRevision: 'producer:1',
    });

    const incidence = projectHyperedgesToIncidenceV1({
      workspaceRevision: 'ws:1',
      projectionRevision: 'projection:1',
      entities: [
        { canonicalId: 'symbol:caller', nodeKind: 'symbol' },
        { canonicalId: 'symbol:callee', nodeKind: 'symbol' },
        { canonicalId: 'symbol:arg', nodeKind: 'symbol' },
      ],
      hyperedges: [edge],
    });
    const ranking = projectHyperedgeForRankingV1(edge);

    expect(incidence.relationCount).toBe(1);
    expect(incidence.edges).toHaveLength(3);
    expect(ranking.relationNodeId).toBe(`relation:${edge.hyperedgeId}`);
    expect(ranking.edges).toHaveLength(6);
    expect(ranking.edges.every((item) => item.source === ranking.relationNodeId || item.target === ranking.relationNodeId)).toBe(true);
  });

  it('decodes revision-qualified candidate fibers through the generic k-best Viterbi owner', () => {
    const paths = decodeCandidateFiberLineageV1({
      fibers: [
        { revision: 'r1', candidates: [
          { canonicalId: 'old:A', identityStatus: 'canonical' },
          { canonicalId: 'old:B', identityStatus: 'canonical' },
        ] },
        { revision: 'r2', candidates: [
          { canonicalId: 'new:A', identityStatus: 'canonical' },
          { canonicalId: 'new:B', identityStatus: 'canonical' },
        ] },
      ],
      emissionScore: ({ candidate }) => candidate.canonicalId.endsWith('A') ? 0.5 : 0.6,
      transitionScore: ({ previous, current }) => {
        const sameLineage = previous.id.endsWith('A') === current.id.endsWith('A');
        return sameLineage ? 1 : -1;
      },
      k: 2,
    });

    expect(paths).toHaveLength(2);
    expect(paths[0].candidateIds).toEqual(['old:B', 'new:B']);
    expect(paths[0].revisions).toEqual(['r1', 'r2']);
  });

  it('keeps Hamming distance in the routing/control plane', () => {
    const ast = buildRouteMaskV1({ semanticRequired: true, astRequired: true, exactOracleRequired: true });
    const graph = buildRouteMaskV1({ semanticRequired: true, graphRequired: true, exactOracleRequired: true });
    expect(routeHammingDistanceV1(ast, graph)).toBe(2);
  });
});
