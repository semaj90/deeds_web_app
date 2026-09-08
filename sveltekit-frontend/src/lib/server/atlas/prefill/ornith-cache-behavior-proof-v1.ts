import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from './canonical-hash-v1.js';

const nonNegativeInteger = z.number().int().nonnegative();
const verdict = z.enum(['PROVEN_TRUE', 'PROVEN_FALSE', 'UNPROVEN']);

const parityChecksums = z.object({
  coldOutputChecksum: sha256HexSchema.nullable(),
  warmOutputChecksum: sha256HexSchema.nullable(),
  coldToolShapeChecksum: sha256HexSchema.nullable(),
  warmToolShapeChecksum: sha256HexSchema.nullable(),
}).strict();

export const OrnithCacheBehaviorProofV1Schema = z.object({
  schema: z.literal('atlas.ornith-cache-behavior-proof.v1'),
  proofRevision: z.string().min(1),
  runtimeRevision: z.string().min(1),
  modelRevision: z.string().min(1),
  probeMode: z.enum(['FIXTURE', 'LIVE_RUNTIME']),
  productionWritesPerformed: z.boolean(),
  runtimeCacheStateChanged: z.boolean(),
  sameIdentity: z.object({
    prefixIdentityChecksum: sha256HexSchema,
    telemetryAvailable: z.boolean(),
    coldCachedPrefillTokens: nonNegativeInteger,
    warmCachedPrefillTokens: nonNegativeInteger,
    warmNewPrefillTokens: nonNegativeInteger,
    verdict,
  }).strict(),
  outputParity: parityChecksums.extend({ verdict }).strict(),
  crossIdentityIsolation: z.object({
    identityAChecksum: sha256HexSchema,
    identityBChecksum: sha256HexSchema,
    telemetryAvailable: z.boolean(),
    cachedPrefillTokensObserved: nonNegativeInteger.nullable(),
    verdict,
  }).strict(),
  evidenceRefs: z.array(z.string().min(1)),
  checksumSha256: sha256HexSchema,
}).strict();

export type OrnithCacheBehaviorProofV1 = z.infer<typeof OrnithCacheBehaviorProofV1Schema>;

export interface BuildOrnithCacheBehaviorProofV1Input {
  proofRevision: string;
  runtimeRevision: string;
  modelRevision: string;
  probeMode: 'FIXTURE' | 'LIVE_RUNTIME';
  productionWritesPerformed: boolean;
  runtimeCacheStateChanged: boolean;
  sameIdentity: {
    prefixIdentityChecksum: string;
    telemetryAvailable: boolean;
    coldCachedPrefillTokens: number;
    warmCachedPrefillTokens: number;
    warmNewPrefillTokens: number;
  };
  outputParity: z.input<typeof parityChecksums>;
  crossIdentityIsolation: {
    identityAChecksum: string;
    identityBChecksum: string;
    telemetryAvailable: boolean;
    cachedPrefillTokensObserved: number | null;
  };
  evidenceRefs: string[];
}

function reuseVerdict(input: BuildOrnithCacheBehaviorProofV1Input['sameIdentity']): z.infer<typeof verdict> {
  if (!input.telemetryAvailable) return 'UNPROVEN';
  return input.warmCachedPrefillTokens > 0 ? 'PROVEN_TRUE' : 'PROVEN_FALSE';
}

function parityVerdict(input: BuildOrnithCacheBehaviorProofV1Input['outputParity']): z.infer<typeof verdict> {
  const checksums = [
    input.coldOutputChecksum,
    input.warmOutputChecksum,
    input.coldToolShapeChecksum,
    input.warmToolShapeChecksum,
  ];
  if (checksums.some((value) => value === null)) return 'UNPROVEN';
  return input.coldOutputChecksum === input.warmOutputChecksum
    && input.coldToolShapeChecksum === input.warmToolShapeChecksum
    ? 'PROVEN_TRUE'
    : 'PROVEN_FALSE';
}

function isolationVerdict(input: BuildOrnithCacheBehaviorProofV1Input['crossIdentityIsolation']): z.infer<typeof verdict> {
  if (input.identityAChecksum === input.identityBChecksum) {
    throw new Error('cache isolation requires distinct prefix identities');
  }
  if (!input.telemetryAvailable || input.cachedPrefillTokensObserved === null) return 'UNPROVEN';
  return input.cachedPrefillTokensObserved === 0 ? 'PROVEN_TRUE' : 'PROVEN_FALSE';
}

/**
 * Build a receipt for cache behavior experiments without persisting raw prompt,
 * token, tool-call, or KV state. A metadata report cannot satisfy this proof:
 * the verdicts require observed behavioral telemetry and output checksums.
 */
export function buildOrnithCacheBehaviorProofV1(
  input: BuildOrnithCacheBehaviorProofV1Input,
): OrnithCacheBehaviorProofV1 {
  const payload = {
    schema: 'atlas.ornith-cache-behavior-proof.v1' as const,
    proofRevision: input.proofRevision,
    runtimeRevision: input.runtimeRevision,
    modelRevision: input.modelRevision,
    probeMode: input.probeMode,
    productionWritesPerformed: input.productionWritesPerformed,
    runtimeCacheStateChanged: input.runtimeCacheStateChanged,
    sameIdentity: {
      ...input.sameIdentity,
      verdict: reuseVerdict(input.sameIdentity),
    },
    outputParity: {
      ...input.outputParity,
      verdict: parityVerdict(input.outputParity),
    },
    crossIdentityIsolation: {
      ...input.crossIdentityIsolation,
      verdict: isolationVerdict(input.crossIdentityIsolation),
    },
    evidenceRefs: input.evidenceRefs,
  };
  return OrnithCacheBehaviorProofV1Schema.parse({
    ...payload,
    checksumSha256: canonicalSha256V1(payload),
  });
}
