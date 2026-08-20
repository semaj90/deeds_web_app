import { z } from 'zod';
import type { GraphProjectionManifestV1 } from './graph-projection-manifest.js';
import {
  LandmarkDistanceSnapshotV1Schema,
  type LandmarkDistanceSnapshotV1,
} from './alt-landmark-contracts.js';

export const AltGpuDistanceJobV1Schema = z.object({
  schema: z.literal('atlas.alt-gpu-distance-job.v1'),
  landmarkCanonicalId: z.string().min(1),
  direction: z.enum(['FORWARD', 'REVERSE']),
  graphView: z.enum(['CANONICAL', 'TRANSPOSED']),
  algorithm: z.enum(['BFS', 'SSSP']),
  executor: z.enum(['CUGRAPH_BFS', 'CUGRAPH_SSSP']),
  weighted: z.boolean(),
  requireDistances: z.literal(true),
  requirePredecessors: z.literal(false),
  unreachableEncoding: z.enum(['UINT_MAX', 'POSITIVE_INFINITY']),
}).strict();
export type AltGpuDistanceJobV1 = z.infer<typeof AltGpuDistanceJobV1Schema>;

export const AltGpuPrecomputePlanV1Schema = z.object({
  schema: z.literal('atlas.alt-gpu-precompute-plan.v1'),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  projectionRevision: z.string().min(1),
  landmarkRevision: z.string().min(1),
  directed: z.boolean(),
  weighted: z.boolean(),
  forwardExecutor: z.enum(['CUGRAPH_BFS', 'CUGRAPH_SSSP']),
  reverseExecutor: z.enum(['CUGRAPH_BFS', 'CUGRAPH_SSSP']).nullable(),
  landmarkCanonicalIds: z.array(z.string().min(1)).min(1).max(256),
  jobs: z.array(AltGpuDistanceJobV1Schema).min(1).max(512),
  artifactLayout: z.literal('LANDMARK_MAJOR'),
  persistentByteOrder: z.literal('LITTLE_ENDIAN'),
  exactPromotionRequired: z.literal(true),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type AltGpuPrecomputePlanV1 = z.infer<typeof AltGpuPrecomputePlanV1Schema>;

export const AltSnapshotPromotionGateV1Schema = z.object({
  schema: z.literal('atlas.alt-snapshot-promotion-gate.v1'),
  eligible: z.boolean(),
  exactSearchAuthority: z.boolean(),
  reasonCodes: z.array(z.string().min(1)).min(1).max(32),
  graphRevision: z.string().min(1),
  projectionRevision: z.string().min(1),
  landmarkRevision: z.string().min(1),
  producerRevision: z.string().min(1),
}).strict();
export type AltSnapshotPromotionGateV1 = z.infer<typeof AltSnapshotPromotionGateV1Schema>;

/**
 * Build a GPU precompute plan without changing graph ownership. The caller is
 * responsible for materializing the canonical and (for directed ALT)
 * transposed cuGraph projections under the same graph/projection lineage.
 */
export function buildAltGpuPrecomputePlan(input: {
  projection: GraphProjectionManifestV1;
  landmarkRevision: string;
  landmarkCanonicalIds: readonly string[];
  producerRevision: string;
}): AltGpuPrecomputePlanV1 {
  const projection = input.projection;
  if (projection.nodeCount <= 0) throw new Error('ALT GPU precompute requires a non-empty graph');
  if (projection.negativeWeightsPresent) throw new Error('ALT GPU precompute requires non-negative edge weights');
  if (input.landmarkCanonicalIds.length < 1 || input.landmarkCanonicalIds.length > 256) {
    throw new Error('ALT GPU precompute requires 1..256 landmarks');
  }
  const landmarks = [...new Set(input.landmarkCanonicalIds)];
  if (landmarks.length !== input.landmarkCanonicalIds.length) {
    throw new Error('ALT GPU landmarks must be unique');
  }

  const algorithm = projection.weighted ? 'SSSP' as const : 'BFS' as const;
  const executor = projection.weighted ? 'CUGRAPH_SSSP' as const : 'CUGRAPH_BFS' as const;
  const unreachableEncoding = projection.weighted ? 'POSITIVE_INFINITY' as const : 'UINT_MAX' as const;

  const jobs: AltGpuDistanceJobV1[] = [];
  for (const landmarkCanonicalId of landmarks) {
    jobs.push({
      schema: 'atlas.alt-gpu-distance-job.v1',
      landmarkCanonicalId,
      direction: 'FORWARD',
      graphView: 'CANONICAL',
      algorithm,
      executor,
      weighted: projection.weighted,
      requireDistances: true,
      requirePredecessors: false,
      unreachableEncoding,
    });
    if (projection.directed) {
      jobs.push({
        schema: 'atlas.alt-gpu-distance-job.v1',
        landmarkCanonicalId,
        direction: 'REVERSE',
        graphView: 'TRANSPOSED',
        algorithm,
        executor,
        weighted: projection.weighted,
        requireDistances: true,
        requirePredecessors: false,
        unreachableEncoding,
      });
    }
  }

  return AltGpuPrecomputePlanV1Schema.parse({
    schema: 'atlas.alt-gpu-precompute-plan.v1',
    workspaceRevision: projection.workspaceRevision,
    graphRevision: projection.graphRevision,
    projectionRevision: projection.projectionRevision,
    landmarkRevision: input.landmarkRevision,
    directed: projection.directed,
    weighted: projection.weighted,
    forwardExecutor: executor,
    reverseExecutor: projection.directed ? executor : null,
    landmarkCanonicalIds: landmarks,
    jobs,
    artifactLayout: 'LANDMARK_MAJOR',
    persistentByteOrder: 'LITTLE_ENDIAN',
    exactPromotionRequired: true,
    canonicalWrites: false,
    producerRevision: input.producerRevision,
  });
}

/**
 * Persistent snapshots are held to a stricter gate than draft/in-memory refs.
 * In particular, explicit byte order and cost-model lineage are mandatory.
 */
export function evaluateAltSnapshotPromotion(input: {
  snapshot: LandmarkDistanceSnapshotV1;
  expectedGraphRevision: string;
  expectedProjectionRevision: string;
  expectedCostModelRevision: string;
  expectedEdgeCostChecksumSha256: string;
  producerRevision: string;
}): AltSnapshotPromotionGateV1 {
  const snapshot = LandmarkDistanceSnapshotV1Schema.parse(input.snapshot);
  const reasons: string[] = [];
  let eligible = true;

  if (snapshot.graphRevision !== input.expectedGraphRevision) {
    eligible = false;
    reasons.push('GRAPH_REVISION_MISMATCH');
  }
  if (snapshot.projectionRevision !== input.expectedProjectionRevision) {
    eligible = false;
    reasons.push('PROJECTION_REVISION_MISMATCH');
  }
  if (snapshot.costModelRevision !== input.expectedCostModelRevision) {
    eligible = false;
    reasons.push('COST_MODEL_REVISION_MISMATCH');
  }
  if (snapshot.edgeCostChecksumSha256 !== input.expectedEdgeCostChecksumSha256) {
    eligible = false;
    reasons.push('EDGE_COST_CHECKSUM_MISMATCH');
  }
  if (snapshot.forwardDistances.byteOrder !== 'LITTLE_ENDIAN') {
    eligible = false;
    reasons.push('FORWARD_BYTE_ORDER_NOT_EXPLICIT');
  }
  if (snapshot.directed && snapshot.reverseDistances?.byteOrder !== 'LITTLE_ENDIAN') {
    eligible = false;
    reasons.push('REVERSE_BYTE_ORDER_NOT_EXPLICIT');
  }
  if (snapshot.quantizedForExactSearch) {
    eligible = false;
    reasons.push('LOSSY_EXACT_DISTANCE_ARTIFACT');
  }

  let exactSearchAuthority = false;
  if (eligible && snapshot.distanceExactness === 'EXACT_INTEGER') {
    exactSearchAuthority = true;
    reasons.push('EXACT_INTEGER_DISTANCE_AUTHORITY');
  } else if (
    eligible
    && snapshot.distanceExactness === 'AUTHORITATIVE_FLOAT'
    && snapshot.floatingErrorBoundCertified
    && snapshot.distanceAbsoluteErrorBound !== null
  ) {
    exactSearchAuthority = true;
    reasons.push('CERTIFIED_FLOAT_DISTANCE_AUTHORITY_WITH_NUMERIC_GUARD');
  } else if (eligible && snapshot.distanceExactness === 'AUTHORITATIVE_FLOAT') {
    reasons.push('FLOAT_DISTANCE_ERROR_BOUND_UNCERTIFIED');
  }

  if (reasons.length === 0) reasons.push('ALT_SNAPSHOT_STRUCTURALLY_ELIGIBLE');

  return AltSnapshotPromotionGateV1Schema.parse({
    schema: 'atlas.alt-snapshot-promotion-gate.v1',
    eligible,
    exactSearchAuthority,
    reasonCodes: reasons,
    graphRevision: snapshot.graphRevision,
    projectionRevision: snapshot.projectionRevision,
    landmarkRevision: snapshot.landmarkRevision,
    producerRevision: input.producerRevision,
  });
}
