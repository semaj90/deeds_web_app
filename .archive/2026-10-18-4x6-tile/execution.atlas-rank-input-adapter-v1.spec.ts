import { describe, it, expect } from 'vitest';
import {
  validateAtlasRankInputV1,
  buildAtlasRankInputV1,
  scoreAtlasRankInputWithGemm,
  ATLAS_RANK_INPUT_SCHEMA,
  ATLAS_RANK_SCORING_RECEIPT_SCHEMA,
  type AtlasRankInputV1,
  type CandidateFeatureItem,
} from './atlas-rank-input-adapter-v1.js';
import type { InvestigationCandidateFeatureRow } from './atlas-feature-matrix-4x6-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';

describe('atlas-rank-input-adapter-v1 (NES LUT / GEMM Integration Adapter)', () => {
  function makeMockCandidate(ordinal: number, baseScore: number, missingMask = 0): CandidateFeatureItem {
    const states = ['INSPECT_PARSER', 'TRACE_CALLER', 'VALIDATE_GRAPH', 'RUN_TEST'] as const;
    const matrixRows: InvestigationCandidateFeatureRow[] = states.map((candidateState) => ({
      candidateState,
      canonicalId: `chunk:${String(ordinal).padStart(8, '0')}`,
      semantic: baseScore * 0.9,
      graphPpr: baseScore * 0.8,
      nary: baseScore * 0.7,
      ast: baseScore * 0.6,
      provenance: baseScore * 0.5,
      toolEvidence: baseScore * 0.95,
      provenanceRef: `ref:${ordinal}`,
      missingSignalMask: missingMask,
    }));
    return { candidateOrdinal: ordinal, matrixRows };
  }

  const validCandidates = [
    makeMockCandidate(101, 0.8),
    makeMockCandidate(102, 0.4),
    makeMockCandidate(103, 0.9),
    makeMockCandidate(104, 0.6),
  ];

  function makeOrdinalMap(count = 110, workspaceRevision = 'ws-1') {
    return materializeCandidateOrdinalMap({
      candidates: Array.from({ length: count }, (_, index) => ({
        canonicalId: `chunk:${String(index).padStart(8, '0')}`,
        packetKey: `packet-${index}`,
        treeNodeId: null,
        symbolVersionId: null,
        workspaceRevision,
        sourceRevision: `source-${index}`,
        graphRevision: 'g-1',
        semanticRevision: 'semantic-rev-1',
        degradedIdentity: false,
        evidenceRefs: [`ref:${index}`],
        representationBindings: [],
      })),
      candidateSnapshotRevision: 'snapshot-v1',
      workspaceRevision,
      producerRevision: 'fixture-producer-v1',
    });
  }

  function lineageOptions(input: AtlasRankInputV1, ordinalMap = makeOrdinalMap(110, input.workspaceRevision)) {
    return {
      ordinalMap,
      expectedWorkspaceRevision: input.workspaceRevision,
      expectedGraphRevision: input.graphRevision,
      expectedOrdinalMapRevision: input.ordinalMapRevision,
      expectedTaxonomyRevision: input.taxonomyRevision,
      expectedFeatureSchemaRevision: input.featureSchemaRevision,
      expectedEvidenceRevision: input.evidenceRevision,
    };
  }

  it('builds valid AtlasRankInputV1 contiguous tensors for B=4', () => {
    const rankInput = buildAtlasRankInputV1({
      queryDigest: 'sha256:query123',
      workspaceRevision: 'ws-active-20261018',
      graphRevision: 'g-1',
      ordinalMap: makeOrdinalMap(110, 'ws-active-20261018'),
      taxonomyRevision: 'taxonomy-nes-v1',
      featureSchemaRevision: 'feat-4x6-v1',
      evidenceRevision: 'evidence-v1',
      candidates: validCandidates,
    });

    expect(rankInput.schema).toBe(ATLAS_RANK_INPUT_SCHEMA);
    expect(rankInput.candidateOrdinals).toEqual([101, 102, 103, 104]);
    expect(rankInput.features.length).toBe(4 * 24);
    expect(rankInput.presentMask.length).toBe(4 * 24);

    const validation = validateAtlasRankInputV1(rankInput, lineageOptions(rankInput));
    expect(validation.valid).toBe(true);
  });

  it('rejects batch size B=0 or out-of-bounds', () => {
    const emptyInput: AtlasRankInputV1 = {
      schema: ATLAS_RANK_INPUT_SCHEMA,
      queryDigest: 'sha256:q',
      workspaceRevision: 'ws-1',
      graphRevision: 'g-1',
      ordinalMapRevision: makeOrdinalMap().ordinalMapChecksum,
      taxonomyRevision: 't-1',
      featureSchemaRevision: 'f-1',
      evidenceRevision: 'e-1',
      candidateOrdinals: [],
      features: new Float32Array(0),
      presentMask: new Uint8Array(0),
      evidenceRefs: [],
    };

    const res = validateAtlasRankInputV1(emptyInput, lineageOptions(emptyInput));
    expect(res.valid).toBe(false);
    expect(res.error).toContain('BATCH_SIZE_OUT_OF_BOUNDS');
  });

  it('rejects duplicate candidate ordinals', () => {
    expect(() => buildAtlasRankInputV1({
      queryDigest: 'sha256:q',
      workspaceRevision: 'ws-1',
      graphRevision: 'g-1',
      ordinalMap: makeOrdinalMap(110, 'ws-1'),
      taxonomyRevision: 't-1',
      featureSchemaRevision: 'f-1',
      evidenceRevision: 'e-1',
      candidates: [makeMockCandidate(101, 0.5), makeMockCandidate(101, 0.6)], // Duplicate 101!
    })).toThrow('DUPLICATE_CANDIDATE_ORDINAL');
  });

  it('rejects candidate ordinals that do not resolve through the sealed map', () => {
    expect(() => buildAtlasRankInputV1({
      queryDigest: 'sha256:q',
      workspaceRevision: 'ws-1',
      graphRevision: 'g-1',
      ordinalMap: makeOrdinalMap(110, 'ws-1'),
      taxonomyRevision: 't-1',
      featureSchemaRevision: 'f-1',
      evidenceRevision: 'e-1',
      candidates: [makeMockCandidate(101, 0.5), makeMockCandidate(999, 0.6)],
    })).toThrow('CANDIDATE_ORDINAL_OUT_OF_RANGE');
  });

  it('rejects non-finite features (NaN or Infinity)', () => {
    const rankInput = buildAtlasRankInputV1({
      queryDigest: 'sha256:q',
      workspaceRevision: 'ws-1',
      graphRevision: 'g-1',
      ordinalMap: makeOrdinalMap(110, 'ws-1'),
      taxonomyRevision: 't-1',
      featureSchemaRevision: 'f-1',
      evidenceRevision: 'e-1',
      candidates: [makeMockCandidate(101, 0.5)],
    });

    rankInput.features[5] = Number.NaN;
    const res = validateAtlasRankInputV1(rankInput, lineageOptions(rankInput));
    expect(res.valid).toBe(false);
    expect(res.error).toContain('NON_FINITE_FEATURE');
  });

  it('rejects workspace or taxonomy revision mismatches', () => {
    const rankInput = buildAtlasRankInputV1({
      queryDigest: 'sha256:q',
      workspaceRevision: 'ws-outdated',
      graphRevision: 'g-1',
      ordinalMap: makeOrdinalMap(110, 'ws-outdated'),
      taxonomyRevision: 'taxonomy-v1',
      featureSchemaRevision: 'f-1',
      evidenceRevision: 'e-1',
      candidates: [makeMockCandidate(101, 0.5)],
    });

    const res = validateAtlasRankInputV1(rankInput, {
      ...lineageOptions(rankInput, makeOrdinalMap(110, 'ws-outdated')),
      expectedWorkspaceRevision: 'ws-active-20261018',
    });
    expect(res.valid).toBe(false);
    expect(res.error).toContain('WORKSPACE_REVISION_MISMATCH');
  });

  it('scores candidates deterministically with stable Top-K ordering and tie-breaking', () => {
    const candidates = [
      makeMockCandidate(101, 0.4), // Score ~ 0.4
      makeMockCandidate(102, 0.9), // Score ~ 0.9 (highest)
      makeMockCandidate(103, 0.6), // Score ~ 0.6
      makeMockCandidate(104, 0.6), // Score ~ 0.6 (tie with 103!)
    ];

    const rankInput = buildAtlasRankInputV1({
      queryDigest: 'sha256:query123',
      workspaceRevision: 'ws-active-20261018',
      graphRevision: 'g-1',
      ordinalMap: makeOrdinalMap(110, 'ws-active-20261018'),
      taxonomyRevision: 'taxonomy-nes-v1',
      featureSchemaRevision: 'feat-4x6-v1',
      evidenceRevision: 'evidence-v1',
      candidates,
    });

    let received: { batchSize: number; features: Float32Array; presentMask: Uint8Array } | undefined;
    const receipt = scoreAtlasRankInputWithGemm(rankInput, lineageOptions(rankInput), (batch) => {
      received = batch;
      return [0.4, 0.9, 0.6, 0.6];
    }, 3);
    expect(received?.batchSize).toBe(4);
    expect(received?.features).toHaveLength(4 * 24);
    expect(received?.presentMask).toHaveLength(4 * 24);
    expect(receipt.schema).toBe(ATLAS_RANK_SCORING_RECEIPT_SCHEMA);
    expect(receipt.batchSize).toBe(4);
    expect(receipt.scores).toHaveLength(4);

    // Highest is candidate 102
    expect(receipt.topKOrdinals[0]).toBe(102);

    // 103 and 104 tie on score; candidateOrdinal ascending tie-break puts 103 before 104
    expect(receipt.topKOrdinals[1]).toBe(103);
    expect(receipt.topKOrdinals[2]).toBe(104);

    // Receipt metadata
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.outputChecksum).toHaveLength(64);
  });

  it('properly zeroes out missing features based on presentMask', () => {
    // Missing all channels (mask = 0b111111 = 63)
    const maskedCandidate = makeMockCandidate(105, 0.9, 63);
    const fullCandidate = makeMockCandidate(106, 0.9, 0);

    const rankInput = buildAtlasRankInputV1({
      queryDigest: 'sha256:query123',
      workspaceRevision: 'ws-active-20261018',
      graphRevision: 'g-1',
      ordinalMap: makeOrdinalMap(110, 'ws-active-20261018'),
      taxonomyRevision: 'taxonomy-nes-v1',
      featureSchemaRevision: 'feat-4x6-v1',
      evidenceRevision: 'evidence-v1',
      candidates: [maskedCandidate, fullCandidate],
    });

    let receivedMask: Uint8Array | undefined;
    const receipt = scoreAtlasRankInputWithGemm(rankInput, lineageOptions(rankInput), (batch) => {
      receivedMask = batch.presentMask;
      return [0.1, 0.9];
    });
    expect(receivedMask?.slice(0, 24).every((value) => value === 0)).toBe(true);
    expect(receipt.topKOrdinals[0]).toBe(106);
  });
});
