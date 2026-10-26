import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  decodeMessagePackPayload,
  encodeMessagePackPayload,
  type MessagePackEnvelope,
} from '../transport/messagepack-transport-v1.js';

import {
  candidateOrdinalMapV1Schema,
  assertCandidateOrdinalMapIntegrityV1,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';
import {
  candidateFeatureSnapshotV1Schema,
  candidateFeatureSnapshotChecksum,
  type CandidateFeatureSnapshotV1,
} from '../features/candidate-feature-snapshot-v1.js';
import { CANDIDATE_SCALAR_FEATURES } from '../features/candidate-feature-columnar-v1.js';
import {
  candidateOrdinalBitsetSelectionV1Schema,
  selectCandidateFeatureRowsWithOrdinalBitsetV1,
  type CandidateOrdinalBitsetSelectionArtifactV1,
} from '../features/candidate-ordinal-bitset-selection-v1.js';
import {
  TopKExecutionSchema,
  type TopKExecutionV1,
} from './topk-execution-receipt-v1.js';
import {
  TensorArtifactManifestV1Schema,
  tensorArtifactManifestChecksumV1,
  type TensorArtifactManifestV1,
} from '../tensors/tensor-artifact-manifest-v1.js';

export const COMPUTE_DESCRIPTOR_SCHEMA_V1 = 'atlas.compute-descriptor.v1' as const;

const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export const ComputeDescriptorV1Schema = z.object({
  schema: z.literal(COMPUTE_DESCRIPTOR_SCHEMA_V1),
  requestId: z.string().min(1),
  packetKey: z.string().min(1),
  canonicalId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: z.string().min(1),
  workspaceRevision: z.string().min(1),
  candidateOrdinal: z.number().int().nonnegative(),
  candidateSnapshotRevision: z.string().min(1),
  featureSnapshotChecksum: sha256,
  ordinalMapDigest: sha256,
  selectionBitmapDigest: sha256,
  selectionBitCount: z.number().int().nonnegative(),
  inputArtifactRef: z.string().min(1),
  inputArtifactDigest: sha256,
  inputArtifactManifestChecksum: sha256,
  inputArtifactBinding: z.literal('MANIFEST_ONLY'),
  topKExecutionId: z.string().regex(/^topk:[a-f0-9]{64}$/),
  topKOutputDigest: sha256,
  operation: z.enum(['EXACT_TOPK', 'BITSET_INTERSECT', 'LOW_RANK_PROJECT', 'CENTROID_DISTANCE']),
  executorHint: z.enum(['CPU', 'NAPI', 'GRPC']),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type ComputeDescriptorV1 = z.infer<typeof ComputeDescriptorV1Schema>;

export type ComputeDescriptorExpectationV1 = Pick<ComputeDescriptorV1,
  | 'requestId'
  | 'packetKey'
  | 'canonicalId'
  | 'sourceRef'
  | 'sourceRevision'
  | 'workspaceRevision'
  | 'candidateOrdinal'
  | 'candidateSnapshotRevision'
  | 'featureSnapshotChecksum'
  | 'ordinalMapDigest'
  | 'selectionBitmapDigest'
  | 'inputArtifactDigest'
  | 'inputArtifactManifestChecksum'
  | 'topKExecutionId'
  | 'topKOutputDigest'
  | 'operation'
>;

export function encodeComputeDescriptorV1(value: unknown): MessagePackEnvelope {
  const descriptor = ComputeDescriptorV1Schema.parse(value);
  return encodeMessagePackPayload(descriptor);
}

export function decodeComputeDescriptorV1(
  envelope: MessagePackEnvelope,
  expected: ComputeDescriptorExpectationV1,
): ComputeDescriptorV1 {
  if (envelope.byteLength !== envelope.payloadBytes.byteLength) {
    throw new Error('COMPUTE_DESCRIPTOR_ENVELOPE_LENGTH_MISMATCH');
  }

  const { data, verified } = decodeMessagePackPayload<unknown>(envelope);
  if (!verified) throw new Error('COMPUTE_DESCRIPTOR_ENVELOPE_CHECKSUM_MISMATCH');

  const descriptor = ComputeDescriptorV1Schema.parse(data);
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (descriptor[field as keyof ComputeDescriptorV1] !== expectedValue) {
      throw new Error(`COMPUTE_DESCRIPTOR_EXPECTATION_MISMATCH:${field}`);
    }
  }
  return descriptor;
}

function assertFeatureSnapshotChecksum(snapshot: CandidateFeatureSnapshotV1): void {
  const payload = {
    candidateSnapshotRevision: snapshot.candidateSnapshotRevision,
    ordinalMapChecksum: snapshot.ordinalMapChecksum,
    workspaceRevision: snapshot.workspaceRevision,
    featureRevision: snapshot.featureRevision,
    rows: snapshot.rows,
  };
  if (candidateFeatureSnapshotChecksum(payload) !== snapshot.snapshotChecksum) {
    throw new Error('COMPUTE_DESCRIPTOR_FEATURE_SNAPSHOT_CHECKSUM_MISMATCH');
  }
}

export function buildComputeDescriptorV1(input: {
  packetKey: string;
  operation: ComputeDescriptorV1['operation'];
  executorHint: ComputeDescriptorV1['executorHint'];
  ordinalMap: CandidateOrdinalMapV1;
  featureSnapshot: CandidateFeatureSnapshotV1;
  selection: CandidateOrdinalBitsetSelectionArtifactV1;
  inputArtifactManifest: TensorArtifactManifestV1;
  topKExecution: TopKExecutionV1;
}): ComputeDescriptorV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(ordinalMap);
  const featureSnapshot = candidateFeatureSnapshotV1Schema.parse(input.featureSnapshot);
  assertFeatureSnapshotChecksum(featureSnapshot);
  const selectionManifest = candidateOrdinalBitsetSelectionV1Schema.parse(input.selection.manifest);
  const artifactManifest = TensorArtifactManifestV1Schema.parse(input.inputArtifactManifest);
  const topKExecution = TopKExecutionSchema.parse(input.topKExecution);

  if (featureSnapshot.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision
    || featureSnapshot.workspaceRevision !== ordinalMap.workspaceRevision
    || featureSnapshot.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum) {
    throw new Error('COMPUTE_DESCRIPTOR_FEATURE_SNAPSHOT_MAP_MISMATCH');
  }
  if (topKExecution.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision
    || topKExecution.workspaceRevision !== ordinalMap.workspaceRevision
    || topKExecution.ordinalMapDigest !== ordinalMap.ordinalMapChecksum) {
    throw new Error('COMPUTE_DESCRIPTOR_TOPK_MAP_MISMATCH');
  }
  if (artifactManifest.artifactKind !== 'CANDIDATE_FEATURE_MATRIX'
    || artifactManifest.candidateSnapshotRevision !== ordinalMap.candidateSnapshotRevision
    || artifactManifest.ordinalMapChecksum !== ordinalMap.ordinalMapChecksum
    || artifactManifest.rowCount !== ordinalMap.rowCount
    || artifactManifest.columnCount !== CANDIDATE_SCALAR_FEATURES.length
    || artifactManifest.featureSchemaRevision !== featureSnapshot.featureRevision) {
    throw new Error('COMPUTE_DESCRIPTOR_INPUT_ARTIFACT_LINEAGE_MISMATCH');
  }

  const selectedRows = selectCandidateFeatureRowsWithOrdinalBitsetV1({
    ordinalMap,
    featureSnapshot,
    selection: input.selection,
  });
  const packetMatches = ordinalMap.candidates.filter((candidate) => candidate.packetKey === input.packetKey);
  if (packetMatches.length !== 1) throw new Error('COMPUTE_DESCRIPTOR_PACKET_KEY_NOT_UNIQUE');
  const candidate = packetMatches[0];
  if (!candidate || candidate.degradedIdentity || !candidate.sourceRef) {
    throw new Error('COMPUTE_DESCRIPTOR_PACKET_IDENTITY_UNRESOLVED');
  }
  const selectedRow = selectedRows.find((row) => row.candidateOrdinal === candidate.candidateOrdinal);
  if (!selectedRow) throw new Error('COMPUTE_DESCRIPTOR_PACKET_NOT_SELECTED_BY_BITMAP');
  const topKSelection = topKExecution.selected.find((selection) => selection.ordinal === candidate.candidateOrdinal);
  if (!topKSelection || topKSelection.canonicalId !== candidate.canonicalId) {
    throw new Error('COMPUTE_DESCRIPTOR_PACKET_NOT_SELECTED_BY_TOPK');
  }
  if (topKExecution.status !== 'PASS') throw new Error('COMPUTE_DESCRIPTOR_TOPK_NOT_PASS');

  const selectionBitmapDigest = createHash('sha256').update(input.selection.bytea).digest('hex');
  if (selectionManifest.byteaSha256 !== selectionBitmapDigest) {
    throw new Error('COMPUTE_DESCRIPTOR_BITMAP_CHECKSUM_MISMATCH');
  }

  return ComputeDescriptorV1Schema.parse({
    schema: COMPUTE_DESCRIPTOR_SCHEMA_V1,
    requestId: topKExecution.requestId,
    packetKey: candidate.packetKey,
    canonicalId: candidate.canonicalId,
    sourceRef: candidate.sourceRef,
    sourceRevision: candidate.sourceRevision,
    workspaceRevision: candidate.workspaceRevision,
    candidateOrdinal: candidate.candidateOrdinal,
    candidateSnapshotRevision: candidate.candidateSnapshotRevision,
    featureSnapshotChecksum: featureSnapshot.snapshotChecksum,
    ordinalMapDigest: ordinalMap.ordinalMapChecksum,
    selectionBitmapDigest,
    selectionBitCount: selectionManifest.bitCount,
    inputArtifactRef: artifactManifest.artifactUri,
    inputArtifactDigest: artifactManifest.artifactChecksum.replace(/^sha256:/i, '').toLowerCase(),
    inputArtifactManifestChecksum: tensorArtifactManifestChecksumV1(artifactManifest).replace(/^sha256:/i, '').toLowerCase(),
    inputArtifactBinding: 'MANIFEST_ONLY',
    topKExecutionId: topKExecution.executionId,
    topKOutputDigest: topKExecution.outputDigest,
    operation: input.operation,
    executorHint: input.executorHint,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
