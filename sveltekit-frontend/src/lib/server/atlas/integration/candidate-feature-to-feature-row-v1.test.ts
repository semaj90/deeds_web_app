import { describe, expect, it } from 'vitest';
import type { EvidenceLocatorV1 } from '../contracts/evidence-locator-v1.js';
import { buildLexicalInputProof, sha256Utf8 } from '../contracts/lexical-input-proof-v1.js';
import { sha256Stable } from '../agentic-file-compiler/contracts.js';
import { materializeOntologyObservationTupleV1 } from '../evidence/ontology-observation-tuple-v1.js';
import { spanChecksumOf } from '../execution/topk-evidence-fetch-v1.js';
import type { CandidateFeatureRowV1 } from '../features/candidate-feature-row-v1.js';
import {
  promoteCandidateFeatureRowV1 as promoteCandidateFeatureRowV1Actual,
  type PromotedPageRankAuthorityV1,
} from './candidate-feature-to-feature-row-v1.js';

describe('candidate-feature-to-feature-row-v1', () => {
  const locator: EvidenceLocatorV1 = {
    canonicalId: 'canonical:src/lib/demo.ts:test',
    packetKey: 'pkt:src/lib/demo.ts',
    sourceRef: 'src/lib/demo.ts',
    sourceRevision: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
    workspaceRevision: 'sha256:2222222222222222222222222222222222222222222222222222222222222222',
    contentHash: `sha256:${sha256Utf8('verified fixture source')}`,
    sourceKind: 'code',
    fileExtension: 'ts',
    filePath: 'src/lib/demo.ts',
    url: null,
  };

  const makeCandidate = (overrides: Partial<CandidateFeatureRowV1> = {}): CandidateFeatureRowV1 => ({
    schema: 'atlas.candidate-feature-row.v1',
    candidateOrdinal: 0,
    canonicalId: locator.canonicalId,
    packetKey: locator.packetKey,
    sourceRef: locator.sourceRef,
    treeNodeId: 'tree-node:demo',
    symbolVersionId: null,
    workspaceRevision: locator.workspaceRevision,
    sourceRevision: locator.sourceRevision,
    graphRevision: 'graph-rev-v1',
    semanticRevision: 'semantic-rev-v1',
    featureRevision: 'feat-rev-v1',
    representationBindings: [{
      representationId: 'semantic_768',
      family: 'EMBEDDINGGEMMA_MRL',
      dimensions: 768,
      modelRevision: 'embeddinggemma-rev-v1',
      projectionKind: 'NONE',
      sourceRepresentationId: null,
      projectionRevision: null,
      normalized: true,
      available: true,
      availabilityReason: null,
    }],
    semanticRelevance: 0.85,
    lexicalRelevance: 0.7,
    astAffinity: 0.6,
    graphAuthority: 0.05,
    personalizedPageRank: null,
    communityAffinity: null,
    manifold4OrientationSimilarity: null,
    crossEncoderRawScore: null,
    crossEncoderCalibratedScore: null,
    crossEncoderAvailable: false,
    domainAffinity: 0.5,
    executionUtility: 0.4,
    memoryUtility: null,
    laneMask: ['semantic', 'lexical', 'ast', 'graph'],
    degradedIdentity: false,
    evidenceRefs: ['evidence:chunk:01'],
    ...overrides,
  });

  const validPromotedPageRank: PromotedPageRankAuthorityV1 = {
    runId: 'run-pr-01',
    graphRevision: 'graph-rev-v1',
    status: 'promoted',
    didConverge: true,
    pagerank_l1: 0.05,
    pagerank_raw: 1.25,
    authority_percentile: 0.92,
    authority_band: 'high',
  };

  const semanticEvidenceFor = (candidate: CandidateFeatureRowV1) => {
    const binding = candidate.representationBindings.find((row) => row.representationId === 'semantic_768')!;
    const recipe = (mode: 'retrieval_query' | 'retrieval_document') => ({
      representationId: 'semantic_768' as const,
      representationRevision: candidate.semanticRevision!,
      modelArtifactRevision: binding?.modelRevision ?? 'embeddinggemma:test:v1',
      tokenizerRevision: 'tokenizer:test:v1',
      inputPolicyRevision: 'input-policy:test:v1',
      promptRevision: 'prompt:test:v1',
      mode,
      dimension: 768 as const,
      metric: 'COSINE' as const,
      normalization: 'L2' as const,
      inputChecksum: 'a'.repeat(64),
    });
    return {
      packetKey: candidate.packetKey!,
      canonicalId: candidate.canonicalId,
      sourceRef: candidate.sourceRef!,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      queryRecipe: recipe('retrieval_query'),
      documentRecipe: recipe('retrieval_document'),
    };
  };

  const lexicalEvidenceFor = (candidate: CandidateFeatureRowV1) => buildLexicalInputProof({
    packetKey: candidate.packetKey!,
    sourceRef: candidate.sourceRef!,
    content: 'verified fixture source',
    declaredContentHash: sha256Utf8('verified fixture source'),
    sourceRevision: candidate.sourceRevision,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevisionProven: true,
    workspaceRevisionCurrent: true,
    canonicalBindingExact: true,
    tokenizerRevision: 'tokenizer:test:v1',
    lexicalDerivationRevision: 'lexical:test:v1',
    textSearchConfig: 'english',
  });

  const resealLexicalEvidence = (proof: ReturnType<typeof lexicalEvidenceFor>) => {
    const { inputChecksum: _inputChecksum, ...body } = proof;
    return { ...body, inputChecksum: sha256Stable(body) };
  };

  const astEvidenceFor = (candidate: CandidateFeatureRowV1) => ({
    treeNodeId: candidate.treeNodeId!,
    symbolVersionId: candidate.symbolVersionId ?? 'symbol-version:fixture',
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey!,
    sourceRef: candidate.sourceRef!,
    sourceRevision: candidate.sourceRevision,
    workspaceRevision: candidate.workspaceRevision,
    sourceContentHash: sha256Utf8('verified fixture source'),
    startByte: 0,
    endByte: 10,
    sourceEvidence: (() => {
      const byteStart = 0;
      const byteEnd = 20;
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
        evidenceRefs: ['source-evidence:verified-fixture'],
        canonicalAuthority: false as const,
      };
    })(),
  });

  const promoteCandidateFeatureRowV1 = (input: Omit<Parameters<typeof promoteCandidateFeatureRowV1Actual>[0], 'semanticEvidence'> & {
    semanticEvidence?: Parameters<typeof promoteCandidateFeatureRowV1Actual>[0]['semanticEvidence'];
    lexicalEvidence?: Parameters<typeof promoteCandidateFeatureRowV1Actual>[0]['lexicalEvidence'];
    astEvidence?: Parameters<typeof promoteCandidateFeatureRowV1Actual>[0]['astEvidence'];
  }) => promoteCandidateFeatureRowV1Actual({
    ...input,
    semanticEvidence: input.semanticEvidence ?? semanticEvidenceFor(input.candidate),
    lexicalEvidence: input.lexicalEvidence ?? (input.candidate.packetKey && input.candidate.sourceRef
      ? lexicalEvidenceFor(input.candidate)
      : undefined),
    astEvidence: input.astEvidence ?? astEvidenceFor(input.candidate),
  });

  it('promotes valid CandidateFeatureRowV1 into FeatureRowV1 with promoted PageRank', () => {
    const candidate = makeCandidate();
    const featureRow = promoteCandidateFeatureRowV1({
      candidate,
      locator,
      pagerank: validPromotedPageRank,
      rrf: 0.75,
      freshness: 0.9,
    });

    expect(featureRow.schema).toBe('atlas.feature-row.v1');
    expect(featureRow.canonicalId).toBe(locator.canonicalId);
    expect(featureRow.packetKey).toBe(locator.packetKey);
    expect(featureRow.graphRevision).toBe('graph-rev-v1');
    expect(featureRow.pagerankAuthority).toBe(0.05);
    expect(featureRow.dense).toBe(0.85);
    expect(featureRow.sparse).toBe(0.7);
    expect(featureRow.rrf).toBe(0.75);
    expect(featureRow.freshness).toBe(0.9);
  });

  it('refuses semantic ranking when the query/document recipe evidence is absent', () => {
    expect(() => promoteCandidateFeatureRowV1Actual({
      candidate: makeCandidate({ laneMask: ['semantic'], lexicalRelevance: null, astAffinity: null }),
      locator,
      pagerank: validPromotedPageRank,
      rrf: 0.75,
      freshness: 0.9,
    })).toThrow('CANDIDATE_FEATURE_SEMANTIC_EVIDENCE_REQUIRED');
  });

  it('requires lexical proof and checks its identity, revisions, eligibility, and checksum', () => {
    const candidate = makeCandidate({ laneMask: ['lexical'], semanticRelevance: null, astAffinity: null });
    const lexicalEvidence = lexicalEvidenceFor(candidate);
    const invoke = (proof?: typeof lexicalEvidence) => promoteCandidateFeatureRowV1Actual({
      candidate,
      locator,
      pagerank: validPromotedPageRank,
      lexicalEvidence: proof,
      rrf: 0.5,
      freshness: 0.5,
    });

    expect(() => invoke()).toThrow('CANDIDATE_FEATURE_LEXICAL_EVIDENCE_REQUIRED');
    expect(() => invoke({ ...lexicalEvidence, sourceRevision: 'sha256:stale' })).toThrow('CANDIDATE_FEATURE_LEXICAL_SOURCE_REVISION_MISMATCH');
    expect(() => invoke({ ...lexicalEvidence, inputChecksum: '0'.repeat(64) })).toThrow('CANDIDATE_FEATURE_LEXICAL_PROOF_CHECKSUM_MISMATCH');
    expect(() => invoke(resealLexicalEvidence({
      ...lexicalEvidence,
      declaredContentHash: '0'.repeat(64),
      computedContentHash: '0'.repeat(64),
    }))).toThrow('CANDIDATE_FEATURE_LEXICAL_CONTENT_DIGEST_MISMATCH');
    expect(() => invoke(resealLexicalEvidence({
      ...lexicalEvidence,
      eligible: false,
      rejectionReason: 'SOURCE_REVISION_UNPROVEN',
    }))).toThrow('CANDIDATE_FEATURE_LEXICAL_PROOF_NOT_ELIGIBLE:SOURCE_REVISION_UNPROVEN');
  });

  it('requires AST identity, source revision, and a valid byte span', () => {
    const candidate = makeCandidate({ laneMask: ['ast'], semanticRelevance: null, lexicalRelevance: null });
    const astEvidence = astEvidenceFor(candidate);
    const invoke = (evidence?: typeof astEvidence) => promoteCandidateFeatureRowV1Actual({
      candidate,
      locator,
      pagerank: validPromotedPageRank,
      astEvidence: evidence,
      rrf: 0.5,
      freshness: 0.5,
    });

    expect(() => invoke()).toThrow('CANDIDATE_FEATURE_AST_EVIDENCE_REQUIRED');
    expect(() => invoke({ ...astEvidence, treeNodeId: 'tree-node:other' })).toThrow('CANDIDATE_FEATURE_AST_TREE_NODE_MISMATCH');
    expect(() => invoke({ ...astEvidence, canonicalId: 'canonical:other' })).toThrow('CANDIDATE_FEATURE_AST_CANONICAL_ID_MISMATCH');
    expect(() => invoke({ ...astEvidence, workspaceRevision: 'workspace:stale' })).toThrow('CANDIDATE_FEATURE_AST_WORKSPACE_REVISION_MISMATCH');
    expect(() => invoke({ ...astEvidence, sourceRevision: 'sha256:stale' })).toThrow('CANDIDATE_FEATURE_AST_SOURCE_REVISION_MISMATCH');
    expect(() => invoke({ ...astEvidence, startByte: null })).toThrow('CANDIDATE_FEATURE_AST_SPAN_OR_DIGEST_INVALID');
    expect(() => invoke({ ...astEvidence, sourceContentHash: '0'.repeat(64) })).toThrow('CANDIDATE_FEATURE_AST_CONTENT_DIGEST_MISMATCH');
    expect(() => invoke({
      ...astEvidence,
      sourceEvidence: { ...astEvidence.sourceEvidence, canonicalId: 'canonical:other' },
    })).toThrow('CANDIDATE_FEATURE_AST_SOURCE_EVIDENCE_IDENTITY_MISMATCH');
    expect(() => invoke({
      ...astEvidence,
      sourceEvidence: { ...astEvidence.sourceEvidence, spanChecksum: '0'.repeat(64) },
    })).toThrow('CANDIDATE_FEATURE_AST_SOURCE_EVIDENCE_UNVERIFIED');
  });

  it('joins ontology observations by subject, source, and revisions as evidence without adding a score', () => {
    const candidate = makeCandidate();
    const tuple = materializeOntologyObservationTupleV1({
      subjectCanonicalId: candidate.canonicalId,
      predicate: 'implements',
      objectCanonicalIdOrClass: 'concept:verified',
      confidence: 0.9,
      evidenceRefs: ['tuple-evidence:one'],
      sourceRef: candidate.sourceRef!,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      classifierRevision: 'classifier:r1',
      ontologyRevision: 'ontology:r1',
      producerRevision: 'producer:r1',
      evaluationStatus: 'NOT_APPLICABLE',
    });
    const joined = promoteCandidateFeatureRowV1({
      candidate,
      locator,
      pagerank: validPromotedPageRank,
      ontologyEvidence: [tuple],
      rrf: 0.75,
      freshness: 0.9,
    });
    expect(joined.evidenceRefs).toContain('tuple-evidence:one');
    expect(joined.dense).toBe(candidate.semanticRelevance);
    expect(joined.sparse).toBe(candidate.lexicalRelevance);

    expect(() => promoteCandidateFeatureRowV1({
      candidate,
      locator,
      pagerank: validPromotedPageRank,
      ontologyEvidence: [materializeOntologyObservationTupleV1({
        subjectCanonicalId: 'canonical:other',
        predicate: 'implements',
        objectCanonicalIdOrClass: 'concept:verified',
        confidence: 0.9,
        evidenceRefs: ['tuple-evidence:other'],
        sourceRef: candidate.sourceRef!,
        workspaceRevision: candidate.workspaceRevision,
        sourceRevision: candidate.sourceRevision,
        classifierRevision: 'classifier:r1',
        ontologyRevision: 'ontology:r1',
        producerRevision: 'producer:r1',
        evaluationStatus: 'NOT_APPLICABLE',
      })],
      rrf: 0.75,
      freshness: 0.9,
    })).toThrow('CANDIDATE_FEATURE_ONTOLOGY_SUBJECT_MISMATCH');

    const invokeWithTuple = (overrides: Partial<Parameters<typeof materializeOntologyObservationTupleV1>[0]>) =>
      promoteCandidateFeatureRowV1({
        candidate,
        locator,
        pagerank: validPromotedPageRank,
        ontologyEvidence: [materializeOntologyObservationTupleV1({
          subjectCanonicalId: candidate.canonicalId,
          predicate: 'implements',
          objectCanonicalIdOrClass: 'concept:verified',
          confidence: 0.9,
          evidenceRefs: ['tuple-evidence:one'],
          sourceRef: candidate.sourceRef!,
          workspaceRevision: candidate.workspaceRevision,
          sourceRevision: candidate.sourceRevision,
          classifierRevision: 'classifier:r1',
          ontologyRevision: 'ontology:r1',
          producerRevision: 'producer:r1',
          evaluationStatus: 'NOT_APPLICABLE',
          ...overrides,
        })],
        rrf: 0.75,
        freshness: 0.9,
      });

    expect(() => invokeWithTuple({ sourceRef: 'src/other.ts' })).toThrow('CANDIDATE_FEATURE_ONTOLOGY_SOURCE_REF_MISMATCH');
    expect(() => invokeWithTuple({ workspaceRevision: 'workspace:stale' })).toThrow('CANDIDATE_FEATURE_ONTOLOGY_WORKSPACE_REVISION_MISMATCH');
    expect(() => invokeWithTuple({ sourceRevision: 'sha256:stale' })).toThrow('CANDIDATE_FEATURE_ONTOLOGY_SOURCE_REVISION_MISMATCH');

    expect(() => promoteCandidateFeatureRowV1({
      candidate,
      locator,
      pagerank: validPromotedPageRank,
      ontologyEvidence: [{ ...tuple, tupleChecksum: '0'.repeat(64) }],
      rrf: 0.75,
      freshness: 0.9,
    })).toThrow('ONTOLOGY_OBSERVATION_TUPLE_CHECKSUM_MISMATCH');
  });

  it('refuses mismatched semantic identity or incompatible query/document recipes', () => {
    const candidate = makeCandidate();
    const semanticEvidence = semanticEvidenceFor(candidate);
    expect(() => promoteCandidateFeatureRowV1({
      candidate,
      locator,
      semanticEvidence: { ...semanticEvidence, sourceRevision: 'sha256:stale' },
      pagerank: validPromotedPageRank,
      rrf: 0.75,
      freshness: 0.9,
    })).toThrow('CANDIDATE_FEATURE_SEMANTIC_SOURCE_REVISION_MISMATCH');

    expect(() => promoteCandidateFeatureRowV1({
      candidate,
      locator,
      semanticEvidence: {
        ...semanticEvidence,
        documentRecipe: { ...semanticEvidence.documentRecipe, tokenizerRevision: 'tokenizer:other:v1' },
      },
      pagerank: validPromotedPageRank,
      rrf: 0.75,
      freshness: 0.9,
    })).toThrow('SEMANTIC_QUERY_DOCUMENT_RECIPE_MISMATCH:tokenizerRevision');
  });

  it('rejects unpromoted PageRank data fail-closed', () => {
    const candidate = makeCandidate();
    const unpromotedPR: PromotedPageRankAuthorityV1 = {
      ...validPromotedPageRank,
      status: 'passed', // computed or passed, but not yet promoted!
    };

    expect(() =>
      promoteCandidateFeatureRowV1({
        candidate,
        locator,
        pagerank: unpromotedPR,
        rrf: 0.5,
        freshness: 0.5,
      }),
    ).toThrow('UNPROMOTED_PAGERANK_DATA_REJECTED:passed');
  });

  it('rejects PageRank runs that failed to converge', () => {
    const candidate = makeCandidate();
    const unconvergedPR: PromotedPageRankAuthorityV1 = {
      ...validPromotedPageRank,
      didConverge: false,
    };

    expect(() =>
      promoteCandidateFeatureRowV1({
        candidate,
        locator,
        pagerank: unconvergedPR,
        rrf: 0.5,
        freshness: 0.5,
      }),
    ).toThrow('PAGERANK_RUN_DID_NOT_CONVERGE');
  });

  it('rejects PageRank data with graph revision mismatch', () => {
    const candidate = makeCandidate({ graphRevision: 'graph-rev-v2' });

    expect(() =>
      promoteCandidateFeatureRowV1({
        candidate,
        locator,
        pagerank: validPromotedPageRank, // has graphRevision: 'graph-rev-v1'
        rrf: 0.5,
        freshness: 0.5,
      }),
    ).toThrow('PAGERANK_GRAPH_REVISION_MISMATCH:graph-rev-v1:graph-rev-v2');
  });

  it('rejects missing graph revision, convergence proof, and promotion status', () => {
    expect(() => promoteCandidateFeatureRowV1({
      candidate: makeCandidate(),
      locator,
      pagerank: { ...validPromotedPageRank, graphRevision: null },
      rrf: 0.5,
      freshness: 0.5,
    })).toThrow('PAGERANK_GRAPH_REVISION_REQUIRED');

    expect(() => promoteCandidateFeatureRowV1({
      candidate: makeCandidate(),
      locator,
      pagerank: { ...validPromotedPageRank, didConverge: null },
      rrf: 0.5,
      freshness: 0.5,
    })).toThrow('PAGERANK_CONVERGENCE_UNVERIFIED');

    expect(() => promoteCandidateFeatureRowV1({
      candidate: makeCandidate(),
      locator,
      pagerank: { ...validPromotedPageRank, status: null },
      rrf: 0.5,
      freshness: 0.5,
    })).toThrow('UNPROMOTED_PAGERANK_DATA_REJECTED:null');
  });

  it('fails closed when PageRank L1 score is corrupt (NaN / Infinity)', () => {
    const candidate = makeCandidate();
    const corruptPR: PromotedPageRankAuthorityV1 = {
      ...validPromotedPageRank,
      pagerank_l1: NaN,
      pagerank_raw: 1.0,
    };

    expect(() =>
      promoteCandidateFeatureRowV1({
        candidate,
        locator,
        pagerank: corruptPR,
        rrf: 0.5,
        freshness: 0.5,
      }),
    ).toThrow('PAGERANK_L1_CORRUPT_FAIL_CLOSED');
  });

  it('fails closed when candidate has null graphRevision', () => {
    const candidate = makeCandidate({ graphRevision: null });

    expect(() =>
      promoteCandidateFeatureRowV1({
        candidate,
        locator,
        pagerank: validPromotedPageRank,
        rrf: 0.5,
        freshness: 0.5,
      }),
    ).toThrow('CANDIDATE_FEATURE_GRAPH_REVISION_REQUIRED');
  });

  it('rejects revision mismatch between candidate and locator', () => {
    const candidate = makeCandidate({
      workspaceRevision: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
    });

    expect(() =>
      promoteCandidateFeatureRowV1({
        candidate,
        locator,
        pagerank: validPromotedPageRank,
        rrf: 0.5,
        freshness: 0.5,
      }),
    ).toThrow('CANDIDATE_FEATURE_REVISION_MISMATCH:workspace');
  });

  it('rejects semantic scores without an available semantic_768 representation binding', () => {
    expect(() => promoteCandidateFeatureRowV1({
      candidate: makeCandidate({ representationBindings: [] }),
      locator,
      pagerank: validPromotedPageRank,
      rrf: 0.75,
      freshness: 0.9,
    })).toThrow('CANDIDATE_FEATURE_SEMANTIC_768_BINDING_REQUIRED');

    expect(() => promoteCandidateFeatureRowV1({
      candidate: makeCandidate({
        representationBindings: [{
          representationId: 'semantic_768',
          family: 'EMBEDDINGGEMMA_MRL',
          dimensions: 768,
          modelRevision: 'embeddinggemma-rev-v1',
          projectionKind: 'NONE',
          sourceRepresentationId: null,
          projectionRevision: null,
          normalized: true,
          available: false,
          availabilityReason: 'MISSING_VECTOR',
        }],
      }),
      locator,
      pagerank: validPromotedPageRank,
      rrf: 0.75,
      freshness: 0.9,
    })).toThrow('CANDIDATE_FEATURE_SEMANTIC_768_BINDING_REQUIRED');
  });

  it('rejects sourceRef and packet identity mismatches instead of joining by ordinal', () => {
    expect(() => promoteCandidateFeatureRowV1({
      candidate: makeCandidate({ sourceRef: 'src/lib/other.ts' }),
      locator,
      pagerank: validPromotedPageRank,
      rrf: 0.5,
      freshness: 0.5,
    })).toThrow('CANDIDATE_FEATURE_SOURCE_REF_MISMATCH:src/lib/other.ts:src/lib/demo.ts');

    expect(() => promoteCandidateFeatureRowV1({
      candidate: makeCandidate({ packetKey: null }),
      locator,
      pagerank: validPromotedPageRank,
      rrf: 0.5,
      freshness: 0.5,
    })).toThrow('CANDIDATE_FEATURE_PACKET_KEY_MISMATCH::pkt:src/lib/demo.ts');
  });
});
