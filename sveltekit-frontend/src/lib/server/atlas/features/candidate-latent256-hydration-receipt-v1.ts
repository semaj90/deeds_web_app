import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from './canonical-candidate-v1.js';

export const CANDIDATE_LATENT256_HYDRATION_RECEIPT_SCHEMA =
  'atlas.candidate-latent256-hydration-receipt.v1' as const;

export const LATENT256_REPRESENTATION_ID = 'latent_256' as const;
export const LATENT256_DIMENSIONS = 256 as const;

export const candidateLatent256HydrationStatusV1Schema = z.enum([
  'AVAILABLE',
  'MISSING',
  'IDENTITY_UNRESOLVED',
  'REVISION_MISMATCH',
  'INVALID_SHAPE',
]);
export type CandidateLatent256HydrationStatusV1 = z.infer<
  typeof candidateLatent256HydrationStatusV1Schema
>;

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.string().min(1);
const nullableId = z.string().min(1).nullable();

export const candidateLatent256HydrationRowV1Schema = z.object({
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  packetKey: nullableId,
  sourceRef: nullableId,
  codebaseChunkId: nullableId,
  representationId: z.literal(LATENT256_REPRESENTATION_ID),
  representationRevision: revision,
  checkpointRevision: revision,
  observedCheckpointRevision: revision.nullable(),
  representationAvailable: z.boolean(),
  status: candidateLatent256HydrationStatusV1Schema,
  vectorChecksum: checksum.nullable(),
}).strict().superRefine((row, ctx) => {
  const shouldBeAvailable = row.status === 'AVAILABLE';
  if (row.representationAvailable !== shouldBeAvailable) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['representationAvailable'],
      message: 'LATENT256_AVAILABILITY_STATUS_MISMATCH',
    });
  }
  if (shouldBeAvailable && row.codebaseChunkId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['codebaseChunkId'],
      message: 'LATENT256_AVAILABLE_REQUIRES_CODEBASE_CHUNK_ID',
    });
  }
  if (shouldBeAvailable && row.vectorChecksum === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['vectorChecksum'],
      message: 'LATENT256_AVAILABLE_REQUIRES_VECTOR_CHECKSUM',
    });
  }
  if (!shouldBeAvailable && row.vectorChecksum !== null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['vectorChecksum'],
      message: 'LATENT256_UNAVAILABLE_MUST_NOT_EXPOSE_VECTOR_CHECKSUM',
    });
  }
});
export type CandidateLatent256HydrationRowV1 = z.infer<
  typeof candidateLatent256HydrationRowV1Schema
>;

export const candidateLatent256HydrationReceiptV1Schema = z.object({
  schema: z.literal(CANDIDATE_LATENT256_HYDRATION_RECEIPT_SCHEMA),
  candidateSnapshotRevision: revision,
  ordinalMapChecksum: checksum,
  workspaceRevision: revision,
  representationId: z.literal(LATENT256_REPRESENTATION_ID),
  representationRevision: revision,
  checkpointRevision: revision,
  rowCount: z.number().int().nonnegative(),
  availableCount: z.number().int().nonnegative(),
  missingCount: z.number().int().nonnegative(),
  identityUnresolvedCount: z.number().int().nonnegative(),
  revisionMismatchCount: z.number().int().nonnegative(),
  invalidShapeCount: z.number().int().nonnegative(),
  rows: z.array(candidateLatent256HydrationRowV1Schema),
  mappingChecksum: checksum,
  vectorsChecksum: checksum,
  receiptChecksum: checksum,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  producerRevision: revision,
}).strict().superRefine((receipt, ctx) => {
  if (receipt.rows.length !== receipt.rowCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rowCount'],
      message: 'LATENT256_RECEIPT_ROW_COUNT_MISMATCH',
    });
  }
  const counted = receipt.availableCount
    + receipt.missingCount
    + receipt.identityUnresolvedCount
    + receipt.revisionMismatchCount
    + receipt.invalidShapeCount;
  if (counted !== receipt.rowCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['rowCount'],
      message: 'LATENT256_RECEIPT_STATUS_COUNTS_MISMATCH',
    });
  }
});
export type CandidateLatent256HydrationReceiptV1 = z.infer<
  typeof candidateLatent256HydrationReceiptV1Schema
>;

export interface CandidateLatent256HydrationObservationV1 {
  candidateOrdinal: number;
  canonicalId: string;
  packetKey: string | null;
  sourceRef: string | null;
  /** Exact codebase_chunk_index.id from a revision-qualified storage join. */
  codebaseChunkId: string | null;
  /** True only when the storage producer proved one exact row for this candidate. */
  exactIdentityMapping: boolean;
  observedCheckpointRevision: string | null;
  vector: readonly number[] | null;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`;
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function f32leChecksum(vector: readonly number[]): string | null {
  if (vector.length !== LATENT256_DIMENSIONS) return null;
  const bytes = new Uint8Array(vector.length * 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < vector.length; index += 1) {
    const value = Number(vector[index]);
    if (!Number.isFinite(value)) return null;
    view.setFloat32(index * 4, Math.fround(value), true);
  }
  return sha256(bytes);
}

function assertObservationMatchesCandidate(
  map: CandidateOrdinalMapV1,
  observation: CandidateLatent256HydrationObservationV1,
): void {
  const candidate = map.candidates[observation.candidateOrdinal];
  if (!candidate || candidate.candidateOrdinal !== observation.candidateOrdinal) {
    throw new Error(`LATENT256_OBSERVATION_ORDINAL_NOT_IN_MAP:${observation.candidateOrdinal}`);
  }
  const checks: Array<[string, unknown, unknown]> = [
    ['canonicalId', observation.canonicalId, candidate.canonicalId],
    ['packetKey', observation.packetKey, candidate.packetKey],
    ['sourceRef', observation.sourceRef, candidate.sourceRef],
  ];
  for (const [field, actual, expected] of checks) {
    if (actual !== expected) {
      throw new Error(`LATENT256_OBSERVATION_IDENTITY_MISMATCH:${observation.candidateOrdinal}:${field}`);
    }
  }
}

function classifyObservation(input: {
  observation: CandidateLatent256HydrationObservationV1;
  checkpointRevision: string;
}): { status: CandidateLatent256HydrationStatusV1; vectorChecksum: string | null } {
  const { observation, checkpointRevision } = input;
  if (!observation.exactIdentityMapping || observation.codebaseChunkId === null) {
    return { status: 'IDENTITY_UNRESOLVED', vectorChecksum: null };
  }
  if (observation.vector === null) {
    return { status: 'MISSING', vectorChecksum: null };
  }
  if (observation.observedCheckpointRevision !== checkpointRevision) {
    return { status: 'REVISION_MISMATCH', vectorChecksum: null };
  }
  const vectorChecksum = f32leChecksum(observation.vector);
  if (vectorChecksum === null) {
    return { status: 'INVALID_SHAPE', vectorChecksum: null };
  }
  return { status: 'AVAILABLE', vectorChecksum };
}

/**
 * Builds a fail-closed, read-only hydration receipt over an already-proven
 * CandidateOrdinal map. It never guesses that packetKey, Qdrant point id, or
 * canonicalId equals codebase_chunk_index.id: the producer must supply an
 * explicit exactIdentityMapping + codebaseChunkId observation for each row.
 */
export function buildCandidateLatent256HydrationReceiptV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  representationRevision: string;
  checkpointRevision: string;
  observations: readonly CandidateLatent256HydrationObservationV1[];
  producerRevision: string;
}): CandidateLatent256HydrationReceiptV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  if (input.observations.length !== ordinalMap.rowCount) {
    throw new Error(
      `LATENT256_OBSERVATION_ROW_COUNT_MISMATCH:observations=${input.observations.length}:ordinals=${ordinalMap.rowCount}`,
    );
  }

  const byOrdinal = new Map<number, CandidateLatent256HydrationObservationV1>();
  for (const observation of input.observations) {
    if (byOrdinal.has(observation.candidateOrdinal)) {
      throw new Error(`LATENT256_OBSERVATION_DUPLICATE_ORDINAL:${observation.candidateOrdinal}`);
    }
    assertObservationMatchesCandidate(ordinalMap, observation);
    byOrdinal.set(observation.candidateOrdinal, observation);
  }

  const rows: CandidateLatent256HydrationRowV1[] = [];
  for (let ordinal = 0; ordinal < ordinalMap.rowCount; ordinal += 1) {
    const observation = byOrdinal.get(ordinal);
    if (!observation) throw new Error(`LATENT256_OBSERVATION_MISSING_ORDINAL:${ordinal}`);
    const classified = classifyObservation({
      observation,
      checkpointRevision: input.checkpointRevision,
    });
    rows.push(candidateLatent256HydrationRowV1Schema.parse({
      candidateOrdinal: ordinal,
      canonicalId: observation.canonicalId,
      packetKey: observation.packetKey,
      sourceRef: observation.sourceRef,
      codebaseChunkId: observation.codebaseChunkId,
      representationId: LATENT256_REPRESENTATION_ID,
      representationRevision: input.representationRevision,
      checkpointRevision: input.checkpointRevision,
      observedCheckpointRevision: observation.observedCheckpointRevision,
      representationAvailable: classified.status === 'AVAILABLE',
      status: classified.status,
      vectorChecksum: classified.vectorChecksum,
    }));
  }

  const availableCount = rows.filter((row) => row.status === 'AVAILABLE').length;
  const missingCount = rows.filter((row) => row.status === 'MISSING').length;
  const identityUnresolvedCount = rows.filter((row) => row.status === 'IDENTITY_UNRESOLVED').length;
  const revisionMismatchCount = rows.filter((row) => row.status === 'REVISION_MISMATCH').length;
  const invalidShapeCount = rows.filter((row) => row.status === 'INVALID_SHAPE').length;

  const mappingChecksum = sha256(canonicalJson(rows.map((row) => ({
    candidateOrdinal: row.candidateOrdinal,
    canonicalId: row.canonicalId,
    packetKey: row.packetKey,
    sourceRef: row.sourceRef,
    codebaseChunkId: row.codebaseChunkId,
    status: row.status,
  }))));
  const vectorsChecksum = sha256(canonicalJson(rows
    .filter((row) => row.status === 'AVAILABLE')
    .map((row) => ({ candidateOrdinal: row.candidateOrdinal, vectorChecksum: row.vectorChecksum }))));

  const body = {
    schema: CANDIDATE_LATENT256_HYDRATION_RECEIPT_SCHEMA,
    candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
    ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
    workspaceRevision: ordinalMap.workspaceRevision,
    representationId: LATENT256_REPRESENTATION_ID,
    representationRevision: input.representationRevision,
    checkpointRevision: input.checkpointRevision,
    rowCount: rows.length,
    availableCount,
    missingCount,
    identityUnresolvedCount,
    revisionMismatchCount,
    invalidShapeCount,
    rows,
    mappingChecksum,
    vectorsChecksum,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
    producerRevision: input.producerRevision,
  };

  return candidateLatent256HydrationReceiptV1Schema.parse({
    ...body,
    receiptChecksum: sha256(canonicalJson(body)),
  });
}
