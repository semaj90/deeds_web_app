import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * ATLAS-FEATURE-CARD-V1
 * 
 * Reinterprets the 9 legacy fields (feature_id, domain_class, title_id, tree_node_id,
 * concept_ids, som_cluster, community_id, page_rank_score, embedding) as a compact
 * projection card with identity refs, symbolic compact refs, structural coordinates,
 * ranking, and representation references rather than raw float arrays.
 */

export const RepresentationRefsSchema = z
  .object({
    semantic768Ref: z.string().min(1),
    latent128Ref: z.string().min(1).optional(),
    latent64Ref: z.string().min(1).optional(),
  })
  .strict();

export const AtlasFeatureCardV1Schema = z
  .object({
    schema: z.literal('atlas.feature-card.v1'),
    canonicalId: z.string().min(1),
    sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    workspaceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),

    // Symbolic compact refs
    domainOrdinal: z.number().int().min(0).max(31),
    conceptOrdinals: z.array(z.number().int().min(0).max(511)),
    entityOrdinals: z.array(z.number().int().min(0).max(65535)).default([]),
    relationOrdinals: z.array(z.number().int().min(0).max(63)).default([]),

    // Structural coordinates
    treeNodeOrdinal: z.number().int().min(0).optional(),
    communityOrdinal: z.number().int().min(0).optional(),
    somCell: z.tuple([z.number().int(), z.number().int()]).optional(),

    // Ranking
    pageRank: z.number().min(0).max(1).default(0),
    centrality: z.number().min(0).max(1).default(0),

    // Representation references
    representationRefs: RepresentationRefsSchema,

    canonicalAuthority: z.literal(false),
    cardChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  })
  .strict();

export type AtlasFeatureCardV1 = z.infer<typeof AtlasFeatureCardV1Schema>;
export type RepresentationRefs = z.infer<typeof RepresentationRefsSchema>;

function sha256(value: string): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function buildAtlasFeatureCardV1(
  input: Omit<AtlasFeatureCardV1, 'schema' | 'canonicalAuthority' | 'cardChecksum'>,
): AtlasFeatureCardV1 {
  const cardData = {
    schema: 'atlas.feature-card.v1' as const,
    ...input,
    canonicalAuthority: false as const,
  };

  const cardChecksum = sha256(JSON.stringify(cardData));
  const fullCard: AtlasFeatureCardV1 = {
    ...cardData,
    cardChecksum,
  };

  return AtlasFeatureCardV1Schema.parse(fullCard);
}
