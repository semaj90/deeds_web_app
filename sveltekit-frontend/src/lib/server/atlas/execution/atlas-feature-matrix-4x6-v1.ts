import {
  CANDIDATE_SCALAR_FEATURES,
  type CandidateScalarFeatureName,
} from '../features/candidate-feature-columnar-v1.js';

/**
 * DECISION 4X6-TILE-01 (operator, 2026-10-18): one tile is 4 CANDIDATES x 6 features.
 * Each tile row is a distinct candidate identity, never an investigation state of one candidate.
 *
 * 4X6-WIDTH-01: the six channels are a declared PROJECTION of the canonical 12 scalar features in
 * features/candidate-feature-columnar-v1.ts. They are listed in the same relative order as
 * CANDIDATE_SCALAR_FEATURES so a head with zero weights outside the projection scores identically
 * through the existing features/ CPU reference GEMM. This module is layout only: it owns no weights
 * and no scoring.
 */
export const CANDIDATE_TILE_4X6_SCHEMA = 'atlas.candidate-tile-4x6.v1' as const;

export const TILE_ROWS = 4 as const;
export const TILE_CHANNELS = 6 as const;
export const FLOATS_PER_TILE = TILE_ROWS * TILE_CHANNELS; // 24
export const MAX_CANDIDATES_BATCH = 4096 as const;
export const MAX_TILES = MAX_CANDIDATES_BATCH / TILE_ROWS; // 1024

export const TILE_CHANNEL_FEATURES = Object.freeze([
  'semanticRelevance',
  'lexicalRelevance',
  'astAffinity',
  'personalizedPageRank',
  'domainAffinity',
  'executionUtility',
] as const satisfies readonly CandidateScalarFeatureName[]);

/** Index of each tile channel inside the canonical 12-wide feature vector. */
export const TILE_CHANNEL_CANONICAL_INDEX: readonly number[] = Object.freeze(
  TILE_CHANNEL_FEATURES.map((name) => CANDIDATE_SCALAR_FEATURES.indexOf(name)),
);

for (let channel = 0; channel < TILE_CHANNELS; channel += 1) {
  const index = TILE_CHANNEL_CANONICAL_INDEX[channel] as number;
  if (index < 0) throw new Error(`TILE_CHANNEL_NOT_CANONICAL:${TILE_CHANNEL_FEATURES[channel]}`);
  if (channel > 0 && index <= (TILE_CHANNEL_CANONICAL_INDEX[channel - 1] as number)) {
    throw new Error('TILE_CHANNEL_ORDER_MUST_FOLLOW_CANONICAL_ORDER');
  }
}

export interface CandidateTileRowInputV1 {
  candidateOrdinal: number;
  /** Six values in TILE_CHANNEL_FEATURES order; an absent channel carries value 0 and present 0. */
  values: readonly number[];
  present: readonly (0 | 1)[];
}

export interface CandidateTilesV1 {
  schema: typeof CANDIDATE_TILE_4X6_SCHEMA;
  candidateCount: number;
  tileCount: number;
  /** Real candidates in caller order. Padded rows are never listed here. */
  candidateOrdinals: number[];
  /** [tileCount, 4, 6] row-major. */
  features: Float32Array;
  /** [tileCount, 4, 6]; 0 for absent features and for every cell of a padded row. */
  presentMask: Uint8Array;
  /** [tileCount, 4]; 1 for a real candidate row, 0 for padding. */
  validRows: Uint8Array;
}

export function tileCountForCandidates(candidateCount: number): number {
  return Math.ceil(candidateCount / TILE_ROWS);
}

/** Flat offset of (tile, row, channel) inside a [tileCount,4,6] buffer. */
export function tileCellOffset(tile: number, row: number, channel: number): number {
  return tile * FLOATS_PER_TILE + row * TILE_CHANNELS + channel;
}

/**
 * Packs ordered candidate rows into contiguous [tileCount,4,6] tiles. Candidate order is preserved:
 * candidate i lands in tile floor(i/4), row i%4. A final partial tile is padded with zero rows and a
 * zero valid-row bit; padded rows carry no ordinal and can never reach Top-K.
 */
export function packCandidateTiles(rows: readonly CandidateTileRowInputV1[]): CandidateTilesV1 {
  const candidateCount = rows.length;
  if (candidateCount < 1 || candidateCount > MAX_CANDIDATES_BATCH) {
    throw new Error(`TILE_BATCH_SIZE_OUT_OF_BOUNDS:${candidateCount}`);
  }
  const tileCount = tileCountForCandidates(candidateCount);
  const features = new Float32Array(tileCount * FLOATS_PER_TILE);
  const presentMask = new Uint8Array(tileCount * FLOATS_PER_TILE);
  const validRows = new Uint8Array(tileCount * TILE_ROWS);
  const candidateOrdinals: number[] = new Array(candidateCount);
  const seen = new Set<number>();

  rows.forEach((row, index) => {
    if (!Number.isInteger(row.candidateOrdinal) || row.candidateOrdinal < 0) {
      throw new Error(`TILE_ORDINAL_INVALID:${index}`);
    }
    if (seen.has(row.candidateOrdinal)) throw new Error(`TILE_ORDINAL_DUPLICATE:${row.candidateOrdinal}`);
    seen.add(row.candidateOrdinal);
    if (row.values.length !== TILE_CHANNELS || row.present.length !== TILE_CHANNELS) {
      throw new Error(`TILE_ROW_WIDTH_MISMATCH:${row.candidateOrdinal}`);
    }
    const tile = Math.floor(index / TILE_ROWS);
    const tileRow = index % TILE_ROWS;
    candidateOrdinals[index] = row.candidateOrdinal;
    validRows[tile * TILE_ROWS + tileRow] = 1;
    for (let channel = 0; channel < TILE_CHANNELS; channel += 1) {
      const value = row.values[channel] as number;
      const present = row.present[channel];
      if (!Number.isFinite(value)) throw new Error(`TILE_NONFINITE_FEATURE:${row.candidateOrdinal}:${channel}`);
      if (present !== 0 && present !== 1) throw new Error(`TILE_PRESENCE_NOT_BINARY:${row.candidateOrdinal}:${channel}`);
      if (present === 0 && value !== 0) throw new Error(`TILE_ABSENT_FEATURE_MUST_BE_ZERO:${row.candidateOrdinal}:${channel}`);
      const offset = tileCellOffset(tile, tileRow, channel);
      features[offset] = value;
      presentMask[offset] = present;
    }
  });

  return { schema: CANDIDATE_TILE_4X6_SCHEMA, candidateCount, tileCount, candidateOrdinals, features, presentMask, validRows };
}

/** Structural checks on an already-built tile set (lengths, binary masks, padding exclusion). */
export function assertCandidateTilesWellFormed(tiles: CandidateTilesV1): void {
  const { candidateCount, tileCount } = tiles;
  if (candidateCount < 1 || candidateCount > MAX_CANDIDATES_BATCH) throw new Error(`TILE_BATCH_SIZE_OUT_OF_BOUNDS:${candidateCount}`);
  if (tileCount !== tileCountForCandidates(candidateCount) || tileCount > MAX_TILES) throw new Error('TILE_COUNT_MISMATCH');
  if (tiles.candidateOrdinals.length !== candidateCount) throw new Error('TILE_ORDINAL_COUNT_MISMATCH');
  if (tiles.features.length !== tileCount * FLOATS_PER_TILE) throw new Error('TILE_FEATURES_LENGTH_MISMATCH');
  if (tiles.presentMask.length !== tileCount * FLOATS_PER_TILE) throw new Error('TILE_PRESENT_MASK_LENGTH_MISMATCH');
  if (tiles.validRows.length !== tileCount * TILE_ROWS) throw new Error('TILE_VALID_ROWS_LENGTH_MISMATCH');
  let validCount = 0;
  for (let row = 0; row < tiles.validRows.length; row += 1) {
    const valid = tiles.validRows[row];
    if (valid !== 0 && valid !== 1) throw new Error(`TILE_VALID_ROW_NOT_BINARY:${row}`);
    validCount += valid as number;
    // Valid rows must be exactly the first candidateCount rows (padding only at the end).
    if ((row < candidateCount ? 1 : 0) !== valid) throw new Error(`TILE_VALID_ROW_PADDING_MISPLACED:${row}`);
  }
  if (validCount !== candidateCount) throw new Error('TILE_VALID_ROW_COUNT_MISMATCH');
  for (let cell = 0; cell < tiles.features.length; cell += 1) {
    const value = tiles.features[cell] as number;
    if (!Number.isFinite(value)) throw new Error(`TILE_NONFINITE_FEATURE_CELL:${cell}`);
    const present = tiles.presentMask[cell];
    if (present !== 0 && present !== 1) throw new Error(`TILE_PRESENT_MASK_NOT_BINARY:${cell}`);
    const row = Math.floor(cell / TILE_CHANNELS);
    if (tiles.validRows[row] === 0 && (present !== 0 || value !== 0)) throw new Error(`TILE_PADDED_ROW_NOT_ZERO:${cell}`);
    if (present === 0 && value !== 0) throw new Error(`TILE_ABSENT_FEATURE_MUST_BE_ZERO_CELL:${cell}`);
  }
}
