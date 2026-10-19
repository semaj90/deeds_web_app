import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
  type CanonicalCandidateV1,
} from '../features/canonical-candidate-v1.js';
import {
  CANDIDATE_SCALAR_FEATURES,
  type CandidateFeatureColumnarV1,
} from '../features/candidate-feature-columnar-v1.js';
import {
  candidateFeatureHeadV1Schema,
  scoreCandidateFeatureHeadsCpu,
} from '../features/candidate-feature-gemm-v1.js';
import {
  CANDIDATE_TILE_4X6_SCHEMA,
  MAX_CANDIDATES_BATCH,
  TILE_CHANNELS,
  TILE_CHANNEL_CANONICAL_INDEX,
  TILE_ROWS,
  assertCandidateTilesWellFormed,
  packCandidateTiles,
  tileCellOffset,
  type CandidateTileRowInputV1,
  type CandidateTilesV1,
} from './atlas-feature-matrix-4x6-v1.js';

/**
 * Thin identity/feature adapter (DECISION 4X6-TILE-01 + 4X6-WIDTH-01).
 *
 * A tile is 4 CANDIDATES x 6 features. The six channels are a projection of the canonical 12 scalar
 * features. This module owns NO weights and NO scoring: scores come from the existing
 * features/candidate-feature-gemm-v1.ts CPU reference, and every ordinal is resolved through the
 * sealed CandidateOrdinalMapV1 and bound by ordinalMapChecksum. Output is a derived advisory receipt
 * only (canonicalAuthority:false, writesPerformed:false, no GPU claim).
 */
export const ATLAS_RANK_INPUT_SCHEMA = 'atlas.rank-input.v2' as const;
export const ATLAS_RANK_SCORING_RECEIPT_SCHEMA = 'atlas.rank-scoring-receipt.v2' as const;

export { MAX_CANDIDATES_BATCH };
export const TILE_GEMM_PARITY_TOLERANCE = 1e-5;

export interface AtlasRankInputV1 {
  schema: typeof ATLAS_RANK_INPUT_SCHEMA;
  queryDigest: string;
  workspaceRevision: string;
  graphRevision: string;
  /** Always the sealed map's ordinalMapChecksum. */
  ordinalMapRevision: string;
  candidateSnapshotRevision: string;
  taxonomyRevision: string;
  featureSchemaRevision: string;
  featureRevision: string;
  evidenceRevision: string;
  /** Binds the tiles to the exact columnar fabric they were gathered from. */
  columnarChecksum: string;
  /** One per real candidate, in tile order. */
  sourceRevisions: string[];
  tiles: CandidateTilesV1;
  evidenceRefs: string[];
}

export interface AtlasRankScoringReceiptV1 {
  schema: typeof ATLAS_RANK_SCORING_RECEIPT_SCHEMA;
  queryDigest: string;
  batchSize: number;
  tileCount: number;
  candidateOrdinals: number[];
  ordinalMapRevision: string;
  candidateSnapshotRevision: string;
  workspaceRevision: string;
  graphRevision: string;
  taxonomyRevision: string;
  featureSchemaRevision: string;
  featureRevision: string;
  evidenceRevision: string;
  sourceRevisions: string[];
  candidateOrderDigest: string;
  tileDigest: string;
  columnarChecksum: string;
  headId: string;
  gemmInputChecksum: string;
  gemmScoreChecksum: string;
  scores: number[];
  topKOrdinals: number[];
  outputChecksum: string;
  gpuExecuted: false;
  canonicalAuthority: false;
  writesPerformed: false;
}

export interface ValidateRankInputOptions {
  ordinalMap: CandidateOrdinalMapV1;
  expectedWorkspaceRevision: string;
  expectedGraphRevision: string;
  expectedOrdinalMapRevision: string;
  expectedTaxonomyRevision: string;
  expectedFeatureSchemaRevision: string;
  expectedEvidenceRevision: string;
}

function sha256Hex(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function bytesOf(view: Float32Array | Uint8Array): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

/**
 * Same contract as features/canonical-candidate-v1.ts resolveCanonicalCandidateByOrdinal (range check +
 * ordinal equality) but over a map that was ALREADY parsed and integrity-checked once. The owner function
 * re-parses the whole map on every call (O(N) per ordinal, O(N^2) for a 4,096 batch); see ALIGN-GEMM-GAP-10.
 */
function resolveParsedOrdinal(map: CandidateOrdinalMapV1, ordinal: number): CanonicalCandidateV1 {
  if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= map.rowCount) {
    throw new Error(`CANDIDATE_ORDINAL_OUT_OF_RANGE:${ordinal}`);
  }
  const candidate = map.candidates[ordinal];
  if (!candidate || candidate.candidateOrdinal !== ordinal) throw new Error(`CANDIDATE_ORDINAL_MAP_CORRUPT:${ordinal}`);
  return candidate;
}

export function candidateOrderDigestV1(ordinalMapChecksum: string, candidateOrdinals: readonly number[]): string {
  return sha256Hex(JSON.stringify({ ordinalMapChecksum, candidateOrdinals }));
}

export function candidateTileDigestV1(tiles: CandidateTilesV1): string {
  const hash = createHash('sha256');
  hash.update(JSON.stringify({ schema: tiles.schema, candidateCount: tiles.candidateCount, tileCount: tiles.tileCount, candidateOrdinals: tiles.candidateOrdinals }));
  hash.update(bytesOf(tiles.features));
  hash.update(bytesOf(tiles.presentMask));
  hash.update(bytesOf(tiles.validRows));
  return hash.digest('hex');
}

interface GatheredCandidate {
  row: CandidateTileRowInputV1;
  sourceRevision: string;
  evidenceRefs: readonly string[];
}

/**
 * Resolves every ordinal through the sealed map and the columnar fabric, then gathers the six
 * projected channels. Shared by build and by verification so both use the same rules.
 */
function gatherCandidates(
  map: CandidateOrdinalMapV1,
  columnar: CandidateFeatureColumnarV1,
  candidateOrdinals: readonly number[],
  graphRevision: string,
): GatheredCandidate[] {
  if (columnar.ordinalMapChecksum !== map.ordinalMapChecksum) throw new Error('ORDINAL_MAP_CHECKSUM_STALE');
  if (columnar.workspaceRevision !== map.workspaceRevision) throw new Error('COLUMNAR_WORKSPACE_REVISION_MISMATCH');
  if (columnar.candidateSnapshotRevision !== map.candidateSnapshotRevision) throw new Error('COLUMNAR_SNAPSHOT_REVISION_MISMATCH');
  const rowByOrdinal = new Map<number, number>();
  columnar.candidateOrdinals.forEach((ordinal, row) => rowByOrdinal.set(ordinal, row));
  const width = columnar.featureCount;

  return candidateOrdinals.map((ordinal) => {
    const resolved = resolveParsedOrdinal(map, ordinal);
    if (resolved.graphRevision !== graphRevision) throw new Error(`CANDIDATE_GRAPH_REVISION_MISMATCH:${ordinal}`);
    const row = rowByOrdinal.get(ordinal);
    if (row === undefined) throw new Error(`CANDIDATE_NOT_IN_COLUMNAR:${ordinal}`);
    if (columnar.canonicalIds[row] !== resolved.canonicalId) throw new Error(`CANDIDATE_IDENTITY_MISMATCH:${ordinal}`);
    if (columnar.sourceRevisions[row] !== resolved.sourceRevision) throw new Error(`CANDIDATE_SOURCE_REVISION_MISMATCH:${ordinal}`);
    const values: number[] = [];
    const present: (0 | 1)[] = [];
    for (let channel = 0; channel < TILE_CHANNELS; channel += 1) {
      const cell = row * width + (TILE_CHANNEL_CANONICAL_INDEX[channel] as number);
      const presence = columnar.featurePresence[cell] as 0 | 1;
      // Absent features carry value 0 (columnar convention); normalise defensively.
      values.push(presence === 1 ? (columnar.featureValues[cell] as number) : 0);
      present.push(presence);
    }
    return { row: { candidateOrdinal: ordinal, values, present }, sourceRevision: resolved.sourceRevision, evidenceRefs: resolved.evidenceRefs };
  });
}

/**
 * Builds an AtlasRankInputV1 from ordered candidate ordinals. Candidate order is preserved exactly.
 */
export function buildAtlasRankInputV1(params: {
  queryDigest: string;
  graphRevision: string;
  ordinalMap: CandidateOrdinalMapV1;
  columnar: CandidateFeatureColumnarV1;
  candidateOrdinals: readonly number[];
  taxonomyRevision: string;
  featureSchemaRevision: string;
  evidenceRevision: string;
  evidenceRefs?: readonly string[];
}): AtlasRankInputV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(params.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  const count = params.candidateOrdinals.length;
  if (count < 1 || count > MAX_CANDIDATES_BATCH) throw new Error(`BATCH_SIZE_OUT_OF_BOUNDS:${count}`);

  const gathered = gatherCandidates(ordinalMap, params.columnar, params.candidateOrdinals, params.graphRevision);
  const tiles = packCandidateTiles(gathered.map((item) => item.row));
  const refs = params.evidenceRefs ?? [...new Set(gathered.flatMap((item) => [...item.evidenceRefs]))];

  return {
    schema: ATLAS_RANK_INPUT_SCHEMA,
    queryDigest: params.queryDigest,
    workspaceRevision: ordinalMap.workspaceRevision,
    graphRevision: params.graphRevision,
    ordinalMapRevision: ordinalMap.ordinalMapChecksum,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    taxonomyRevision: params.taxonomyRevision,
    featureSchemaRevision: params.featureSchemaRevision,
    featureRevision: params.columnar.featureRevision,
    evidenceRevision: params.evidenceRevision,
    columnarChecksum: params.columnar.columnarChecksum,
    sourceRevisions: gathered.map((item) => item.sourceRevision),
    tiles,
    evidenceRefs: [...refs],
  };
}

/**
 * Validates a rank input before any scorer runs. Returns the first failure as a stable code.
 */
export function validateAtlasRankInputV1(
  input: AtlasRankInputV1,
  options: ValidateRankInputOptions,
): { valid: boolean; error?: string } {
  try {
    if (input.schema !== ATLAS_RANK_INPUT_SCHEMA) return { valid: false, error: `INVALID_SCHEMA:${String(input.schema)}` };
    if (input.tiles?.schema !== CANDIDATE_TILE_4X6_SCHEMA) return { valid: false, error: 'INVALID_TILE_SCHEMA' };
    const map = candidateOrdinalMapV1Schema.parse(options.ordinalMap);
    assertCandidateOrdinalMapIntegrityV1(map);
    if (input.ordinalMapRevision !== map.ordinalMapChecksum) return { valid: false, error: 'ORDINAL_MAP_REVISION_MISMATCH' };
    if (input.workspaceRevision !== map.workspaceRevision) return { valid: false, error: 'ORDINAL_MAP_WORKSPACE_REVISION_MISMATCH' };
    if (input.candidateSnapshotRevision !== map.candidateSnapshotRevision) return { valid: false, error: 'CANDIDATE_SNAPSHOT_REVISION_MISMATCH' };

    assertCandidateTilesWellFormed(input.tiles);
    const ordinals = input.tiles.candidateOrdinals;
    if (new Set(ordinals).size !== ordinals.length) return { valid: false, error: 'DUPLICATE_CANDIDATE_ORDINAL' };
    if (input.sourceRevisions.length !== ordinals.length) return { valid: false, error: 'SOURCE_REVISION_COUNT_MISMATCH' };

    for (const [index, ordinal] of ordinals.entries()) {
      const candidate = resolveParsedOrdinal(map, ordinal);
      if (candidate.graphRevision !== input.graphRevision) return { valid: false, error: `CANDIDATE_GRAPH_REVISION_MISMATCH:${ordinal}` };
      if (candidate.sourceRevision !== input.sourceRevisions[index]) return { valid: false, error: `CANDIDATE_SOURCE_REVISION_MISMATCH:${ordinal}` };
    }

    for (const field of ['queryDigest', 'workspaceRevision', 'graphRevision', 'ordinalMapRevision', 'taxonomyRevision', 'featureSchemaRevision', 'featureRevision', 'evidenceRevision', 'columnarChecksum'] as const) {
      if (!String(input[field] ?? '').trim()) return { valid: false, error: `MISSING_${field.toUpperCase()}` };
    }
    for (const [field, expected, actual] of [
      ['WORKSPACE', options.expectedWorkspaceRevision, input.workspaceRevision],
      ['GRAPH', options.expectedGraphRevision, input.graphRevision],
      ['ORDINAL_MAP', options.expectedOrdinalMapRevision, input.ordinalMapRevision],
      ['TAXONOMY', options.expectedTaxonomyRevision, input.taxonomyRevision],
      ['FEATURE_SCHEMA', options.expectedFeatureSchemaRevision, input.featureSchemaRevision],
      ['EVIDENCE', options.expectedEvidenceRevision, input.evidenceRevision],
    ] as const) {
      if (expected !== actual) return { valid: false, error: `${field}_REVISION_MISMATCH` };
    }

    if (input.evidenceRefs.length === 0 || input.evidenceRefs.some((ref) => !ref.trim())) {
      return { valid: false, error: 'EVIDENCE_REFERENCES_REQUIRED' };
    }
    const resolvedEvidence = new Set(ordinals.flatMap((ordinal) => resolveParsedOrdinal(map, ordinal).evidenceRefs));
    if (input.evidenceRefs.some((ref) => !resolvedEvidence.has(ref))) return { valid: false, error: 'EVIDENCE_REFERENCE_NOT_IN_SEALED_MAP' };
    return { valid: true };
  } catch (error) {
    return { valid: false, error: `RANK_INPUT_REJECTED:${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Scores a validated rank input through the EXISTING features/ CPU reference GEMM, cross-checks the
 * tile tensor against that GEMM, takes a stable Top-K over real candidates only, and returns a derived
 * advisory receipt. The caller supplies the head; this module owns no weights.
 */
export function scoreAtlasRankInputWithFeaturesGemm(params: {
  input: AtlasRankInputV1;
  options: ValidateRankInputOptions;
  columnar: CandidateFeatureColumnarV1;
  head: z.input<typeof candidateFeatureHeadV1Schema>;
  producerRevision: string;
  topK?: number;
}): AtlasRankScoringReceiptV1 {
  const { input, options, columnar } = params;
  const topK = params.topK ?? 10;
  if (!Number.isInteger(topK) || topK < 0) throw new Error('TOP_K_INVALID');

  const verdict = validateAtlasRankInputV1(input, options);
  if (!verdict.valid) throw new Error(`CANNOT_SCORE_INVALID_RANK_INPUT:${verdict.error}`);
  if (columnar.columnarChecksum !== input.columnarChecksum) throw new Error('COLUMNAR_CHECKSUM_STALE');
  if (columnar.featureRevision !== input.featureRevision) throw new Error('COLUMNAR_FEATURE_REVISION_MISMATCH');

  // The tiles must be exactly what the sealed map + columnar produce for these ordinals.
  const map = candidateOrdinalMapV1Schema.parse(options.ordinalMap);
  const regathered = packCandidateTiles(
    gatherCandidates(map, columnar, input.tiles.candidateOrdinals, input.graphRevision).map((item) => item.row),
  );
  if (candidateTileDigestV1(regathered) !== candidateTileDigestV1(input.tiles)) throw new Error('TILE_DOES_NOT_MATCH_COLUMNAR');

  const head = candidateFeatureHeadV1Schema.parse(params.head);
  if (head.headCount !== 1) throw new Error('TILE_HEAD_COUNT_MUST_BE_1');
  const weights = head.weights[0] as number[];
  const projected = new Set<number>(TILE_CHANNEL_CANONICAL_INDEX);
  weights.forEach((weight, index) => {
    if (!projected.has(index) && weight !== 0) {
      throw new Error(`TILE_HEAD_USES_UNPROJECTED_FEATURE:${CANDIDATE_SCALAR_FEATURES[index]}`);
    }
  });

  const gemm = scoreCandidateFeatureHeadsCpu({ columnar, head, producerRevision: params.producerRevision });
  const gemmRowByOrdinal = new Map<number, number>();
  gemm.candidateOrdinals.forEach((ordinal, row) => gemmRowByOrdinal.set(ordinal, row));

  const ordinals = input.tiles.candidateOrdinals;
  const bias = head.bias[0] as number;
  const scores: number[] = [];
  ordinals.forEach((ordinal, index) => {
    const gemmScore = (gemm.scores[gemmRowByOrdinal.get(ordinal) as number] as number[])[0] as number;
    const tile = Math.floor(index / TILE_ROWS);
    const row = index % TILE_ROWS;
    let tileScore = bias;
    for (let channel = 0; channel < TILE_CHANNELS; channel += 1) {
      tileScore += (input.tiles.features[tileCellOffset(tile, row, channel)] as number) * (weights[TILE_CHANNEL_CANONICAL_INDEX[channel] as number] as number);
    }
    if (!Number.isFinite(gemmScore)) throw new Error(`GEMM_SCORE_NONFINITE:${ordinal}`);
    if (Math.abs(tileScore - gemmScore) > TILE_GEMM_PARITY_TOLERANCE * Math.max(1, Math.abs(gemmScore))) {
      throw new Error(`GEMM_TILE_PARITY_MISMATCH:${ordinal}`);
    }
    scores.push(gemmScore);
  });

  // Top-K iterates real candidates only, so padded rows can never be selected.
  const ranked = ordinals.map((ordinal, index) => ({ ordinal, score: scores[index] as number }));
  ranked.sort((left, right) => right.score - left.score || left.ordinal - right.ordinal);
  const topKOrdinals = ranked.slice(0, Math.min(ordinals.length, topK)).map(({ ordinal }) => ordinal);

  const candidateOrderDigest = candidateOrderDigestV1(input.ordinalMapRevision, ordinals);
  const tileDigest = candidateTileDigestV1(input.tiles);
  const outputChecksum = sha256Hex(JSON.stringify({
    queryDigest: input.queryDigest, candidateOrderDigest, tileDigest, columnarChecksum: input.columnarChecksum,
    headId: head.headId, gemmInputChecksum: gemm.inputChecksum, gemmScoreChecksum: gemm.scoreChecksum,
    scores, topKOrdinals, workspaceRevision: input.workspaceRevision, graphRevision: input.graphRevision,
    taxonomyRevision: input.taxonomyRevision, featureSchemaRevision: input.featureSchemaRevision,
    featureRevision: input.featureRevision, evidenceRevision: input.evidenceRevision,
    sourceRevisions: input.sourceRevisions,
  }));

  return {
    schema: ATLAS_RANK_SCORING_RECEIPT_SCHEMA,
    queryDigest: input.queryDigest,
    batchSize: ordinals.length,
    tileCount: input.tiles.tileCount,
    candidateOrdinals: [...ordinals],
    ordinalMapRevision: input.ordinalMapRevision,
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    workspaceRevision: input.workspaceRevision,
    graphRevision: input.graphRevision,
    taxonomyRevision: input.taxonomyRevision,
    featureSchemaRevision: input.featureSchemaRevision,
    featureRevision: input.featureRevision,
    evidenceRevision: input.evidenceRevision,
    sourceRevisions: [...input.sourceRevisions],
    candidateOrderDigest,
    tileDigest,
    columnarChecksum: input.columnarChecksum,
    headId: head.headId,
    gemmInputChecksum: gemm.inputChecksum,
    gemmScoreChecksum: gemm.scoreChecksum,
    scores,
    topKOrdinals,
    outputChecksum,
    gpuExecuted: false,
    canonicalAuthority: false,
    writesPerformed: false,
  };
}
