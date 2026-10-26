import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_SCALAR_FEATURES,
  materializeCandidateFeatureColumnar,
  type CandidateFeatureColumnarV1,
} from '../features/candidate-feature-columnar-v1.js';
import { scoreCandidateFeatureHeadsCpu } from '../features/candidate-feature-gemm-v1.js';
import { materializeCandidateFeatureSnapshot } from '../features/candidate-feature-snapshot-v1.js';
import { materializeCandidateOrdinalMap, type CandidateOrdinalMapV1 } from '../features/canonical-candidate-v1.js';
import {
  buildAtlasRankInputV1,
  candidateOrderDigestV1,
  scoreAtlasRankInputWithFeaturesGemm,
  validateAtlasRankInputV1,
  type AtlasRankInputV1,
  type ValidateRankInputOptions,
} from './atlas-rank-input-adapter-v1.js';
import {
  FLOATS_PER_TILE,
  MAX_CANDIDATES_BATCH,
  TILE_CHANNEL_CANONICAL_INDEX,
  TILE_CHANNEL_FEATURES,
  packCandidateTiles,
  tileCellOffset,
} from './atlas-feature-matrix-4x6-v1.js';

const WS = 'workspace:tile:v1';
const GRAPH = 'graph:tile:v1';
const FEATURE_REV = 'feature:tile:v1';

interface Fixture {
  map: CandidateOrdinalMapV1;
  columnar: CandidateFeatureColumnarV1;
}

/** Deterministic: value of a feature depends only on (ordinal, feature index). Ordinals 2 and 5 are made identical to force a tie. */
function featureValue(ordinal: number, featureIndex: number): number | null {
  const key = ordinal === 5 ? 2 : ordinal;
  if ((key * 3 + featureIndex) % 7 === 0) return null;
  return ((key * 37 + featureIndex * 11) % 101) / 100;
}

function buildFixture(count: number, opts: { workspace?: string; graph?: string; salt?: string } = {}): Fixture {
  const workspace = opts.workspace ?? WS;
  const graph = opts.graph ?? GRAPH;
  const salt = opts.salt ?? 'a';
  const map = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: `candidate:tile:${salt}`,
    workspaceRevision: workspace,
    producerRevision: 'ordinal:tile:v1',
    candidates: Array.from({ length: count }, (_, i) => {
      const id = String(i).padStart(5, '0');
      return {
        canonicalId: `canon:${id}`, packetKey: `packet:${id}`, treeNodeId: `tree:${id}`, symbolVersionId: `symbol:${id}`,
        workspaceRevision: workspace, sourceRevision: `source:${id}`, graphRevision: graph, semanticRevision: 'semantic:tile:v1',
        degradedIdentity: false, evidenceRefs: [`ast:${id}`],
      };
    }),
  });
  const rows = map.candidates.map((candidate, ordinal) => {
    const scalar: Record<string, number | null> = {};
    CANDIDATE_SCALAR_FEATURES.forEach((name, index) => {
      scalar[name] = name === 'crossEncoderRawScore' ? null : featureValue(ordinal, index);
    });
    return {
      schema: 'atlas.candidate-feature-row.v1' as const,
      candidateOrdinal: ordinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision: candidate.graphRevision,
      semanticRevision: candidate.semanticRevision,
      featureRevision: FEATURE_REV,
      ...scalar,
      crossEncoderAvailable: false,
      laneMask: ['semantic' as const],
      degradedIdentity: false,
      evidenceRefs: candidate.evidenceRefs,
    };
  });
  const snapshot = materializeCandidateFeatureSnapshot({ ordinalMap: map, rows, featureRevision: FEATURE_REV, producerRevision: 'snapshot:tile:v1' });
  const columnar = materializeCandidateFeatureColumnar({ snapshot, producerRevision: 'columnar:tile:v1' });
  return { map, columnar };
}

const PROJECTED_WEIGHTS = [0.5, 0.25, 0.125, 0.0625, 0.03125, 0.015625];

function projectedHead(headId = 'head:tile:v1') {
  const weights = new Array(CANDIDATE_SCALAR_FEATURES.length).fill(0);
  TILE_CHANNEL_CANONICAL_INDEX.forEach((index, channel) => { weights[index] = PROJECTED_WEIGHTS[channel]; });
  return { headId, featureRevision: FEATURE_REV, featureCount: CANDIDATE_SCALAR_FEATURES.length, headCount: 1, weights: [weights], bias: [0.1] };
}

function options(map: CandidateOrdinalMapV1, overrides: Partial<ValidateRankInputOptions> = {}): ValidateRankInputOptions {
  return {
    ordinalMap: map,
    expectedWorkspaceRevision: WS,
    expectedGraphRevision: GRAPH,
    expectedOrdinalMapRevision: map.ordinalMapChecksum,
    expectedTaxonomyRevision: 'taxonomy:tile:v1',
    expectedFeatureSchemaRevision: 'schema:tile:v1',
    expectedEvidenceRevision: 'evidence:tile:v1',
    ...overrides,
  };
}

function build(fixture: Fixture, ordinals: number[]): AtlasRankInputV1 {
  return buildAtlasRankInputV1({
    queryDigest: 'query:tile:v1',
    graphRevision: GRAPH,
    ordinalMap: fixture.map,
    columnar: fixture.columnar,
    candidateOrdinals: ordinals,
    taxonomyRevision: 'taxonomy:tile:v1',
    featureSchemaRevision: 'schema:tile:v1',
    evidenceRevision: 'evidence:tile:v1',
  });
}

function score(fixture: Fixture, ordinals: number[], topK = 10) {
  const input = build(fixture, ordinals);
  return { input, receipt: scoreAtlasRankInputWithFeaturesGemm({ input, options: options(fixture.map), columnar: fixture.columnar, head: projectedHead(), producerRevision: 'adapter:tile:v1', topK }) };
}

const small = buildFixture(12);

describe('4x6 tile = 4 candidates x 6 features (DECISION 4X6-TILE-01)', () => {
  it('declares six channels as an ordered projection of the canonical 12', () => {
    expect(TILE_CHANNEL_FEATURES).toEqual(['semanticRelevance', 'lexicalRelevance', 'astAffinity', 'personalizedPageRank', 'domainAffinity', 'executionUtility']);
    expect(TILE_CHANNEL_CANONICAL_INDEX).toEqual([0, 1, 2, 4, 9, 10]);
  });

  it('lays out [tileCount,4,6] row-major, one candidate per row, preserving caller order', () => {
    const ordinals = [4, 1, 3, 0, 2];
    const input = build(small, ordinals);
    const { tiles } = input;
    expect(tiles.tileCount).toBe(2);
    expect(tiles.candidateOrdinals).toEqual(ordinals);
    expect(tiles.features).toHaveLength(2 * FLOATS_PER_TILE);
    expect(Array.from(tiles.validRows)).toEqual([1, 1, 1, 1, 1, 0, 0, 0]);
    // candidate index 4 (ordinal 2) is tile 1 row 0
    const ordinal = 2;
    TILE_CHANNEL_CANONICAL_INDEX.forEach((featureIndex, channel) => {
      const expected = featureValue(ordinal, featureIndex);
      const offset = tileCellOffset(1, 0, channel);
      expect(tiles.presentMask[offset]).toBe(expected === null ? 0 : 1);
      expect(tiles.features[offset]).toBeCloseTo(expected ?? 0, 6);
    });
  });

  it('excludes padded rows: zero values, zero presence, no ordinal, never in Top-K', () => {
    const { input, receipt } = score(small, [4, 1, 3, 0, 2], 10);
    for (let row = 5; row < 8; row += 1) {
      for (let channel = 0; channel < 6; channel += 1) {
        const offset = Math.floor(row / 4) * FLOATS_PER_TILE + (row % 4) * 6 + channel;
        expect(input.tiles.features[offset]).toBe(0);
        expect(input.tiles.presentMask[offset]).toBe(0);
      }
    }
    expect(receipt.batchSize).toBe(5);
    expect(receipt.topKOrdinals).toHaveLength(5);
    expect(new Set(receipt.topKOrdinals)).toEqual(new Set([4, 1, 3, 0, 2]));
    const tampered = { ...input, tiles: { ...input.tiles, features: new Float32Array(input.tiles.features) } };
    tampered.tiles.features[tileCellOffset(1, 3, 0)] = 0.5; // padded row cell
    expect(validateAtlasRankInputV1(tampered, options(small.map)).error).toContain('TILE_PADDED_ROW_NOT_ZERO');
  });
});

describe('batch sizes and bounds', () => {
  it.each([1, 3, 4, 5])('accepts B=%i with ceil(B/4) tiles and a valid-row mask', (count) => {
    const fixture = buildFixture(count);
    const ordinals = Array.from({ length: count }, (_, i) => i);
    const { input, receipt } = score(fixture, ordinals);
    expect(input.tiles.tileCount).toBe(Math.ceil(count / 4));
    expect(Array.from(input.tiles.validRows).reduce((a, b) => a + b, 0)).toBe(count);
    expect(receipt.batchSize).toBe(count);
    expect(receipt.gpuExecuted).toBe(false);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
  });

  it.each([4095, 4096])('accepts B=%i end to end through the sealed map and the features GEMM', (count) => {
    const fixture = buildFixture(count);
    const ordinals = Array.from({ length: count }, (_, i) => count - 1 - i);
    const { input, receipt } = score(fixture, ordinals, 5);
    expect(input.tiles.tileCount).toBe(Math.ceil(count / 4));
    expect(input.tiles.tileCount).toBeLessThanOrEqual(1024);
    expect(receipt.candidateOrdinals).toEqual(ordinals);
    expect(receipt.topKOrdinals).toHaveLength(5);
  }, 120_000);

  it('rejects 0 and 4097 candidates', () => {
    expect(() => packCandidateTiles([])).toThrow('TILE_BATCH_SIZE_OUT_OF_BOUNDS');
    const rows = Array.from({ length: MAX_CANDIDATES_BATCH + 1 }, (_, i) => ({ candidateOrdinal: i, values: [0, 0, 0, 0, 0, 0], present: [0, 0, 0, 0, 0, 0] as (0 | 1)[] }));
    expect(() => packCandidateTiles(rows)).toThrow('TILE_BATCH_SIZE_OUT_OF_BOUNDS');
    expect(() => build(small, [])).toThrow('BATCH_SIZE_OUT_OF_BOUNDS');
  });
});

describe('identity, lineage and tensor rejections', () => {
  it('rejects duplicate ordinals at pack time and at validation time', () => {
    expect(() => build(small, [1, 1, 2])).toThrow('TILE_ORDINAL_DUPLICATE');
    const input = build(small, [1, 2, 3]);
    const dup = { ...input, tiles: { ...input.tiles, candidateOrdinals: [1, 1, 3] } };
    expect(validateAtlasRankInputV1(dup, options(small.map)).error).toContain('DUPLICATE_CANDIDATE_ORDINAL');
  });

  it('rejects an ordinal that does not resolve in the sealed map', () => {
    expect(() => build(small, [0, 12])).toThrow('CANDIDATE_ORDINAL_OUT_OF_RANGE');
  });

  it('rejects a stale ordinal-map checksum (columnar from another snapshot)', () => {
    const other = buildFixture(12, { salt: 'b' });
    expect(other.map.ordinalMapChecksum).not.toBe(small.map.ordinalMapChecksum);
    expect(() => buildAtlasRankInputV1({
      queryDigest: 'q', graphRevision: GRAPH, ordinalMap: small.map, columnar: other.columnar, candidateOrdinals: [0, 1],
      taxonomyRevision: 't', featureSchemaRevision: 's', evidenceRevision: 'e',
    })).toThrow('ORDINAL_MAP_CHECKSUM_STALE');
    const input = build(small, [0, 1, 2]);
    expect(validateAtlasRankInputV1({ ...input, ordinalMapRevision: other.map.ordinalMapChecksum }, options(small.map)).error).toBe('ORDINAL_MAP_REVISION_MISMATCH');
    expect(validateAtlasRankInputV1(input, options(small.map, { expectedOrdinalMapRevision: other.map.ordinalMapChecksum })).error).toBe('ORDINAL_MAP_REVISION_MISMATCH');
  });

  it('rejects a tampered ordinal map (checksum no longer matches)', () => {
    const input = build(small, [0, 1]);
    const tampered = { ...small.map, candidates: small.map.candidates.map((c, i) => (i === 0 ? { ...c, sourceRevision: 'source:evil' } : c)) };
    expect(validateAtlasRankInputV1(input, options(tampered)).error).toContain('CHECKSUM_MISMATCH');
  });

  it('rejects revision mismatches (taxonomy, feature schema, evidence, graph, workspace)', () => {
    const input = build(small, [0, 1, 2]);
    expect(validateAtlasRankInputV1(input, options(small.map, { expectedTaxonomyRevision: 'taxonomy:old' })).error).toBe('TAXONOMY_REVISION_MISMATCH');
    expect(validateAtlasRankInputV1(input, options(small.map, { expectedFeatureSchemaRevision: 'schema:old' })).error).toBe('FEATURE_SCHEMA_REVISION_MISMATCH');
    expect(validateAtlasRankInputV1(input, options(small.map, { expectedEvidenceRevision: 'evidence:old' })).error).toBe('EVIDENCE_REVISION_MISMATCH');
    expect(validateAtlasRankInputV1(input, options(small.map, { expectedGraphRevision: 'graph:old' })).error).toBe('GRAPH_REVISION_MISMATCH');
    expect(validateAtlasRankInputV1(input, options(small.map, { expectedWorkspaceRevision: 'workspace:old' })).error).toBe('WORKSPACE_REVISION_MISMATCH');
    expect(() => buildAtlasRankInputV1({
      queryDigest: 'q', graphRevision: 'graph:other', ordinalMap: small.map, columnar: small.columnar, candidateOrdinals: [0],
      taxonomyRevision: 't', featureSchemaRevision: 's', evidenceRevision: 'e',
    })).toThrow('CANDIDATE_GRAPH_REVISION_MISMATCH');
  });

  it('rejects non-finite features and non-binary masks', () => {
    expect(() => packCandidateTiles([{ candidateOrdinal: 0, values: [Number.NaN, 0, 0, 0, 0, 0], present: [1, 0, 0, 0, 0, 0] }])).toThrow('TILE_NONFINITE_FEATURE');
    expect(() => packCandidateTiles([{ candidateOrdinal: 0, values: [0, 0, 0, 0, 0, 0], present: [2 as 0, 0, 0, 0, 0, 0] }])).toThrow('TILE_PRESENCE_NOT_BINARY');
    expect(() => packCandidateTiles([{ candidateOrdinal: 0, values: [0.5, 0, 0, 0, 0, 0], present: [0, 0, 0, 0, 0, 0] }])).toThrow('TILE_ABSENT_FEATURE_MUST_BE_ZERO');
    const input = build(small, [0, 1, 2, 3]);
    const badMask = { ...input, tiles: { ...input.tiles, presentMask: new Uint8Array(input.tiles.presentMask) } };
    badMask.tiles.presentMask[1] = 2;
    expect(validateAtlasRankInputV1(badMask, options(small.map)).error).toContain('TILE_PRESENT_MASK_NOT_BINARY');
    const nonFinite = { ...input, tiles: { ...input.tiles, features: new Float32Array(input.tiles.features) } };
    nonFinite.tiles.features[0] = Number.POSITIVE_INFINITY;
    expect(validateAtlasRankInputV1(nonFinite, options(small.map)).error).toContain('TILE_NONFINITE_FEATURE_CELL');
    const shortMask = { ...input, tiles: { ...input.tiles, presentMask: new Uint8Array(3) } };
    expect(validateAtlasRankInputV1(shortMask, options(small.map)).error).toContain('TILE_PRESENT_MASK_LENGTH_MISMATCH');
  });

  it('rejects evidence references that are not in the sealed map', () => {
    const input = build(small, [0, 1]);
    expect(validateAtlasRankInputV1({ ...input, evidenceRefs: ['ast:made-up'] }, options(small.map)).error).toBe('EVIDENCE_REFERENCE_NOT_IN_SEALED_MAP');
    expect(validateAtlasRankInputV1({ ...input, evidenceRefs: [] }, options(small.map)).error).toBe('EVIDENCE_REFERENCES_REQUIRED');
  });

  it('refuses to score tiles that do not match the columnar they claim to come from', () => {
    const input = build(small, [0, 1, 2, 3]);
    const tampered = { ...input, tiles: { ...input.tiles, features: new Float32Array(input.tiles.features) } };
    const presentCell = Array.from(tampered.tiles.presentMask).findIndex((bit, cell) => bit === 1 && tampered.tiles.validRows[Math.floor(cell / 6)] === 1);
    expect(presentCell).toBeGreaterThanOrEqual(0);
    tampered.tiles.features[presentCell] = (tampered.tiles.features[presentCell] as number) + 0.25;
    expect(() => scoreAtlasRankInputWithFeaturesGemm({ input: tampered, options: options(small.map), columnar: small.columnar, head: projectedHead(), producerRevision: 'p' }))
      .toThrow('TILE_DOES_NOT_MATCH_COLUMNAR');
    expect(() => scoreAtlasRankInputWithFeaturesGemm({ input: { ...input, columnarChecksum: 'f'.repeat(64) }, options: options(small.map), columnar: small.columnar, head: projectedHead(), producerRevision: 'p' }))
      .toThrow('COLUMNAR_CHECKSUM_STALE');
  });
});

describe('scoring runs through the existing features/ GEMM family', () => {
  it('matches scoreCandidateFeatureHeadsCpu exactly and cross-checks the tile tensor', () => {
    const ordinals = [7, 2, 5, 0, 11, 3];
    const { receipt } = score(small, ordinals);
    const direct = scoreCandidateFeatureHeadsCpu({ columnar: small.columnar, head: projectedHead(), producerRevision: 'adapter:tile:v1' });
    expect(receipt.gemmScoreChecksum).toBe(direct.scoreChecksum);
    expect(receipt.gemmInputChecksum).toBe(direct.inputChecksum);
    ordinals.forEach((ordinal, index) => {
      expect(receipt.scores[index]).toBe((direct.scores[ordinal] as number[])[0]);
    });
    expect(receipt.columnarChecksum).toBe(small.columnar.columnarChecksum);
  });

  it('rejects heads that use features outside the declared projection, or more than one head', () => {
    const input = build(small, [0, 1]);
    const leaky = projectedHead();
    leaky.weights[0][CANDIDATE_SCALAR_FEATURES.indexOf('memoryUtility')] = 1;
    expect(() => scoreAtlasRankInputWithFeaturesGemm({ input, options: options(small.map), columnar: small.columnar, head: leaky, producerRevision: 'p' }))
      .toThrow('TILE_HEAD_USES_UNPROJECTED_FEATURE:memoryUtility');
    const two = { ...projectedHead(), headCount: 2, weights: [projectedHead().weights[0], projectedHead().weights[0]], bias: [0, 0] };
    expect(() => scoreAtlasRankInputWithFeaturesGemm({ input, options: options(small.map), columnar: small.columnar, head: two, producerRevision: 'p' }))
      .toThrow('TILE_HEAD_COUNT_MUST_BE_1');
  });

  it('breaks Top-K ties by ascending ordinal (ordinals 2 and 5 have identical features)', () => {
    const { receipt } = score(small, [5, 2], 2);
    expect(receipt.scores[0]).toBe(receipt.scores[1]);
    expect(receipt.topKOrdinals).toEqual([2, 5]);
    const reversed = score(small, [2, 5], 2).receipt;
    expect(reversed.topKOrdinals).toEqual([2, 5]);
  });

  it('is deterministic, order-sensitive and carries lineage + source revisions', () => {
    const a = score(small, [3, 1, 2]).receipt;
    const b = score(small, [3, 1, 2]).receipt;
    const c = score(small, [1, 3, 2]).receipt;
    expect(a.outputChecksum).toBe(b.outputChecksum);
    expect(a.candidateOrderDigest).toBe(candidateOrderDigestV1(small.map.ordinalMapChecksum, [3, 1, 2]));
    expect(a.candidateOrderDigest).not.toBe(c.candidateOrderDigest);
    expect(a.outputChecksum).not.toBe(c.outputChecksum);
    expect(a.sourceRevisions).toEqual(a.candidateOrdinals.map((o) => small.map.candidates[o]?.sourceRevision));
    expect(a.ordinalMapRevision).toBe(small.map.ordinalMapChecksum);
    expect(a.taxonomyRevision).toBe('taxonomy:tile:v1');
    expect(a.featureRevision).toBe(FEATURE_REV);
    expect(a.evidenceRevision).toBe('evidence:tile:v1');
  });

  it('rejects an invalid topK and an invalid input before scoring', () => {
    const input = build(small, [0, 1]);
    expect(() => scoreAtlasRankInputWithFeaturesGemm({ input, options: options(small.map), columnar: small.columnar, head: projectedHead(), producerRevision: 'p', topK: -1 })).toThrow('TOP_K_INVALID');
    expect(() => scoreAtlasRankInputWithFeaturesGemm({ input: { ...input, taxonomyRevision: 'x' }, options: options(small.map), columnar: small.columnar, head: projectedHead(), producerRevision: 'p' }))
      .toThrow('CANNOT_SCORE_INVALID_RANK_INPUT:TAXONOMY_REVISION_MISMATCH');
  });
});

describe('cross-language parity fixture (TS adapter vs Python CPU oracle)', () => {
  const FIXTURE_PATH = resolve(process.cwd(), '..', 'python', 'tests', 'fixtures', 'rank_tile_parity_v1.json');
  const ORDINALS = [7, 2, 5, 0, 11, 3, 8, 1, 10, 4, 9];

  function produce() {
    const { input, receipt } = score(small, ORDINALS, 5);
    return {
      schema: 'atlas.rank-tile-parity-fixture.v1',
      note: 'Generated by atlas-rank-input-adapter-v1.spec.ts (UPDATE_RANK_TILE_FIXTURE=1). Python re-derives every field independently in python/tests/test_candidate_concept_tile_v1.py.',
      ordinalMap: small.map,
      featureRevision: FEATURE_REV,
      tileChannelCanonicalIndex: [...TILE_CHANNEL_CANONICAL_INDEX],
      headWeightsByChannel: PROJECTED_WEIGHTS,
      headBias: 0.1,
      candidateOrdinals: ORDINALS,
      tileCount: input.tiles.tileCount,
      tileFeatures: Array.from(input.tiles.features),
      tilePresent: Array.from(input.tiles.presentMask),
      validRows: Array.from(input.tiles.validRows),
      scores: receipt.scores,
      topK: 5,
      topKOrdinals: receipt.topKOrdinals,
      ordinalMapChecksum: small.map.ordinalMapChecksum,
      candidateOrderDigest: receipt.candidateOrderDigest,
    };
  }

  it('matches the committed fixture (set UPDATE_RANK_TILE_FIXTURE=1 to regenerate)', () => {
    const produced = produce();
    if (process.env.UPDATE_RANK_TILE_FIXTURE === '1') {
      mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(FIXTURE_PATH, `${JSON.stringify(produced, null, 1)}
`, 'utf8');
    }
    const stored = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
    expect(stored.ordinalMapChecksum).toBe(produced.ordinalMapChecksum);
    expect(stored.candidateOrdinals).toEqual(produced.candidateOrdinals);
    expect(stored.tileFeatures).toEqual(produced.tileFeatures);
    expect(stored.tilePresent).toEqual(produced.tilePresent);
    expect(stored.validRows).toEqual(produced.validRows);
    expect(stored.topKOrdinals).toEqual(produced.topKOrdinals);
    expect(stored.candidateOrderDigest).toBe(produced.candidateOrderDigest);
    stored.scores.forEach((value: number, index: number) => expect(value).toBeCloseTo(produced.scores[index] as number, 9));
  });
});
