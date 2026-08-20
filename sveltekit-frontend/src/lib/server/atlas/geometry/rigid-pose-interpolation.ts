import { z } from 'zod';

/**
 * Physical rigid-pose interpolation is kept separate from the existing
 * manifold4 retrieval quaternion. Both use four-component unit quaternions,
 * but they do not have the same semantics.
 *
 * Pose = translation in R^3 + orientation in SO(3), represented by a unit
 * quaternion on S^3 with antipodal identification q ~ -q.
 */
export const Vec3Schema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export type Vec3 = z.infer<typeof Vec3Schema>;

export const RotationQuaternionSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);
export type RotationQuaternion = z.infer<typeof RotationQuaternionSchema>;

export const RigidPoseV1Schema = z.object({
  translation: Vec3Schema,
  rotation: RotationQuaternionSchema,
}).strict();
export type RigidPoseV1 = z.infer<typeof RigidPoseV1Schema>;

const EPS = 1e-12;

export function lerpScalar(a: number, b: number, t: number): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(t)) throw new Error('LERP inputs must be finite');
  return a + t * (b - a);
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  Vec3Schema.parse(a);
  Vec3Schema.parse(b);
  return [lerpScalar(a[0], b[0], t), lerpScalar(a[1], b[1], t), lerpScalar(a[2], b[2], t)];
}

export function quaternionNorm(q: RotationQuaternion): number {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

export function normalizeRotationQuaternion(q: RotationQuaternion): RotationQuaternion {
  RotationQuaternionSchema.parse(q);
  const n = quaternionNorm(q);
  if (!(n > EPS)) throw new Error('rotation quaternion must have non-zero norm');
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

export function rotationQuaternionDot(a: RotationQuaternion, b: RotationQuaternion): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

export function negateRotationQuaternion(q: RotationQuaternion): RotationQuaternion {
  return [-q[0], -q[1], -q[2], -q[3]];
}

/**
 * Normalized linear interpolation. Useful for very small angular separations
 * and as a cheap approximation, but not constant-angular-velocity motion.
 */
export function nlerpRotationQuaternion(
  start: RotationQuaternion,
  end: RotationQuaternion,
  t: number,
  shortestPath = true,
): RotationQuaternion {
  let a = normalizeRotationQuaternion(start);
  let b = normalizeRotationQuaternion(end);
  if (shortestPath && rotationQuaternionDot(a, b) < 0) b = negateRotationQuaternion(b);
  return normalizeRotationQuaternion([
    lerpScalar(a[0], b[0], t),
    lerpScalar(a[1], b[1], t),
    lerpScalar(a[2], b[2], t),
    lerpScalar(a[3], b[3], t),
  ]);
}

/**
 * Shortest-path SLERP on unit quaternions. The q/-q sign flip is required
 * because both quaternions encode the same physical orientation. For nearly
 * identical rotations the formula becomes numerically ill-conditioned, so we
 * fall back to normalized LERP.
 */
export function slerpRotationQuaternion(
  start: RotationQuaternion,
  end: RotationQuaternion,
  t: number,
  linearFallbackDot = 0.9995,
): RotationQuaternion {
  if (!Number.isFinite(t)) throw new Error('SLERP parameter t must be finite');
  let a = normalizeRotationQuaternion(start);
  let b = normalizeRotationQuaternion(end);
  let dot = rotationQuaternionDot(a, b);

  if (dot < 0) {
    b = negateRotationQuaternion(b);
    dot = -dot;
  }
  dot = Math.max(-1, Math.min(1, dot));

  if (dot >= linearFallbackDot) return nlerpRotationQuaternion(a, b, t, false);

  const theta0 = Math.acos(dot);
  const sinTheta0 = Math.sin(theta0);
  if (Math.abs(sinTheta0) < EPS) return nlerpRotationQuaternion(a, b, t, false);

  const theta = theta0 * t;
  const s0 = Math.sin(theta0 - theta) / sinTheta0;
  const s1 = Math.sin(theta) / sinTheta0;
  return normalizeRotationQuaternion([
    s0 * a[0] + s1 * b[0],
    s0 * a[1] + s1 * b[1],
    s0 * a[2] + s1 * b[2],
    s0 * a[3] + s1 * b[3],
  ]);
}

/** Full physical rotation angle in radians, invariant to q versus -q. */
export function rotationAngularDistance(a: RotationQuaternion, b: RotationQuaternion): number {
  const aa = normalizeRotationQuaternion(a);
  const bb = normalizeRotationQuaternion(b);
  const dot = Math.min(1, Math.max(0, Math.abs(rotationQuaternionDot(aa, bb))));
  return 2 * Math.acos(dot);
}

/**
 * SE(3)-style interpolation policy used for fixtures and routing previews:
 * translation follows a Euclidean straight line; orientation follows the
 * shortest rotational geodesic through quaternion SLERP.
 */
export function interpolateRigidPose(start: RigidPoseV1, end: RigidPoseV1, t: number): RigidPoseV1 {
  RigidPoseV1Schema.parse(start);
  RigidPoseV1Schema.parse(end);
  return RigidPoseV1Schema.parse({
    translation: lerpVec3(start.translation, end.translation, t),
    rotation: slerpRotationQuaternion(start.rotation, end.rotation, t),
  });
}

export const PoseInterpolationReceiptV1Schema = z.object({
  schema: z.literal('atlas.pose-interpolation-receipt.v1'),
  translationMethod: z.literal('LERP_R3'),
  rotationMethod: z.literal('SLERP_S3'),
  shortestRotationPath: z.literal(true),
  physicalPoseSemantics: z.literal(true),
  manifold4RetrievalSemantics: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();

export function buildPoseInterpolationReceipt(producerRevision: string) {
  return PoseInterpolationReceiptV1Schema.parse({
    schema: 'atlas.pose-interpolation-receipt.v1',
    translationMethod: 'LERP_R3',
    rotationMethod: 'SLERP_S3',
    shortestRotationPath: true,
    physicalPoseSemantics: true,
    manifold4RetrievalSemantics: false,
    producerRevision,
  });
}
