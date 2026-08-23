import { z } from 'zod';
import {
  normalizeRotationQuaternion,
  type RotationQuaternion,
} from '../geometry/rigid-pose-interpolation.js';

/**
 * Synthetic "Tetris" stress fixture for Parent Atlas topology plumbing.
 *
 * This is NOT a production semantic representation and does not assign SOM or
 * KMeans truth. It turns a 6-DoF rigid-body pose into a quantized n-D Hilbert
 * locality key plus compact key/value fields that can feed later SOM/KMeans
 * and derived-graph tests.
 *
 * Six DoF = three translations + three rotations:
 *   [x, y, z, roll, pitch, yaw]
 *
 * The Euler tuple is retained for fixture/backward compatibility and locality
 * quantization. A separate physical unit quaternion is emitted for orientation
 * comparison/interpolation so Euler wrap-around does not masquerade as a large
 * physical rotation.
 *
 * Hilbert order is a locality/indexing device only. It is not a physical
 * distance metric and does not create canonical graph relations.
 */

export const TetrisPieceKindSchema = z.enum(['I', 'J', 'L', 'O', 'S', 'T', 'Z']);
export type TetrisPieceKind = z.infer<typeof TetrisPieceKindSchema>;

export const Pose6DSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export type Pose6D = z.infer<typeof Pose6DSchema>;

export const QuantizedPose6DSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);
export type QuantizedPose6D = z.infer<typeof QuantizedPose6DSchema>;

export const PhysicalQuaternionSchema = z.tuple([
  z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(),
]);
export type PhysicalQuaternion = z.infer<typeof PhysicalQuaternionSchema>;

export const PoseAxisBoundsSchema = z.object({
  min: z.number().finite(),
  max: z.number().finite(),
  periodic: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (!(value.max > value.min)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['max'], message: 'axis max must exceed min' });
  }
});
export type PoseAxisBounds = z.infer<typeof PoseAxisBoundsSchema>;

export const Pose6DBoundsSchema = z.tuple([
  PoseAxisBoundsSchema,
  PoseAxisBoundsSchema,
  PoseAxisBoundsSchema,
  PoseAxisBoundsSchema,
  PoseAxisBoundsSchema,
  PoseAxisBoundsSchema,
]);
export type Pose6DBounds = z.infer<typeof Pose6DBoundsSchema>;

export const HilbertDomainPlanV1Schema = z.object({
  schema: z.literal('atlas.hilbert-domain-plan.v1'),
  dimensions: z.number().int().min(2).max(16),
  logicalCapacityRequested: z.number().int().positive(),
  bitsPerAxis: z.number().int().min(1).max(31),
  binsPerAxis: z.number().int().positive(),
  keyBits: z.number().int().positive(),
  keyspaceCapacity: z.string().regex(/^\d+$/),
  localityOnly: z.literal(true),
  producerRevision: z.string().min(1),
}).strict();
export type HilbertDomainPlanV1 = z.infer<typeof HilbertDomainPlanV1Schema>;

export function planHilbertDomain(input: {
  dimensions: number;
  logicalCapacityRequested: number;
  producerRevision: string;
}): HilbertDomainPlanV1 {
  if (!Number.isInteger(input.dimensions) || input.dimensions < 2 || input.dimensions > 16) {
    throw new Error('dimensions must be an integer in [2,16]');
  }
  if (!Number.isSafeInteger(input.logicalCapacityRequested) || input.logicalCapacityRequested <= 0) {
    throw new Error('logicalCapacityRequested must be a positive safe integer');
  }

  const bitsPerAxis = Math.max(1, Math.ceil(Math.log2(input.logicalCapacityRequested) / input.dimensions));
  if (bitsPerAxis > 31) throw new Error('requested keyspace exceeds this reference plan limit');
  const binsPerAxis = 2 ** bitsPerAxis;
  const keyBits = bitsPerAxis * input.dimensions;
  const keyspaceCapacity = 1n << BigInt(keyBits);

  return HilbertDomainPlanV1Schema.parse({
    schema: 'atlas.hilbert-domain-plan.v1',
    dimensions: input.dimensions,
    logicalCapacityRequested: input.logicalCapacityRequested,
    bitsPerAxis,
    binsPerAxis,
    keyBits,
    keyspaceCapacity: keyspaceCapacity.toString(10),
    localityOnly: true,
    producerRevision: input.producerRevision,
  });
}

function normalizePeriodic(value: number, min: number, max: number): number {
  const width = max - min;
  const offset = ((value - min) % width + width) % width;
  return min + offset;
}

function quantizeAxis(value: number, bounds: PoseAxisBounds, bins: number): { bin: number; normalized: number } {
  if (!Number.isFinite(value)) throw new Error('pose axis must be finite');
  const bounded = bounds.periodic
    ? normalizePeriodic(value, bounds.min, bounds.max)
    : Math.max(bounds.min, Math.min(bounds.max, value));
  const normalized = Math.max(0, Math.min(1, (bounded - bounds.min) / (bounds.max - bounds.min)));
  const bin = Math.min(bins - 1, Math.floor(normalized * bins));
  return { bin, normalized };
}

export function quantizePose6D(
  pose: Pose6D,
  bounds: Pose6DBounds,
  bitsPerAxis: number,
): { quantized: QuantizedPose6D; normalized: readonly [number, number, number, number, number, number] } {
  Pose6DSchema.parse(pose);
  Pose6DBoundsSchema.parse(bounds);
  if (!Number.isInteger(bitsPerAxis) || bitsPerAxis < 1 || bitsPerAxis > 31) throw new Error('bitsPerAxis must be in [1,31]');
  const bins = 2 ** bitsPerAxis;
  const q = [
    quantizeAxis(pose[0], bounds[0], bins),
    quantizeAxis(pose[1], bounds[1], bins),
    quantizeAxis(pose[2], bounds[2], bins),
    quantizeAxis(pose[3], bounds[3], bins),
    quantizeAxis(pose[4], bounds[4], bins),
    quantizeAxis(pose[5], bounds[5], bins),
  ];
  const quantized: QuantizedPose6D = [q[0].bin, q[1].bin, q[2].bin, q[3].bin, q[4].bin, q[5].bin];
  const normalized: [number, number, number, number, number, number] = [
    q[0].normalized, q[1].normalized, q[2].normalized,
    q[3].normalized, q[4].normalized, q[5].normalized,
  ];
  return {
    quantized: QuantizedPose6DSchema.parse(quantized),
    normalized,
  };
}

/**
 * Convert roll/pitch/yaw to a physical unit quaternion using the explicit ZYX
 * yaw-pitch-roll convention. Quaternion storage is [w,x,y,z].
 *
 * Canonical sign removes the q/-q duplication for Euclidean fixture vectors:
 * prefer w>0; if w==0, choose the first non-zero vector component positive.
 * This does NOT turn Euclidean KMeans into a true geodesic SO(3) clustering
 * algorithm; physical evaluation must still use antipodal-invariant angular
 * distance.
 */
export function eulerZYXToCanonicalQuaternion(roll: number, pitch: number, yaw: number): PhysicalQuaternion {
  for (const value of [roll, pitch, yaw]) if (!Number.isFinite(value)) throw new Error('Euler angles must be finite');
  const cr = Math.cos(roll / 2); const sr = Math.sin(roll / 2);
  const cp = Math.cos(pitch / 2); const sp = Math.sin(pitch / 2);
  const cy = Math.cos(yaw / 2); const sy = Math.sin(yaw / 2);

  let q = normalizeRotationQuaternion([
    cr * cp * cy + sr * sp * sy,
    sr * cp * cy - cr * sp * sy,
    cr * sp * cy + sr * cp * sy,
    cr * cp * sy - sr * sp * cy,
  ] as RotationQuaternion) as PhysicalQuaternion;

  const signProbe = Math.abs(q[0]) > 1e-12 ? q[0]
    : Math.abs(q[1]) > 1e-12 ? q[1]
      : Math.abs(q[2]) > 1e-12 ? q[2] : q[3];
  if (signProbe < 0) q = [-q[0], -q[1], -q[2], -q[3]];
  // Eliminate platform-dependent signed/near-zero residue at periodic angles
  // so equivalent Euler representations have identical physical coordinates.
  q = (q as readonly number[]).map((component) => Math.abs(component) <= 1e-12 ? 0 : component) as PhysicalQuaternion;
  return PhysicalQuaternionSchema.parse(q);
}

/**
 * John Skilling-style axes -> Hilbert transpose -> scalar distance.
 * Uses BigInt so the reference remains correct beyond 32-bit key widths.
 */
export function hilbertIndexND(point: readonly number[], bitsPerAxis: number): bigint {
  if (!Number.isInteger(bitsPerAxis) || bitsPerAxis < 1 || bitsPerAxis > 31) {
    throw new Error('bitsPerAxis must be in [1,31]');
  }
  if (point.length < 2 || point.length > 16) throw new Error('Hilbert point dimensions must be in [2,16]');
  const maxCoordinate = 2 ** bitsPerAxis;
  const x = point.map((value) => {
    if (!Number.isInteger(value) || value < 0 || value >= maxCoordinate) {
      throw new Error(`Hilbert coordinate must be integer in [0,${maxCoordinate - 1}]`);
    }
    return value;
  });

  let q = 1 << (bitsPerAxis - 1);
  while (q > 1) {
    const p = q - 1;
    for (let i = 0; i < x.length; i += 1) {
      if ((x[i] & q) !== 0) {
        x[0] ^= p;
      } else {
        const t = (x[0] ^ x[i]) & p;
        x[0] ^= t;
        x[i] ^= t;
      }
    }
    q >>= 1;
  }

  for (let i = 1; i < x.length; i += 1) x[i] ^= x[i - 1];
  let t = 0;
  q = 1 << (bitsPerAxis - 1);
  while (q > 1) {
    if ((x[x.length - 1] & q) !== 0) t ^= q - 1;
    q >>= 1;
  }
  for (let i = 0; i < x.length; i += 1) x[i] ^= t;

  let distance = 0n;
  for (let bit = bitsPerAxis - 1; bit >= 0; bit -= 1) {
    for (let axis = 0; axis < x.length; axis += 1) {
      distance = (distance << 1n) | BigInt((x[axis] >> bit) & 1);
    }
  }
  return distance;
}

export const Tetris6DKeyValueV1Schema = z.object({
  schema: z.literal('atlas.tetris-6d-kv.v1'),
  canonicalId: z.string().min(1),
  piece: TetrisPieceKindSchema,
  representationRevision: z.string().min(1),
  bitsPerAxis: z.number().int().positive(),
  /** Original fixture coordinates retained for locality/key parity. */
  eulerPose6D: Pose6DSchema,
  quantizedPose6D: QuantizedPose6DSchema,
  /** Physical orientation representation, ZYX convention, canonical q/-q sign. */
  physicalRotationQuaternion: PhysicalQuaternionSchema,
  /** [normalized x,y,z,qw,qx,qy,qz] — 7-D SE(3) fixture feature. */
  se3PhysicalFeature7: z.tuple([
    z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1),
    z.number().finite().min(-1).max(1), z.number().finite().min(-1).max(1),
    z.number().finite().min(-1).max(1), z.number().finite().min(-1).max(1),
  ]),
  hilbertIndexDecimal: z.string().regex(/^\d+$/),
  hilbertIndexHex: z.string().regex(/^[0-9a-f]+$/),
  localityBucketKey: z.string().min(1),
  memberKey: z.string().min(1),
  clusterVector6: z.tuple([
    z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1),
    z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1),
  ]),
  /** Legacy Euler fixture bridge: first six values are normalized Euler pose. */
  somFixtureVector64: z.array(z.number().finite()).length(64),
  /** Quaternion fixture bridge: normalized xyz + canonical unit quaternion + zero pad. */
  somQuaternionFixtureVector64: z.array(z.number().finite()).length(64),
  somAssignment: z.null(),
  kmeansCluster: z.null(),
  canonicalGraphRelation: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type Tetris6DKeyValueV1 = z.infer<typeof Tetris6DKeyValueV1Schema>;

export function buildTetris6DKeyValue(input: {
  canonicalId: string;
  piece: TetrisPieceKind;
  pose: Pose6D;
  bounds: Pose6DBounds;
  bitsPerAxis: number;
  representationRevision: string;
  producerRevision: string;
  localityBucketBits?: number;
}): Tetris6DKeyValueV1 {
  if (!input.canonicalId) throw new Error('canonicalId required');
  const pose = Pose6DSchema.parse(input.pose);
  const { quantized, normalized } = quantizePose6D(pose, input.bounds, input.bitsPerAxis);
  const physicalRotationQuaternion = eulerZYXToCanonicalQuaternion(pose[3], pose[4], pose[5]);
  const physicalQuaternion = physicalRotationQuaternion as unknown as [number, number, number, number];
  const se3PhysicalFeature7: [number, number, number, number, number, number, number] = [
    normalized[0], normalized[1], normalized[2],
    physicalQuaternion[0], physicalQuaternion[1], physicalQuaternion[2], physicalQuaternion[3],
  ];
  const hilbertCoordinates: number[] = [
    quantized[0], quantized[1], quantized[2], quantized[3], quantized[4], quantized[5],
  ];
  const h = hilbertIndexND(hilbertCoordinates, input.bitsPerAxis);
  const totalBits = input.bitsPerAxis * 6;
  const bucketBits = Math.max(0, Math.min(totalBits, input.localityBucketBits ?? Math.min(12, totalBits)));
  const bucketShift = BigInt(Math.max(0, totalBits - bucketBits));
  const bucket = bucketBits === 0 ? 0n : h >> bucketShift;
  const hHex = h.toString(16).padStart(Math.ceil(totalBits / 4), '0');
  const bucketHex = bucket.toString(16);
  const somFixtureVector64 = [...normalized, ...Array.from({ length: 58 }, () => 0)];
  const somQuaternionFixtureVector64 = [...se3PhysicalFeature7, ...Array.from({ length: 57 }, () => 0)];

  return Tetris6DKeyValueV1Schema.parse({
    schema: 'atlas.tetris-6d-kv.v1',
    canonicalId: input.canonicalId,
    piece: input.piece,
    representationRevision: input.representationRevision,
    bitsPerAxis: input.bitsPerAxis,
    eulerPose6D: pose,
    quantizedPose6D: quantized,
    physicalRotationQuaternion,
    se3PhysicalFeature7,
    hilbertIndexDecimal: h.toString(10),
    hilbertIndexHex: hHex,
    localityBucketKey: `${input.representationRevision}:h6:b${bucketBits}:${bucketHex}`,
    memberKey: `${input.representationRevision}:h6:${hHex}:${input.canonicalId}`,
    clusterVector6: normalized,
    somFixtureVector64,
    somQuaternionFixtureVector64,
    somAssignment: null,
    kmeansCluster: null,
    canonicalGraphRelation: false,
    producerRevision: input.producerRevision,
  });
}

export const DerivedHilbertLocalityEdgeV1Schema = z.object({
  sourceCanonicalId: z.string().min(1),
  targetCanonicalId: z.string().min(1),
  relation: z.literal('HILBERT_LOCALITY_HINT'),
  hilbertGap: z.string().regex(/^\d+$/),
  canonicalGraphRelation: z.literal(false),
}).strict();
export type DerivedHilbertLocalityEdgeV1 = z.infer<typeof DerivedHilbertLocalityEdgeV1Schema>;

export function buildDerivedHilbertLocalityEdges(rows: readonly Tetris6DKeyValueV1[]): DerivedHilbertLocalityEdgeV1[] {
  const ordered = [...rows].sort((a, b) => {
    const ah = BigInt(a.hilbertIndexDecimal);
    const bh = BigInt(b.hilbertIndexDecimal);
    if (ah < bh) return -1;
    if (ah > bh) return 1;
    return a.canonicalId.localeCompare(b.canonicalId);
  });
  const edges: DerivedHilbertLocalityEdgeV1[] = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const left = ordered[i - 1];
    const right = ordered[i];
    const gap = BigInt(right.hilbertIndexDecimal) - BigInt(left.hilbertIndexDecimal);
    edges.push(DerivedHilbertLocalityEdgeV1Schema.parse({
      sourceCanonicalId: left.canonicalId,
      targetCanonicalId: right.canonicalId,
      relation: 'HILBERT_LOCALITY_HINT',
      hilbertGap: gap.toString(10),
      canonicalGraphRelation: false,
    }));
  }
  return edges;
}

export function defaultTetris6DBounds(): Pose6DBounds {
  return Pose6DBoundsSchema.parse([
    { min: -1, max: 1, periodic: false },
    { min: -1, max: 1, periodic: false },
    { min: -1, max: 1, periodic: false },
    { min: -Math.PI, max: Math.PI, periodic: true },
    { min: -Math.PI, max: Math.PI, periodic: true },
    { min: -Math.PI, max: Math.PI, periodic: true },
  ]);
}
