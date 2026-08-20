import { z } from 'zod';
import {
  rotationAngularDistance,
  type RotationQuaternion,
} from '../geometry/rigid-pose-interpolation.js';
import type { Tetris6DKeyValueV1 } from './tetris-6d-hilbert-step1.js';

export const PoseClusterFeatureModeSchema = z.enum([
  'EULER6_FIXTURE',
  'SE3_QUATERNION7',
  'SOM64_EULER_PADDED',
  'SOM64_QUATERNION_PADDED',
]);
export type PoseClusterFeatureMode = z.infer<typeof PoseClusterFeatureModeSchema>;

export const PoseClusterInputV1Schema = z.object({
  canonicalId: z.string().min(1),
  mode: PoseClusterFeatureModeSchema,
  vector: z.array(z.number().finite()).min(1),
  physicalQuaternion: z.tuple([
    z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(),
  ]),
  canonicalSemanticAuthority: z.literal(false),
}).strict();
export type PoseClusterInputV1 = z.infer<typeof PoseClusterInputV1Schema>;

/**
 * Adapt the synthetic Tetris/SE(3) fixture into existing SOM/KMeans tensor
 * widths without giving the fixture any semantic authority.
 */
export function toPoseClusterInput(
  row: Tetris6DKeyValueV1,
  mode: PoseClusterFeatureMode,
): PoseClusterInputV1 {
  let vector: number[];
  switch (mode) {
    case 'EULER6_FIXTURE': vector = [...row.clusterVector6]; break;
    case 'SE3_QUATERNION7': vector = [...row.se3PhysicalFeature7]; break;
    case 'SOM64_EULER_PADDED': vector = [...row.somFixtureVector64]; break;
    case 'SOM64_QUATERNION_PADDED': vector = [...row.somQuaternionFixtureVector64]; break;
  }
  return PoseClusterInputV1Schema.parse({
    canonicalId: row.canonicalId,
    mode,
    vector,
    physicalQuaternion: row.physicalRotationQuaternion,
    canonicalSemanticAuthority: false,
  });
}

export const PoseContinuityPairV1Schema = z.object({
  leftCanonicalId: z.string().min(1),
  rightCanonicalId: z.string().min(1),
  sameCluster: z.boolean(),
  rotationDistanceRadians: z.number().finite().nonnegative(),
  translationDistance: z.number().finite().nonnegative(),
  physicalPoseDistance: z.number().finite().nonnegative(),
}).strict();
export type PoseContinuityPairV1 = z.infer<typeof PoseContinuityPairV1Schema>;

export const PoseClusterContinuityReportV1Schema = z.object({
  schema: z.literal('atlas.pose-cluster-continuity.v1'),
  mode: PoseClusterFeatureModeSchema,
  pairCount: z.number().int().nonnegative(),
  sameClusterPairCount: z.number().int().nonnegative(),
  meanPhysicalDistanceSameCluster: z.number().finite().nonnegative().nullable(),
  meanPhysicalDistanceDifferentCluster: z.number().finite().nonnegative().nullable(),
  continuitySeparation: z.number().finite().nullable(),
  canonicalSemanticAuthority: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type PoseClusterContinuityReportV1 = z.infer<typeof PoseClusterContinuityReportV1Schema>;

function euclidean3(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Evaluate clustering continuity using physical pose geometry, not the raw
 * Euclidean training feature. This lets us compare Euler-vs-quaternion feature
 * encodings fairly while keeping the validation metric independent.
 *
 * physicalPoseDistance = translationWeight*||dt||_2 + rotationWeight*d_SO3(q1,q2)
 */
export function evaluatePoseClusterContinuity(input: {
  rows: readonly Tetris6DKeyValueV1[];
  clusterByCanonicalId: Readonly<Record<string, number>>;
  mode: PoseClusterFeatureMode;
  translationWeight?: number;
  rotationWeight?: number;
  producerRevision: string;
}): PoseClusterContinuityReportV1 {
  const translationWeight = input.translationWeight ?? 1;
  const rotationWeight = input.rotationWeight ?? 1;
  if (!(translationWeight >= 0) || !(rotationWeight >= 0)) throw new Error('pose continuity weights must be non-negative');

  const same: number[] = [];
  const different: number[] = [];
  for (let i = 0; i < input.rows.length; i += 1) {
    const left = input.rows[i];
    const leftCluster = input.clusterByCanonicalId[left.canonicalId];
    if (leftCluster === undefined) continue;
    for (let j = i + 1; j < input.rows.length; j += 1) {
      const right = input.rows[j];
      const rightCluster = input.clusterByCanonicalId[right.canonicalId];
      if (rightCluster === undefined) continue;
      const translationDistance = euclidean3(left.clusterVector6, right.clusterVector6);
      const rotationDistance = rotationAngularDistance(
        left.physicalRotationQuaternion as RotationQuaternion,
        right.physicalRotationQuaternion as RotationQuaternion,
      );
      const distance = translationWeight * translationDistance + rotationWeight * rotationDistance;
      (leftCluster === rightCluster ? same : different).push(distance);
    }
  }

  const mean = (values: readonly number[]): number | null => values.length === 0
    ? null
    : values.reduce((sum, value) => sum + value, 0) / values.length;
  const sameMean = mean(same);
  const differentMean = mean(different);
  const separation = sameMean === null || differentMean === null ? null : differentMean - sameMean;

  return PoseClusterContinuityReportV1Schema.parse({
    schema: 'atlas.pose-cluster-continuity.v1',
    mode: input.mode,
    pairCount: same.length + different.length,
    sameClusterPairCount: same.length,
    meanPhysicalDistanceSameCluster: sameMean,
    meanPhysicalDistanceDifferentCluster: differentMean,
    continuitySeparation: separation,
    canonicalSemanticAuthority: false,
    producerRevision: input.producerRevision,
  });
}
