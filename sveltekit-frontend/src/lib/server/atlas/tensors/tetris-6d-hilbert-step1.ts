import { z } from 'zod';

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
  const q = pose.map((value, index) => quantizeAxis(value, bounds[index], bins));
  return {
    quantized: QuantizedPose6DSchema.parse(q.map((entry) => entry.bin)),
    normalized: q.map((entry) => entry.normalized) as [number, number, number, number, number, number],
  };
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

  // Inverse undo / exchange stage from Skilling's n-D formulation.
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

  // Gray encode.
  for (let i = 1; i < x.length; i += 1) x[i] ^= x[i - 1];
  let t = 0;
  q = 1 << (bitsPerAxis - 1);
  while (q > 1) {
    if ((x[x.length - 1] & q) !== 0) t ^= q - 1;
    q >>= 1;
  }
  for (let i = 0; i < x.length; i += 1) x[i] ^= t;

  // Transpose bits [axis0 bitMSB, axis1 bitMSB, ...] into scalar Hilbert distance.
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
  quantizedPose6D: QuantizedPose6DSchema,
  hilbertIndexDecimal: z.string().regex(/^\d+$/),
  hilbertIndexHex: z.string().regex(/^[0-9a-f]+$/),
  localityBucketKey: z.string().min(1),
  memberKey: z.string().min(1),
  clusterVector6: z.tuple([
    z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1),
    z.number().finite().min(0).max(1), z.number().finite().min(0).max(1), z.number().finite().min(0).max(1),
  ]),
  /** Fixture bridge for the repo's existing 64-D SOM path: first six values are pose, remaining values are zero. */
  somFixtureVector64: z.array(z.number().finite()).length(64),
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
  const { quantized, normalized } = quantizePose6D(input.pose, input.bounds, input.bitsPerAxis);
  const h = hilbertIndexND(quantized, input.bitsPerAxis);
  const totalBits = input.bitsPerAxis * 6;
  const bucketBits = Math.max(0, Math.min(totalBits, input.localityBucketBits ?? Math.min(12, totalBits)));
  const bucketShift = BigInt(Math.max(0, totalBits - bucketBits));
  const bucket = bucketBits === 0 ? 0n : h >> bucketShift;
  const hHex = h.toString(16).padStart(Math.ceil(totalBits / 4), '0');
  const bucketHex = bucket.toString(16);
  const somFixtureVector64 = [...normalized, ...Array.from({ length: 58 }, () => 0)];

  // Compound memberKey prevents distinct objects quantized to the same Hilbert
  // cell from overwriting one another in a key/value store.
  return Tetris6DKeyValueV1Schema.parse({
    schema: 'atlas.tetris-6d-kv.v1',
    canonicalId: input.canonicalId,
    piece: input.piece,
    representationRevision: input.representationRevision,
    bitsPerAxis: input.bitsPerAxis,
    quantizedPose6D: quantized,
    hilbertIndexDecimal: h.toString(10),
    hilbertIndexHex: hHex,
    localityBucketKey: `${input.representationRevision}:h6:b${bucketBits}:${bucketHex}`,
    memberKey: `${input.representationRevision}:h6:${hHex}:${input.canonicalId}`,
    clusterVector6: normalized,
    somFixtureVector64,
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

/**
 * Step-1 derived graph: connect consecutive objects in Hilbert order only as a
 * locality hint. This MUST NOT be materialized as CALLS/IMPORTS/REFERENCES.
 */
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
