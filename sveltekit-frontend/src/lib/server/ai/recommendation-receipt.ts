import { createHash } from 'node:crypto';
import type { RecommendationBudget, RecommendationPlan } from './resource-aware-recommendation-policy.js';

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
}

export function recommendationHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

/**
 * Telemetry/provenance representation for tool K/V inputs. We retain the
 * deterministic key set and a canonical checksum, but do not echo raw values
 * into recommendation traces where credentials or user content could leak.
 */
export function summarizeToolArgs(toolArgs: Record<string, unknown> | undefined): {
  keys: string[];
  checksum: string | null;
} {
  if (!toolArgs) return { keys: [], checksum: null };
  return {
    keys: Object.keys(toolArgs).sort(),
    checksum: recommendationHash(toolArgs),
  };
}

export interface RecommendationPlanReceiptV1 {
  schema: 'atlas.recommendation-plan-receipt.v1';
  receiptId: string;
  requestId: string;
  policyRevision: string;
  admissible: boolean;
  selectedLanes: string[];
  rejectedLanes: string[];
  blockingReasons: string[];
  budget: RecommendationBudget;
  observedCosts: Record<string, unknown>;
  toolArgKeys: string[];
  toolArgsChecksum: string | null;
  pagerankReceiptRef: string | null;
  hypergraphReceiptRef: string | null;
  candidateSnapshotRef: string | null;
  exactPromotionRefs: string[];
  producerRevision: string;
  checksum: string;
}

export function buildRecommendationPlanReceipt(input: {
  receiptId: string;
  requestId: string;
  policyRevision: string;
  plan: RecommendationPlan;
  budget: RecommendationBudget;
  toolArgs?: Record<string, unknown>;
  observedCosts?: Record<string, unknown>;
  pagerankReceiptRef?: string;
  hypergraphReceiptRef?: string;
  candidateSnapshotRef?: string;
  exactPromotionRefs?: string[];
  producerRevision: string;
}): RecommendationPlanReceiptV1 {
  const tool = summarizeToolArgs(input.toolArgs);
  const body = {
    schema: 'atlas.recommendation-plan-receipt.v1' as const,
    receiptId: input.receiptId,
    requestId: input.requestId,
    policyRevision: input.policyRevision,
    admissible: input.plan.admissible,
    selectedLanes: [...input.plan.selected],
    rejectedLanes: input.plan.rejected.map(({ lane, reason }) => `${lane}:${reason}`),
    blockingReasons: [...input.plan.blockingReasons],
    budget: input.budget,
    observedCosts: input.observedCosts ?? {},
    toolArgKeys: tool.keys,
    toolArgsChecksum: tool.checksum,
    pagerankReceiptRef: input.pagerankReceiptRef ?? null,
    hypergraphReceiptRef: input.hypergraphReceiptRef ?? null,
    candidateSnapshotRef: input.candidateSnapshotRef ?? null,
    exactPromotionRefs: [...new Set(input.exactPromotionRefs ?? [])].sort(),
    producerRevision: input.producerRevision,
  };
  return { ...body, checksum: recommendationHash(body) };
}
