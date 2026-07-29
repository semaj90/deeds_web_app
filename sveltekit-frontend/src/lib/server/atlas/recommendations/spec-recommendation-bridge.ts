import { RecommendationSchema, type Recommendation, type RecommendationAction, type RecommendationDecision } from '../contracts/recommendation.js';

export type SpecRecommendationStatus =
  | 'ACTIVE_VERIFIED'
  | 'ACTIVE_DEGRADED'
  | 'IMPLEMENTED_UNWIRED'
  | 'DESIGN_ONLY'
  | 'DUPLICATED'
  | 'SUPERSEDED'
  | 'MISSING'
  | 'RUNTIME_PROOF_PENDING'
  | 'BLOCKED';

export interface SpecRecommendationInput {
  specId: string;
  title: string;
  status: SpecRecommendationStatus;
  sourceRef?: string | null;
  featureId?: string | null;
  featureLabel?: string | null;
  identityLane?: string | null;
  packetKey?: string | null;
  qdrantPointId?: string | number | null;
  treeNodeId?: string | null;
  communityId?: string | null;
  targetFiles?: string[];
  evidenceRefs?: string[];
  supersedes?: string[];
  mergedFrom?: string[];
  doNotDo?: string[];
  validationCommands?: string[];
  primaryAction?: RecommendationAction;
  confidence?: number;
  summary?: string;
}

export interface SpecRecommendationDraft {
  dryRun: true;
  status: SpecRecommendationStatus;
  action: RecommendationAction;
  recommendation: Recommendation;
  notes: string[];
}

const STATUS_TO_DECISION: Record<SpecRecommendationStatus, RecommendationDecision> = {
  ACTIVE_VERIFIED: 'patch_existing',
  ACTIVE_DEGRADED: 'merge_card',
  IMPLEMENTED_UNWIRED: 'create_card',
  DESIGN_ONLY: 'create_card',
  DUPLICATED: 'ask_permission',
  SUPERSEDED: 'ask_permission',
  MISSING: 'create_card',
  RUNTIME_PROOF_PENDING: 'merge_card',
  BLOCKED: 'ask_permission',
};

const STATUS_TO_ACTION: Record<SpecRecommendationStatus, RecommendationAction> = {
  ACTIVE_VERIFIED: 'stop_evidence_sufficient',
  ACTIVE_DEGRADED: 'generate_research_artifact',
  IMPLEMENTED_UNWIRED: 'repair_qdrant_identity_bridge',
  DESIGN_ONLY: 'open_blocked_task',
  DUPLICATED: 'open_blocked_task',
  SUPERSEDED: 'open_blocked_task',
  MISSING: 'generate_research_artifact',
  RUNTIME_PROOF_PENDING: 'generate_research_artifact',
  BLOCKED: 'open_blocked_task',
};

function normalizeSourceRef(sourceRef: string | null | undefined): string {
  const trimmed = String(sourceRef ?? '').trim();
  if (!trimmed) return 'unknown';
  return trimmed.replace(/\\/g, '/').replace(/\s+/g, ' ').toLowerCase();
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function riskForStatus(status: SpecRecommendationStatus): 'low' | 'medium' | 'high' {
  if (status === 'ACTIVE_VERIFIED') return 'low';
  if (status === 'ACTIVE_DEGRADED' || status === 'IMPLEMENTED_UNWIRED' || status === 'RUNTIME_PROOF_PENDING') return 'medium';
  return 'high';
}

function confidenceForStatus(status: SpecRecommendationStatus, explicitConfidence?: number): number {
  if (explicitConfidence !== undefined) return clampProbability(explicitConfidence);
  switch (status) {
    case 'ACTIVE_VERIFIED':
      return 0.95;
    case 'ACTIVE_DEGRADED':
      return 0.72;
    case 'IMPLEMENTED_UNWIRED':
      return 0.66;
    case 'RUNTIME_PROOF_PENDING':
      return 0.58;
    case 'DESIGN_ONLY':
      return 0.45;
    case 'MISSING':
      return 0.4;
    case 'DUPLICATED':
    case 'SUPERSEDED':
      return 0.25;
    case 'BLOCKED':
      return 0.3;
  }
}

export function buildSpecRecommendation(input: SpecRecommendationInput): SpecRecommendationDraft {
  const action = input.primaryAction ?? STATUS_TO_ACTION[input.status];
  const decision = STATUS_TO_DECISION[input.status];
  const confidence = confidenceForStatus(input.status, input.confidence);
  const sourceRef = normalizeSourceRef(input.sourceRef ?? input.specId);
  const summary = input.summary ?? `${input.status}: ${input.title}`;
  const recommendation = RecommendationSchema.parse({
    source_id: input.specId,
    source_ref: sourceRef,
    normalized_source_ref: sourceRef,
    feature_id: input.featureId ?? null,
    feature_label: input.featureLabel ?? input.title,
    packet_key: input.packetKey ?? null,
    identity_lane: input.identityLane ?? null,
    community_id: input.communityId ?? null,
    tree_node_id: input.treeNodeId ?? null,
    qdrant_point_id: input.qdrantPointId ?? null,
    kanban_card_id: `spec:${input.specId}`,
    decision,
    permission_level: input.status === 'ACTIVE_VERIFIED' ? 'patch_allowed' : 'read_only',
    target_files: input.targetFiles ?? [],
    evidence: {
      rg_matches: input.evidenceRefs ?? [input.specId],
      ast_matches: [],
      qdrant_hits: 0,
      graph_hits: 0,
      cache_hits: 0,
      rerank_score: confidence,
    },
    gemma4: {
      summary,
      risk: riskForStatus(input.status),
      rationale: `Derived from ${input.status} spec-tracking evidence without mutating canonical stores.`,
      priority: input.status === 'ACTIVE_VERIFIED' ? 'high' : input.status === 'BLOCKED' ? 'critical' : 'medium',
    },
    validation_commands: input.validationCommands ?? [`npm run atlas:spec:proof -- --spec=${input.specId}`],
    supersedes: input.supersedes ?? [],
    merged_from: input.mergedFrom ?? [],
    do_not_do: input.doNotDo ?? ['mutate canonical stores from the spec bridge stub'],
  });

  return {
    dryRun: true,
    status: input.status,
    action,
    recommendation,
    notes: [
      `spec_id=${input.specId}`,
      `status=${input.status}`,
      `decision=${decision}`,
      'dry-run only',
    ],
  };
}

export function buildSpecRecommendations(inputs: SpecRecommendationInput[]): SpecRecommendationDraft[] {
  return inputs.map((input) => buildSpecRecommendation(input));
}
