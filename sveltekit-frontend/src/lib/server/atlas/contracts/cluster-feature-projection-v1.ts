import { createHash } from 'node:crypto';
import { z } from 'zod';

/** ORF-4: rebuildable locality hints. Never evidence authority. */
export const ClusterFeatureProjectionV1Schema = z.object({
  schema: z.literal('atlas.cluster-feature-projection.v1'),
  packetKey: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceVersionReceiptId: z.string().min(1).nullable(),

  sourceRepresentationId: z.literal('semantic_768'),
  sourceRepresentationRevision: z.string().min(1),
  routingRepresentationId: z.literal('latent_64').nullable(),
  autoencoderRevision: z.string().min(1).nullable(),

  kmeans: z.object({
    clusterId: z.number().int().nonnegative().nullable(),
    probability: z.number().min(0).max(1).nullable(),
    distanceToCentroid: z.number().nonnegative().nullable(),
    algorithmRevision: z.string().min(1).nullable(),
    randomState: z.number().int().nullable(),
  }).strict(),

  som: z.object({
    row: z.number().int().nonnegative().nullable(),
    col: z.number().int().nonnegative().nullable(),
    distance: z.number().nonnegative().nullable(),
    algorithmRevision: z.string().min(1).nullable(),
  }).strict(),

  graphCommunity: z.object({
    communityId: z.string().min(1).nullable(),
    algorithm: z.enum(['leiden', 'louvain', 'other']).nullable(),
    algorithmRevision: z.string().min(1).nullable(),
    graphRevision: z.string().min(1).nullable(),
  }).strict(),

  evidenceAuthority: z.literal(false),
  producerRevision: z.string().min(1),
  projectionDigest: z.string().length(64),
}).strict();

export type ClusterFeatureProjectionV1 = z.infer<typeof ClusterFeatureProjectionV1Schema>;

export type BuildClusterFeatureProjectionV1Input = Omit<
  z.input<typeof ClusterFeatureProjectionV1Schema>,
  'schema' | 'evidenceAuthority' | 'projectionDigest'
>;

/** Stable across PostgreSQL jsonb key reordering and producer object construction order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildClusterFeatureProjectionV1(
  input: BuildClusterFeatureProjectionV1Input,
): ClusterFeatureProjectionV1 {
  const base = {
    schema: 'atlas.cluster-feature-projection.v1' as const,
    ...input,
    evidenceAuthority: false as const,
  };
  const projectionDigest = createHash('sha256').update(canonicalJson(base)).digest('hex');
  return ClusterFeatureProjectionV1Schema.parse({ ...base, projectionDigest });
}

/** Recompute the content digest; schema validity alone does not bind the digest to the fields. */
export function verifyClusterFeatureProjectionV1(value: unknown): ClusterFeatureProjectionV1 {
  const projection = ClusterFeatureProjectionV1Schema.parse(value);
  const {
    schema: _schema,
    evidenceAuthority: _evidenceAuthority,
    projectionDigest,
    ...input
  } = projection;
  const rebuilt = buildClusterFeatureProjectionV1(input);
  if (rebuilt.projectionDigest !== projectionDigest) {
    throw new Error('CLUSTER_FEATURE_PROJECTION_DIGEST_MISMATCH');
  }
  return projection;
}

/** Bind a cluster proposal to the exact packet and semantic representation row that produced it. */
export function assertClusterFeatureProjectionBindingV1(
  projection: ClusterFeatureProjectionV1,
  expected: {
    packetKey: string;
    sourceRef: string;
    sourceVersionReceiptId: string | null;
    representationId: string | null;
    representationRevision: string | null;
  },
): void {
  if (projection.packetKey !== expected.packetKey || projection.sourceRef !== expected.sourceRef) {
    throw new Error('CLUSTER_FEATURE_PROJECTION_IDENTITY_MISMATCH');
  }
  if (projection.sourceVersionReceiptId !== expected.sourceVersionReceiptId) {
    throw new Error('CLUSTER_FEATURE_PROJECTION_SOURCE_RECEIPT_MISMATCH');
  }
  if (projection.sourceRepresentationId !== 'semantic_768' || expected.representationId !== 'semantic_768') {
    throw new Error('CLUSTER_FEATURE_PROJECTION_REPRESENTATION_ID_MISMATCH');
  }
  if (!expected.representationRevision || projection.sourceRepresentationRevision !== expected.representationRevision) {
    throw new Error('CLUSTER_FEATURE_PROJECTION_REPRESENTATION_REVISION_MISMATCH');
  }
}
