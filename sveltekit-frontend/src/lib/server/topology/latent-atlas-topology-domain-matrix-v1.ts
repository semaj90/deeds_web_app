/**
 * LATENT_ATLAS_TOPOLOGY_DOMAIN_MATRIX_V1
 *
 * Latent Matrix Infrastructure for Atlas Topology Domain Mapping:
 * - 4D Topology Manifold Coordinates with Unit Quaternion SLERP
 * - EmbeddingGemma 768D Canonical Alignment
 * - 4096-Dimensional Hidden State Alignment for Gemma/Ornith Models
 * - SOM (20x20 Grid) & KMeans (K=128) Clustering Projections
 * - Procedural Sequence ID Binding to PostgreSQL 18 atlas_procedural_sequences_v1
 * - Strict Zod Validation & Deterministic Checksum Generation
 */

import { z } from 'zod';
import { createHash } from 'node:crypto';
import { ATLAS_TOPOLOGY_POLICY_V1 } from './topology-policy-v1.js';

// ── 1. Sub-Schemas ──────────────────────────────────────────────────────────

/** 6-channel normalized low-rank feature channels: [dense, lex, struct, dom, rec, util] */
export const Channel6FeaturesSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]);
export type Channel6Features = z.infer<typeof Channel6FeaturesSchema>;

/** 4D Manifold Unit Quaternion Coordinate [x, y, z, w] */
export const Coordinate4DSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]).refine(([x, y, z, w]) => {
  const normSq = x * x + y * y + z * z + w * w;
  return Math.abs(normSq - 1.0) < 1e-3;
}, { message: 'Coordinate4D must be a normalized unit quaternion (norm ≈ 1.0)' });
export type Coordinate4D = z.infer<typeof Coordinate4DSchema>;

/** SOM 20x20 Grid Coordinate */
export const SomCoordinateSchema = z.object({
  row: z.number().int().min(0).max(ATLAS_TOPOLOGY_POLICY_V1.som.grid_height - 1),
  col: z.number().int().min(0).max(ATLAS_TOPOLOGY_POLICY_V1.som.grid_width - 1),
  cellIndex: z.number().int().min(0).max(ATLAS_TOPOLOGY_POLICY_V1.som.total_cells - 1),
});
export type SomCoordinate = z.infer<typeof SomCoordinateSchema>;

/** 4096 Hidden State Alignment Metadata (Gemma / Ornith) */
export const HiddenState4096AlignmentSchema = z.object({
  modelId: z.string().min(1),
  hiddenDimension: z.literal(4096),
  projectionDimension: z.number().int().positive().default(768),
  scaleFactor: z.number().positive().default(1.0),
  activationFunction: z.enum(['gelu', 'silu', 'geglu', 'swiglu']).default('gelu'),
  contextualMlpAligned: z.boolean().default(true),
});
export type HiddenState4096Alignment = z.infer<typeof HiddenState4096AlignmentSchema>;

// ── 2. Primary Topology Domain Matrix Schema ────────────────────────────────

export const LatentAtlasTopologyDomainMatrixSchema = z.object({
  schema: z.literal('atlas.latent-topology-domain-matrix.v1'),
  matrixId: z.string().min(1),
  sequenceId: z.string().min(1),
  sequenceRevision: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  featureId: z.string().min(1),
  featureLabel: z.string().min(1),
  sourceRef: z.string().min(1),
  candidateOrdinal: z.number().int().nonnegative(),
  somCoordinate: SomCoordinateSchema,
  coord4D: Coordinate4DSchema,
  kmeansClusterId: z.number().int().min(0).max(ATLAS_TOPOLOGY_POLICY_V1.kmeans.runtime_k - 1),
  channel6Features: Channel6FeaturesSchema,
  presenceMask: z.number().int().min(0).max(63), // 6-bit mask
  contentEmbedding768Digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  hiddenAlignment: HiddenState4096AlignmentSchema,
  matrixChecksum: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
  generatedAt: z.string().datetime(),
});
export type LatentAtlasTopologyDomainMatrix = z.infer<typeof LatentAtlasTopologyDomainMatrixSchema>;

// ── 3. Mathematical Operations: SLERP & Normalization ───────────────────────

/**
 * Spherical Linear Interpolation (SLERP) for 4D unit quaternions.
 * Computes smooth, constant-velocity interpolation between q1 and q2 on S^3.
 *
 * ARCHITECTURAL CONSTRAINT:
 * SLERP is strictly a spatial/geometric orientation operator (for 3D/4D viewport cameras,
 * NES LOD streaming, and unit-sphere projections on S^3). It MUST NOT be used as the default
 * distance or ranking metric for heterogeneous topology signals (semantic similarity, graph PageRank,
 * SOM grid coordinates, and authority), which have distinct dimensional scales and semantics.
 * Heterogeneous topology ranking uses separately normalized, weighted Minkowski/Euclidean metrics
 * or Channel6 low-rank GEMM.
 *
 * @param q1 Initial unit quaternion [x, y, z, w]
 * @param q2 Target unit quaternion [x, y, z, w]
 * @param t Interpolation parameter in [0.0, 1.0]
 * @returns Interpolated normalized unit quaternion
 */
export function slerp4D(q1: Coordinate4D, q2: Coordinate4D, t: number): Coordinate4D {
  const clampedT = Math.max(0, Math.min(1, t));

  let [x1, y1, z1, w1] = q1;
  let [x2, y2, z2, w2] = q2;

  // Dot product (cosine of half-angle between quaternions)
  let dot = x1 * x2 + y1 * y2 + z1 * z2 + w1 * w2;

  // If negative, invert one quaternion to take the shortest path on S^3
  if (dot < 0.0) {
    dot = -dot;
    x2 = -x2;
    y2 = -y2;
    z2 = -z2;
    w2 = -w2;
  }

  // If very close, use linear interpolation to avoid division by zero
  if (dot > 0.9995) {
    const rx = x1 + clampedT * (x2 - x1);
    const ry = y1 + clampedT * (y2 - y1);
    const rz = z1 + clampedT * (z2 - z1);
    const rw = w1 + clampedT * (w2 - w1);
    const invNorm = 1.0 / Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw);
    return [rx * invNorm, ry * invNorm, rz * invNorm, rw * invNorm];
  }

  const theta0 = Math.acos(Math.max(-1.0, Math.min(1.0, dot)));
  const theta = theta0 * clampedT;
  const sinTheta = Math.sin(theta);
  const sinTheta0 = Math.sin(theta0);

  const s1 = Math.cos(theta) - dot * sinTheta / sinTheta0;
  const s2 = sinTheta / sinTheta0;

  const rx = s1 * x1 + s2 * x2;
  const ry = s1 * y1 + s2 * y2;
  const rz = s1 * z1 + s2 * z2;
  const rw = s1 * w1 + s2 * w2;

  const invNorm = 1.0 / Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw);
  return [rx * invNorm, ry * invNorm, rz * invNorm, rw * invNorm];
}

/**
 * Computes deterministic SHA-256 digest over topological matrix payload.
 */
export function computeTopologyMatrixChecksum(
  payload: Omit<LatentAtlasTopologyDomainMatrix, 'matrixChecksum'>
): string {
  const canonicalString = JSON.stringify({
    schema: payload.schema,
    matrixId: payload.matrixId,
    sequenceId: payload.sequenceId,
    sequenceRevision: payload.sequenceRevision,
    featureId: payload.featureId,
    featureLabel: payload.featureLabel,
    sourceRef: payload.sourceRef,
    candidateOrdinal: payload.candidateOrdinal,
    somCoordinate: payload.somCoordinate,
    coord4D: payload.coord4D,
    kmeansClusterId: payload.kmeansClusterId,
    channel6Features: payload.channel6Features,
    presenceMask: payload.presenceMask,
    contentEmbedding768Digest: payload.contentEmbedding768Digest,
    hiddenAlignment: payload.hiddenAlignment,
    canonicalAuthority: false,
    writesPerformed: false,
  });
  return `sha256:${createHash('sha256').update(canonicalString, 'utf8').digest('hex')}`;
}

/**
 * Factory builder for LatentAtlasTopologyDomainMatrix with validated checksum.
 */
export function buildLatentTopologyDomainMatrix(
  input: Omit<LatentAtlasTopologyDomainMatrix, 'schema' | 'matrixChecksum' | 'canonicalAuthority' | 'writesPerformed' | 'generatedAt'>
): LatentAtlasTopologyDomainMatrix {
  const base = {
    ...input,
    schema: 'atlas.latent-topology-domain-matrix.v1' as const,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
    generatedAt: new Date().toISOString(),
  };

  const matrixChecksum = computeTopologyMatrixChecksum(base);
  const full = { ...base, matrixChecksum };

  return LatentAtlasTopologyDomainMatrixSchema.parse(full);
}
