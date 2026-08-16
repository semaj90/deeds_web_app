import { createHash } from 'node:crypto';
import { z } from 'zod';

export const ResolutionStatusSchema = z.enum([
  'PROVEN',
  'AMBIGUOUS',
  'STABLE_APPROXIMATION',
  'REVISION_CONFLICT',
  'BOUNDARY_EXHAUSTED',
]);
export type ResolutionStatus = z.infer<typeof ResolutionStatusSchema>;

export const ResourceEnvelopeV1Schema = z
  .object({
    maxVramBytes: z.number().int().nonnegative(),
    maxContextTokens: z.number().int().positive(),
    maxCandidates: z.number().int().positive(),
    maxGraphHops: z.number().int().nonnegative(),
    maxHyperedges: z.number().int().nonnegative(),
    maxToolCalls: z.number().int().nonnegative(),
    maxWallMs: z.number().int().positive(),
  })
  .strict();
export type ResourceEnvelopeV1 = z.infer<typeof ResourceEnvelopeV1Schema>;

export const ResolutionRevisionSetSchema = z
  .object({
    workspaceRevision: z.string().min(1),
    sourceRevision: z.string().min(1),
    graphRevision: z.string().min(1),
    featureRevision: z.string().min(1),
  })
  .strict();
export type ResolutionRevisionSet = z.infer<typeof ResolutionRevisionSetSchema>;

export interface CandidateIdentityRef {
  canonicalId: string;
  identityStatus: 'canonical' | 'degraded';
}

export interface CandidateFiberV1 {
  revision: string;
  candidates: CandidateIdentityRef[];
}

export interface CandidateSetStability {
  previousK: number;
  currentK: number;
  intersection: number;
  union: number;
  delta: number;
  stable: boolean;
}

export interface ResolutionBudgetUsage {
  vramBytes?: number;
  contextTokens?: number;
  candidates?: number;
  graphHops?: number;
  hyperedges?: number;
  toolCalls?: number;
  wallMs?: number;
}

export interface BoundedResolutionReceiptV1 {
  schemaVersion: 'atlas.bounded-resolution.v1';
  requestId: string;
  revisions: ResolutionRevisionSet;
  envelope: ResourceEnvelopeV1;
  usage: ResolutionBudgetUsage;
  status: ResolutionStatus;
  stability?: CandidateSetStability;
  selectedCanonicalIds: string[];
  unresolvedCanonicalIds: string[];
  reasonCodes: string[];
  checksum: string;
}

function canonicalIds(candidates: readonly CandidateIdentityRef[]): string[] {
  return [...new Set(candidates.map((candidate) => candidate.canonicalId.trim()).filter(Boolean))].sort();
}

/**
 * Candidate-set change metric from the bounded-search design:
 *   delta = 1 - |C_k ∩ C_2k| / |C_k ∪ C_2k|
 * This is Jaccard distance. A value near zero means expansion has stabilized.
 */
export function measureCandidateSetStability(
  previous: readonly CandidateIdentityRef[],
  current: readonly CandidateIdentityRef[],
  previousK: number,
  currentK: number,
  epsilon = 0.05,
): CandidateSetStability {
  const left = new Set(canonicalIds(previous));
  const right = new Set(canonicalIds(current));
  let intersection = 0;
  for (const id of left) if (right.has(id)) intersection++;
  const union = new Set([...left, ...right]).size;
  const delta = union === 0 ? 0 : 1 - intersection / union;
  return {
    previousK,
    currentK,
    intersection,
    union,
    delta: Number(delta.toFixed(6)),
    stable: delta <= epsilon,
  };
}

export function exhaustedDimensions(
  envelope: ResourceEnvelopeV1,
  usage: ResolutionBudgetUsage,
): string[] {
  const exhausted: string[] = [];
  if ((usage.vramBytes ?? 0) >= envelope.maxVramBytes && envelope.maxVramBytes > 0) exhausted.push('VRAM');
  if ((usage.contextTokens ?? 0) >= envelope.maxContextTokens) exhausted.push('CONTEXT_TOKENS');
  if ((usage.candidates ?? 0) >= envelope.maxCandidates) exhausted.push('CANDIDATES');
  if ((usage.graphHops ?? 0) >= envelope.maxGraphHops && envelope.maxGraphHops > 0) exhausted.push('GRAPH_HOPS');
  if ((usage.hyperedges ?? 0) >= envelope.maxHyperedges && envelope.maxHyperedges > 0) exhausted.push('HYPEREDGES');
  if ((usage.toolCalls ?? 0) >= envelope.maxToolCalls && envelope.maxToolCalls > 0) exhausted.push('TOOL_CALLS');
  if ((usage.wallMs ?? 0) >= envelope.maxWallMs) exhausted.push('WALL_TIME');
  return exhausted;
}

export function deriveResolutionStatus(input: {
  revisionConflict?: boolean;
  exactPromotionPassed?: boolean;
  identityGapResolved?: boolean;
  stability?: CandidateSetStability;
  envelope: ResourceEnvelopeV1;
  usage: ResolutionBudgetUsage;
}): { status: ResolutionStatus; reasonCodes: string[] } {
  if (input.revisionConflict) {
    return { status: 'REVISION_CONFLICT', reasonCodes: ['REVISION_MISMATCH'] };
  }

  const exhausted = exhaustedDimensions(input.envelope, input.usage);
  if (exhausted.length > 0 && !input.stability?.stable && !input.exactPromotionPassed) {
    return {
      status: 'BOUNDARY_EXHAUSTED',
      reasonCodes: exhausted.map((dimension) => `BUDGET_${dimension}_EXHAUSTED`),
    };
  }

  if (input.exactPromotionPassed && input.identityGapResolved) {
    return { status: 'PROVEN', reasonCodes: ['EXACT_PROMOTION_PASS', 'IDENTITY_GAP_RESOLVED'] };
  }

  if (input.stability?.stable) {
    return { status: 'STABLE_APPROXIMATION', reasonCodes: ['CANDIDATE_SET_STABLE'] };
  }

  return { status: 'AMBIGUOUS', reasonCodes: ['IDENTITY_NOT_YET_RESOLVED'] };
}

export function buildBoundedResolutionReceipt(input: Omit<BoundedResolutionReceiptV1, 'schemaVersion' | 'checksum'>): BoundedResolutionReceiptV1 {
  const stablePayload = {
    ...input,
    selectedCanonicalIds: [...new Set(input.selectedCanonicalIds)].sort(),
    unresolvedCanonicalIds: [...new Set(input.unresolvedCanonicalIds)].sort(),
    reasonCodes: [...new Set(input.reasonCodes)].sort(),
  };
  const checksum = createHash('sha256').update(JSON.stringify(stablePayload)).digest('hex');
  return {
    schemaVersion: 'atlas.bounded-resolution.v1',
    ...stablePayload,
    checksum,
  };
}
