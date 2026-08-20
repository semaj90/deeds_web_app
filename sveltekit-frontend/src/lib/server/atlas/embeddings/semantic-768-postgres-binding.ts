import { createHash } from 'node:crypto';
import type { NewAtlasPacket } from '../../db/schema/atlas-packets.js';

export const ATLAS_SEMANTIC_768_REPRESENTATION_ID = 'semantic_768' as const;
export const ATLAS_SEMANTIC_768_DIMENSION = 768 as const;
export const ATLAS_SEMANTIC_768_DEFAULT_ENCODER_REVISION = 'embeddinggemma-native-768-v1' as const;
export const ATLAS_SEMANTIC_768_NORMALIZATION_TOLERANCE = 0.01 as const;

export interface Semantic768LineageInputV1 {
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  sourceVersionReceiptId: string;
  workspaceRevision: number;
  representationRevision: number;
  encoderRevision: string;
  vector: readonly number[];
}

export type AtlasPacketSemantic768PatchV1 = Pick<
  NewAtlasPacket,
  | 'embedding'
  | 'sourceRevision'
  | 'sourceVersionReceiptId'
  | 'workspaceRevision'
  | 'representationRevision'
  | 'sourceRepresentationId'
  | 'sourceDimension'
  | 'encoderRevision'
  | 'embeddingDigest'
>;

export interface Semantic768AtlasPacketBindingV1 {
  schema: 'atlas.semantic-768-postgres-binding.v1';
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  sourceVersionReceiptId: string;
  workspaceRevision: number;
  representationRevision: number;
  representationId: typeof ATLAS_SEMANTIC_768_REPRESENTATION_ID;
  dimension: typeof ATLAS_SEMANTIC_768_DIMENSION;
  encoderRevision: string;
  l2Norm: number;
  embeddingDigest: string;
  patch: AtlasPacketSemantic768PatchV1;
  postgresTable: 'atlas_packets';
  postgresVectorColumn: 'embedding';
  qdrantWritesAllowed: false;
  valkeyWritesAllowed: false;
  canonicalWritesAllowed: false;
}

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`ATLAS_SEMANTIC_768_${label}_REQUIRED`);
  return trimmed;
}

function nonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`ATLAS_SEMANTIC_768_${label}_INVALID`);
  }
  return value;
}

function positiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`ATLAS_SEMANTIC_768_${label}_INVALID`);
  }
  return value;
}

export function semantic768L2Norm(vector: readonly number[]): number {
  let sum = 0;
  for (const value of vector) {
    if (!Number.isFinite(value)) throw new Error('ATLAS_SEMANTIC_768_NONFINITE_VECTOR');
    sum += value * value;
  }
  return Math.sqrt(sum);
}

/**
 * pgvector's vector type stores single-precision values. Hash the Float32 bytes
 * so the digest binds the representation actually persisted in PostgreSQL,
 * rather than JavaScript's wider Number representation.
 */
export function semantic768Float32Digest(vector: readonly number[]): string {
  if (vector.length !== ATLAS_SEMANTIC_768_DIMENSION) {
    throw new Error(`ATLAS_SEMANTIC_768_DIMENSION_MISMATCH:${vector.length}`);
  }
  const bytes = Buffer.allocUnsafe(vector.length * 4);
  for (let index = 0; index < vector.length; index += 1) {
    const value = vector[index];
    if (!Number.isFinite(value)) throw new Error(`ATLAS_SEMANTIC_768_NONFINITE_VECTOR:${index}`);
    bytes.writeFloatLE(value, index * 4);
  }
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertSemantic768Lineage(input: Semantic768LineageInputV1): void {
  nonEmpty(input.packetKey, 'PACKET_KEY');
  nonEmpty(input.sourceRef, 'SOURCE_REF');
  nonEmpty(input.sourceRevision, 'SOURCE_REVISION');
  nonEmpty(input.sourceVersionReceiptId, 'SOURCE_VERSION_RECEIPT_ID');
  nonEmpty(input.encoderRevision, 'ENCODER_REVISION');
  nonNegativeInteger(input.workspaceRevision, 'WORKSPACE_REVISION');
  positiveInteger(input.representationRevision, 'REPRESENTATION_REVISION');

  if (input.vector.length !== ATLAS_SEMANTIC_768_DIMENSION) {
    throw new Error(`ATLAS_SEMANTIC_768_DIMENSION_MISMATCH:${input.vector.length}`);
  }
  const norm = semantic768L2Norm(input.vector);
  if (Math.abs(norm - 1) > ATLAS_SEMANTIC_768_NORMALIZATION_TOLERANCE) {
    throw new Error(`ATLAS_SEMANTIC_768_NOT_NORMALIZED:${norm}`);
  }
}

export function compileSemantic768AtlasPacketBinding(
  input: Semantic768LineageInputV1,
): Semantic768AtlasPacketBindingV1 {
  assertSemantic768Lineage(input);
  const vector = Array.from(input.vector, (value) => Math.fround(value));
  const l2Norm = semantic768L2Norm(vector);
  const embeddingDigest = semantic768Float32Digest(vector);

  return {
    schema: 'atlas.semantic-768-postgres-binding.v1',
    packetKey: input.packetKey.trim(),
    sourceRef: input.sourceRef.trim(),
    sourceRevision: input.sourceRevision.trim(),
    sourceVersionReceiptId: input.sourceVersionReceiptId.trim(),
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    representationId: ATLAS_SEMANTIC_768_REPRESENTATION_ID,
    dimension: ATLAS_SEMANTIC_768_DIMENSION,
    encoderRevision: input.encoderRevision.trim(),
    l2Norm,
    embeddingDigest,
    patch: {
      embedding: vector,
      sourceRevision: input.sourceRevision.trim(),
      sourceVersionReceiptId: input.sourceVersionReceiptId.trim(),
      workspaceRevision: input.workspaceRevision,
      representationRevision: input.representationRevision,
      sourceRepresentationId: ATLAS_SEMANTIC_768_REPRESENTATION_ID,
      sourceDimension: ATLAS_SEMANTIC_768_DIMENSION,
      encoderRevision: input.encoderRevision.trim(),
      embeddingDigest,
    },
    postgresTable: 'atlas_packets',
    postgresVectorColumn: 'embedding',
    qdrantWritesAllowed: false,
    valkeyWritesAllowed: false,
    canonicalWritesAllowed: false,
  };
}
