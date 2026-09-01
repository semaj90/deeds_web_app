import { z } from 'zod';

export const OAK_KAG_NEIGHBOR_READ_STRICT_V1 = 'parent-atlas.kag.neighbor-read.strict.v1' as const;

export const oakKagNeighborInputV1Schema = z.object({
  canonicalIds: z.array(z.string().min(1)).min(1).max(256),
}).strict();

export const oakKagNeighborReceiptV1Schema = z.object({
  schema: z.literal('atlas.oak-kag-neighbor-receipt.v1'),
  implementationRef: z.literal(OAK_KAG_NEIGHBOR_READ_STRICT_V1),
  requestedCanonicalIds: z.number().int().nonnegative(),
  matchedTuples: z.number().int().nonnegative(),
  matchedHyperedges: z.number().int().nonnegative(),
  neighbors: z.array(z.object({
    canonicalId: z.string().min(1),
    hyperedgeIds: z.array(z.string().min(1)),
  }).strict()),
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict();

export type OakKagNeighborInputV1 = z.infer<typeof oakKagNeighborInputV1Schema>;
export type OakKagNeighborReceiptV1 = z.infer<typeof oakKagNeighborReceiptV1Schema>;
