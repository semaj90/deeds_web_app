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

export function buildClusterFeatureProjectionV1(
  input: BuildClusterFeatureProjectionV1Input,
): ClusterFeatureProjectionV1 {
  const base = {
    schema: 'atlas.cluster-feature-projection.v1' as const,
    ...input,
    evidenceAuthority: false as const,
  };
  const projectionDigest = createHash('sha256').update(JSON.stringify(base)).digest('hex');
  return ClusterFeatureProjectionV1Schema.parse({ ...base, projectionDigest });
}
