import { z } from 'zod';

export const VarianceRecoverySchema = z.object({
  exactMatchFailed: z.boolean(),
  gitignoreState: z.object({
    visibleNormal: z.boolean(),
    visibleWithIgnored: z.boolean(),
    likelyGitignored: z.boolean()
  }).optional(),
  didYouMean: z.array(z.string()).default([]),
  qdrantTags: z.array(z.string()).default([]),
  langextractEntities: z.array(z.string()).default([]),
  semanticCacheHits: z.array(z.string()).default([]),
  nextSteps: z.array(z.string()).default([])
});

export type VarianceRecovery = z.infer<typeof VarianceRecoverySchema>;