import { z } from 'zod';

const LEGACY_TRUST_TIER_MAP: Record<string, number> = {
  local_verified: 2,
  external_verified: 1,
  synthetic: 0,
  web_unverified: -1,
};

const TrustTierSchema = z.preprocess((value) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed in LEGACY_TRUST_TIER_MAP) {
      return LEGACY_TRUST_TIER_MAP[trimmed];
    }
    const parsed = Number(trimmed);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }
  return value;
}, z.number().int().min(-1).max(2));

export const InjectSummaryArgsSchema = z.object({
  summary: z.string().min(20).max(4000),
  sourceRefs: z.array(z.string()).min(1),
  furtherResearch: z.boolean().default(false),
  featureKey: z.string().optional(),
  trustTier: TrustTierSchema.default(2)
});

export type InjectSummaryArgs = z.infer<typeof InjectSummaryArgsSchema>;
