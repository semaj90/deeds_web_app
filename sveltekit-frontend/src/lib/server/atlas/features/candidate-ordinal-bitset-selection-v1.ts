import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from './canonical-candidate-v1.js';
import {
  fromPostgresBytea,
  getSetBits,
  setBit,
  createAlignedBitsetBlob,
  toPostgresBytea,
} from '../tensors/aligned-bitset-blob-v1.js';
import {
  candidateFeatureSnapshotV1Schema,
  selectCandidateFeatureRows,
  type CandidateFeatureSnapshotV1,
} from './candidate-feature-snapshot-v1.js';
import type { CandidateFeatureRowV1 } from './candidate-feature-row-v1.js';

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const candidateOrdinalBitsetSelectionV1Schema = z.object({
  schema: z.literal('atlas.candidate-ordinal-bitset-selection.v1'),
  candidateSnapshotRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  ordinalMapChecksum: sha256,
  bitCount: z.number().int().nonnegative(),
  selectedCount: z.number().int().nonnegative(),
  byteLength: z.number().int().positive(),
  byteaSha256: sha256,
}).strict();

export type CandidateOrdinalBitsetSelectionV1 = z.infer<typeof candidateOrdinalBitsetSelectionV1Schema>;

export interface CandidateOrdinalBitsetSelectionArtifactV1 {
  readonly manifest: CandidateOrdinalBitsetSelectionV1;
  readonly bytea: Buffer;
}

export interface CompiledCandidateOrdinalBitsetGateV1 {
  readonly candidateSnapshotRevision: string;
  readonly workspaceRevision: string;
  readonly ordinalMapChecksum: string;
  readonly eligibleCount: number;
  filterTileOrdinals(tileOrdinals: readonly number[], expectedTileCount: number): number[];
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertMap(mapInput: unknown): CandidateOrdinalMapV1 {
  const map = candidateOrdinalMapV1Schema.parse(mapInput);
  assertCandidateOrdinalMapIntegrityV1(map);
  return map;
}

export function buildCandidateOrdinalBitsetSelectionV1(input: {
  ordinalMap: unknown;
  selectedOrdinals: readonly number[];
}): CandidateOrdinalBitsetSelectionArtifactV1 {
  const ordinalMap = assertMap(input.ordinalMap);
  const seen = new Set<number>();
  for (const ordinal of input.selectedOrdinals) {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= ordinalMap.rowCount) {
      throw new Error(`ORDINAL_BITSET_SELECTION_OUT_OF_RANGE:${ordinal}`);
    }
    if (seen.has(ordinal)) throw new Error(`ORDINAL_BITSET_SELECTION_DUPLICATE:${ordinal}`);
    seen.add(ordinal);
  }

  const blob = createAlignedBitsetBlob(ordinalMap.rowCount);
  for (const ordinal of seen) setBit(blob, ordinal);
  const bytea = toPostgresBytea(blob);
  const manifest = candidateOrdinalBitsetSelectionV1Schema.parse({
    schema: 'atlas.candidate-ordinal-bitset-selection.v1',
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    workspaceRevision: ordinalMap.workspaceRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    bitCount: blob.bitCount,
    selectedCount: seen.size,
    byteLength: bytea.byteLength,
    byteaSha256: sha256Bytes(bytea),
  });
  return { manifest, bytea };
}

export function selectCandidateFeatureRowsWithOrdinalBitsetV1(input: {
  ordinalMap: unknown;
  featureSnapshot: unknown;
  selection: CandidateOrdinalBitsetSelectionArtifactV1;
}): CandidateFeatureRowV1[] {
  const ordinalMap = assertMap(input.ordinalMap);
  const snapshot: CandidateFeatureSnapshotV1 = candidateFeatureSnapshotV1Schema.parse(input.featureSnapshot);
  const manifest = candidateOrdinalBitsetSelectionV1Schema.parse(input.selection.manifest);

  if (manifest.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision
    || manifest.workspaceRevision !== ordinalMap.workspaceRevision
    || manifest.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum
    || manifest.bitCount !== ordinalMap.rowCount) {
    throw new Error('ORDINAL_BITSET_SELECTION_MAP_MISMATCH');
  }
  if (snapshot.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision
    || snapshot.workspaceRevision !== ordinalMap.workspaceRevision
    || snapshot.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum
    || snapshot.rowCount !== ordinalMap.rowCount) {
    throw new Error('ORDINAL_BITSET_SELECTION_FEATURE_SNAPSHOT_MISMATCH');
  }

  const bytea = input.selection.bytea;
  assertSelectionBytes(bytea, manifest);
  const blob = fromPostgresBytea(bytea);
  if (blob.bitCount !== ordinalMap.rowCount) throw new Error('ORDINAL_BITSET_SELECTION_BIT_COUNT_MISMATCH');
  const selectedOrdinals = getSetBits(blob);
  if (selectedOrdinals.length !== manifest.selectedCount) {
    throw new Error('ORDINAL_BITSET_SELECTION_COUNT_MISMATCH');
  }

  return selectCandidateFeatureRows(snapshot, selectedOrdinals);
}

/**
 * Compile and validate an ordinal mask once, then filter candidate ordinals
 * before vector gather/scoring and tile-local KNN Top-K. This is an executor
 * adapter only; callers must use the same parent ordinal-map snapshot.
 */
export function compileCandidateOrdinalBitsetGateV1(input: {
  ordinalMap: unknown;
  selection: CandidateOrdinalBitsetSelectionArtifactV1;
}): CompiledCandidateOrdinalBitsetGateV1 {
  const ordinalMap = assertMap(input.ordinalMap);
  const manifest = candidateOrdinalBitsetSelectionV1Schema.parse(input.selection.manifest);
  if (manifest.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision
    || manifest.workspaceRevision !== ordinalMap.workspaceRevision
    || manifest.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum
    || manifest.bitCount !== ordinalMap.rowCount) {
    throw new Error('ORDINAL_BITSET_SELECTION_MAP_MISMATCH');
  }
  const bytea = input.selection.bytea;
  assertSelectionBytes(bytea, manifest);
  const blob = fromPostgresBytea(bytea);
  if (blob.bitCount !== ordinalMap.rowCount) throw new Error('ORDINAL_BITSET_SELECTION_BIT_COUNT_MISMATCH');
  const eligible = new Set(getSetBits(blob));
  if (eligible.size !== manifest.selectedCount) throw new Error('ORDINAL_BITSET_SELECTION_COUNT_MISMATCH');

  return {
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    workspaceRevision: ordinalMap.workspaceRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    eligibleCount: eligible.size,
    filterTileOrdinals(tileOrdinals, expectedTileCount) {
      if (!Number.isInteger(expectedTileCount) || expectedTileCount < 0 || tileOrdinals.length !== expectedTileCount) {
        throw new Error('ORDINAL_BITSET_KNN_TILE_INCOMPLETE');
      }
      const seen = new Set<number>();
      return tileOrdinals.filter((ordinal) => {
        if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= ordinalMap.rowCount) {
          throw new Error(`ORDINAL_BITSET_KNN_ORDINAL_OUT_OF_RANGE:${ordinal}`);
        }
        if (seen.has(ordinal)) throw new Error(`ORDINAL_BITSET_KNN_DUPLICATE_ORDINAL:${ordinal}`);
        seen.add(ordinal);
        return eligible.has(ordinal);
      });
    },
  };
}

function assertSelectionBytes(bytea: Uint8Array, manifest: CandidateOrdinalBitsetSelectionV1): void {
  if (bytea.byteLength !== manifest.byteLength) throw new Error('ORDINAL_BITSET_SELECTION_LENGTH_MISMATCH');
  if (sha256Bytes(bytea) !== manifest.byteaSha256) throw new Error('ORDINAL_BITSET_SELECTION_SHA256_MISMATCH');
}
