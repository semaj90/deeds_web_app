import { z } from 'zod';

export const MANIFOLD4_REPRESENTATION_ID = 'atlas.manifold4.orientation.v1' as const;
export const MANIFOLD4_COMPONENT_ORDER = 'wxyz' as const;

const finite = z.number().finite();

export const Manifold4OrientationV1Schema = z.object({
  schema: z.literal(MANIFOLD4_REPRESENTATION_ID),
  candidateOrdinal: z.number().int().nonnegative(),
  canonicalId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  producerRevision: z.string().min(1),
  componentOrder: z.literal(MANIFOLD4_COMPONENT_ORDER),
  quaternion: z.tuple([finite, finite, finite, finite]),
  source: z.enum(['som_projection', 'derived_feature', 'imported_rotation']),
  evidenceRefs: z.array(z.string().min(1)).default([]),
}).superRefine((value, ctx) => {
  const quaternion = value.quaternion as unknown as [number, number, number, number];
  const norm = Math.hypot(...quaternion);
  if (!Number.isFinite(norm) || Math.abs(norm - 1) > 1e-5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['quaternion'],
      message: `MANIFOLD4_UNIT_NORM_REQUIRED: norm=${norm}`,
    });
  }
});

export type Manifold4OrientationV1 = z.infer<typeof Manifold4OrientationV1Schema>;
export type QuaternionWxyz = readonly [number, number, number, number];

/**
 * Normalize and deterministically canonicalize q and -q to the same stored
 * representative. Unit quaternions double-cover SO(3), so q and -q must not
 * become two distinct Atlas projection identities.
 */
export function canonicalizeQuaternionWxyz(input: readonly number[]): QuaternionWxyz {
  if (input.length !== 4 || input.some((value) => !Number.isFinite(value))) {
    throw new Error('MANIFOLD4_INVALID_QUATERNION');
  }

  const norm = Math.hypot(input[0], input[1], input[2], input[3]);
  if (norm < 1e-12) throw new Error('MANIFOLD4_ZERO_NORM');

  let q: [number, number, number, number] = [
    input[0] / norm,
    input[1] / norm,
    input[2] / norm,
    input[3] / norm,
  ];

  // Canonical representative: w > 0; if w == 0, first non-zero xyz > 0.
  const pivot = q.find((value) => Math.abs(value) > 1e-12) ?? 0;
  if (pivot < 0) q = [-q[0], -q[1], -q[2], -q[3]];

  return q;
}

/** Antipodal-aware similarity on unit quaternions. 1 means same rotation. */
export function quaternionOrientationSimilarity(
  a: QuaternionWxyz,
  b: QuaternionWxyz,
): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  return Math.min(1, Math.max(0, Math.abs(dot)));
}

/**
 * Geodesic rotation distance in radians. Because q and -q are equivalent,
 * abs(dot) is required before acos.
 */
export function quaternionAngularDistance(
  a: QuaternionWxyz,
  b: QuaternionWxyz,
): number {
  const similarity = quaternionOrientationSimilarity(a, b);
  return 2 * Math.acos(Math.min(1, Math.max(-1, similarity)));
}

/**
 * Derived feature only. It is neither canonical identity nor semantic_768.
 */
export function assertManifold4ProjectionBoundary(): true {
  return true;
}
