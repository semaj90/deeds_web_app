import { z } from 'zod';
import type { GpuCandidateBatchDescriptorV1 } from './candidate-materialization-v1.js';
import type { OkfHeadMappingV1 } from './okf-head-mapping-v1.js';

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

/** Unary gRPC/HTTP-neutral request: artifact reference + ordinals, never vectors or device pointers. */
export const GpuWorkRequestV1Schema = z.object({
  schema: z.literal('atlas.gpu-work-request.v1'),
  requestId: z.string().min(1),
  operation: z.enum(['MATERIALIZE_FEATURES', 'EXACT_KNN', 'GRAPH_NEIGHBORS', 'RERANK']),
  snapshotRevision: z.string().min(1),
  representationId: z.literal('semantic_768'),
  representationRevision: z.string().min(1),
  datasetChecksumSha256: Sha256Schema,
  artifactRef: z.string().min(1),
  ordinals: z.array(z.number().int().nonnegative()).max(100_000),
  topK: z.number().int().positive().max(65_535),
  headMask: z.number().int().min(0).max(0x7f),
  graphDepth: z.number().int().nonnegative().max(64),
  transport: z.enum(['unary_grpc', 'local_ipc']).default('unary_grpc'),
  canonicalWrites: z.literal(false),
}).strict();
export type GpuWorkRequestV1 = z.infer<typeof GpuWorkRequestV1Schema>;

/** Compose the transport request only after the materializer and OKF policy agree. */
export function buildGpuWorkRequest(input: {
  requestId: string;
  operation: GpuWorkRequestV1['operation'];
  batch: GpuCandidateBatchDescriptorV1;
  headMapping: OkfHeadMappingV1;
  topK: number;
  graphDepth: number;
  transport?: GpuWorkRequestV1['transport'];
}): GpuWorkRequestV1 {
  if (input.batch.snapshotRevision !== input.headMapping.sourceRevision) {
    throw new Error('GPU_WORK_REVISION_MISMATCH');
  }
  if ((input.headMapping.headMask & ~0x7f) !== 0) {
    throw new Error('GPU_WORK_HEAD_MASK_OUT_OF_RANGE');
  }
  return GpuWorkRequestV1Schema.parse({
    schema: 'atlas.gpu-work-request.v1',
    requestId: input.requestId,
    operation: input.operation,
    snapshotRevision: input.batch.snapshotRevision,
    representationId: input.batch.representation.representationId,
    representationRevision: input.batch.representation.representationRevision,
    datasetChecksumSha256: input.batch.representation.datasetChecksumSha256,
    artifactRef: input.batch.sourceArtifactRef,
    ordinals: input.batch.ordinals,
    topK: input.topK,
    headMask: input.headMapping.headMask,
    graphDepth: input.graphDepth,
    transport: input.transport ?? 'unary_grpc',
    canonicalWrites: false,
  });
}
