import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
  materializeSampleQueryMatrixV1,
  type SampleQueryMatrixV1,
} from './sample-query-matrix-v1.js';

export const SEMANTIC_SAMPLE_QUERY_ADAPTER_SCHEMA = 'atlas.semantic-sample-query-adapter.v1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const semanticSamplingSourceRowV1Schema = z.object({
  packetKey: z.string().min(1),
  values: z.array(z.number().finite()).min(1),
  semanticRevision: z.string().min(1).nullable().optional(),
}).strict();
export type SemanticSamplingSourceRowV1 = z.infer<typeof semanticSamplingSourceRowV1Schema>;

export const semanticSampleQueryAdapterReceiptV1Schema = z.object({
  schema: z.literal(SEMANTIC_SAMPLE_QUERY_ADAPTER_SCHEMA),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: sha256,
  sourceMatrixRevision: z.string().min(1),
  sourceMatrixChecksum: sha256,
  representationId: z.literal('semantic_768'),
  dimension: z.number().int().positive(),
  inputRowCount: z.number().int().positive(),
  outputRowCount: z.number().int().positive(),
  joinKey: z.literal('packetKey'),
  joinCoverage: z.literal(1),
  l2NormalizationApplied: z.literal(true),
  minimumInputNorm: z.number().finite().positive(),
  maximumInputNorm: z.number().finite().positive(),
  minimumOutputNorm: z.number().finite().positive(),
  maximumOutputNorm: z.number().finite().positive(),
  matrixChecksum: sha256,
  adapterChecksum: sha256,
  identityAuthority: z.literal(false),
  retrievalVoteProduced: z.literal(false),
  canonicalWritesAttempted: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type SemanticSampleQueryAdapterReceiptV1 = z.infer<typeof semanticSampleQueryAdapterReceiptV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    .join(',')}}`;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function norm(values: readonly number[]): number {
  let squared = 0;
  for (const value of values) squared += value * value;
  return Math.sqrt(squared);
}

function l2Normalize(values: readonly number[], eps: number): { values: number[]; inputNorm: number; outputNorm: number } {
  const inputNorm = norm(values);
  if (!Number.isFinite(inputNorm) || inputNorm <= eps) {
    throw new Error(`SEMANTIC_SAMPLE_ZERO_OR_INVALID_NORM:${inputNorm}`);
  }
  const divisor = Math.max(inputNorm, eps);
  const normalized = values.map((value) => value / divisor);
  return { values: normalized, inputNorm, outputNorm: norm(normalized) };
}

function assertOrdinalMapHasStrongPacketKeys(map: CandidateOrdinalMapV1): Map<string, number> {
  const packetToOrdinal = new Map<string, number>();
  for (const candidate of map.candidates) {
    if (!candidate.packetKey) throw new Error(`SEMANTIC_SAMPLE_PACKET_KEY_REQUIRED:${candidate.candidateOrdinal}`);
    if (packetToOrdinal.has(candidate.packetKey)) throw new Error(`SEMANTIC_SAMPLE_DUPLICATE_MAP_PACKET_KEY:${candidate.packetKey}`);
    packetToOrdinal.set(candidate.packetKey, candidate.candidateOrdinal);
  }
  return packetToOrdinal;
}

/**
 * Bind a frozen semantic artifact to CandidateOrdinal by packetKey and only
 * then create a row-L2-normalized sampling matrix. Source artifact row order is
 * ignored; row-number coincidence can never establish identity.
 */
export function adaptSemanticRowsToSampleQueryMatrixV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  sourceRows: readonly z.input<typeof semanticSamplingSourceRowV1Schema>[];
  sourceMatrixRevision: string;
  sourceMatrixChecksum: string;
  expectedDimension?: number;
  eps?: number;
  producerRevision: string;
}): { matrix: SampleQueryMatrixV1; receipt: SemanticSampleQueryAdapterReceiptV1 } {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const sourceRows = input.sourceRows.map((row) => semanticSamplingSourceRowV1Schema.parse(row));
  const expectedDimension = input.expectedDimension ?? 768;
  const eps = input.eps ?? 1e-12;
  if (!/^[a-f0-9]{64}$/.test(input.sourceMatrixChecksum)) throw new Error('SEMANTIC_SAMPLE_SOURCE_MATRIX_CHECKSUM_INVALID');
  if (!Number.isInteger(expectedDimension) || expectedDimension <= 0) throw new Error('SEMANTIC_SAMPLE_DIMENSION_INVALID');
  if (!Number.isFinite(eps) || eps <= 0) throw new Error('SEMANTIC_SAMPLE_EPS_INVALID');
  if (sourceRows.length !== ordinalMap.rowCount) {
    throw new Error(`SEMANTIC_SAMPLE_ROW_COUNT_MISMATCH:${sourceRows.length}:${ordinalMap.rowCount}`);
  }

  const packetToOrdinal = assertOrdinalMapHasStrongPacketKeys(ordinalMap);
  const sourceByPacket = new Map<string, SemanticSamplingSourceRowV1>();
  for (const row of sourceRows) {
    if (sourceByPacket.has(row.packetKey)) throw new Error(`SEMANTIC_SAMPLE_DUPLICATE_SOURCE_PACKET_KEY:${row.packetKey}`);
    if (!packetToOrdinal.has(row.packetKey)) throw new Error(`SEMANTIC_SAMPLE_SOURCE_PACKET_NOT_IN_ORDINAL_MAP:${row.packetKey}`);
    if (row.values.length !== expectedDimension) {
      throw new Error(`SEMANTIC_SAMPLE_DIMENSION_MISMATCH:${row.packetKey}:${row.values.length}:${expectedDimension}`);
    }
    sourceByPacket.set(row.packetKey, row);
  }

  const inputNorms: number[] = [];
  const outputNorms: number[] = [];
  const matrixRows = ordinalMap.candidates.map((candidate) => {
    const packetKey = candidate.packetKey!;
    const source = sourceByPacket.get(packetKey);
    if (!source) throw new Error(`SEMANTIC_SAMPLE_ORDINAL_PACKET_MISSING:${candidate.candidateOrdinal}:${packetKey}`);
    if (source.semanticRevision !== undefined && source.semanticRevision !== null && candidate.semanticRevision !== source.semanticRevision) {
      throw new Error(`SEMANTIC_SAMPLE_REVISION_MISMATCH:${candidate.candidateOrdinal}:${packetKey}`);
    }
    const normalized = l2Normalize(source.values, eps);
    inputNorms.push(normalized.inputNorm);
    outputNorms.push(normalized.outputNorm);
    return { candidateOrdinal: candidate.candidateOrdinal, values: normalized.values };
  });

  const matrix = materializeSampleQueryMatrixV1({
    ordinalMap,
    rows: matrixRows,
    sourceMatrixRevision: input.sourceMatrixRevision,
    sourceMatrixChecksum: input.sourceMatrixChecksum,
    matrixRole: 'SEMANTIC_RESIDUAL',
    normalization: 'ROW_L2',
    producerRevision: input.producerRevision,
  });

  const payload = {
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    sourceMatrixRevision: input.sourceMatrixRevision,
    sourceMatrixChecksum: input.sourceMatrixChecksum,
    representationId: 'semantic_768' as const,
    dimension: expectedDimension,
    inputRowCount: sourceRows.length,
    outputRowCount: matrix.rowCount,
    joinKey: 'packetKey' as const,
    joinCoverage: 1 as const,
    l2NormalizationApplied: true as const,
    minimumInputNorm: Math.min(...inputNorms),
    maximumInputNorm: Math.max(...inputNorms),
    minimumOutputNorm: Math.min(...outputNorms),
    maximumOutputNorm: Math.max(...outputNorms),
    matrixChecksum: matrix.matrixChecksum,
  };

  return {
    matrix,
    receipt: semanticSampleQueryAdapterReceiptV1Schema.parse({
      schema: SEMANTIC_SAMPLE_QUERY_ADAPTER_SCHEMA,
      ...payload,
      adapterChecksum: checksum(payload),
      identityAuthority: false,
      retrievalVoteProduced: false,
      canonicalWritesAttempted: false,
      producerRevision: input.producerRevision,
    }),
  };
}
