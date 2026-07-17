/**
 * Recommendation Record
 *
 * Atlas should recommend more than documents. Every recommendation produced by
 * the agent loop is materialised as a typed record with evidence, expected gain,
 * risk, cost, confidence, and an approval requirement flag.
 *
 * Human-in-the-loop levels
 *   Observe   — search, summarise, diagnose (automatic)
 *   Recommend — propose plan/patch/research path (automatic, visibly labeled)
 *   Prepare   — create draft patch in workspace (automatic)
 *   Execute   — modify files/DB/deployments (approval required)
 */

export type RecommendationType =
  | 'next_source'          // Next document/chunk to read
  | 'missing_authority'    // Authoritative source not yet retrieved
  | 'contradictory_source' // Source that contradicts current conclusions
  | 'relevant_test'        // Test that should be run or written
  | 'likely_broken'        // Component likely to be broken
  | 'diagnostic_command'   // Suggested shell/query command to run
  | 'smallest_safe_patch'  // Minimal reversible code change
  | 'missing_gate'         // Validation or coverage gate that is absent
  | 'useful_tool'          // MCP/ACP tool to invoke
  | 'human_reviewer'       // Escalate to a person
  | 'workflow_change'      // Change in process or pipeline order
  | 'memory_reuse';        // Prior engram episode applicable here

export type FindingType =
  | 'retrieval_regression'
  | 'citation_broken'
  | 'stale_law'
  | 'duplicate_memory'
  | 'graph_centrality_stale'
  | 'test_gap'
  | 'schema_drift'
  | 'dependency_vulnerability'
  | 'agent_failure_cluster'
  | 'recommendation_mined';

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type CostEstimate = 'trivial' | 'low' | 'medium' | 'high' | 'very_high';

/**
 * Human-in-the-loop approval level for an action.
 *
 *   observe   — read-only; automatic
 *   recommend — produce labeled proposal; automatic
 *   prepare   — draft patch in temp workspace; automatic
 *   execute   — modify production files/DB; requires human approval
 */
export type ApprovalLevel = 'observe' | 'recommend' | 'prepare' | 'execute';

/** Approval rules derived from the action category */
export const APPROVAL_POLICY: Record<ApprovalLevel, { requiresApproval: boolean; description: string }> = {
  observe:   { requiresApproval: false, description: 'Read-only retrieval — automatic' },
  recommend: { requiresApproval: false, description: 'Draft report/proposal — automatic, visibly labeled' },
  prepare:   { requiresApproval: false, description: 'Patch in temporary workspace — automatic' },
  execute:   { requiresApproval: true,  description: 'Modify production code/data — approval required' },
};

// Hoisted to avoid recompilation on every classifyApprovalLevel call
const RE_EXECUTE = /delete|drop|overwrite|destroy|purge|apply|write|insert|update|migrate|deploy|push|send|publish/;
const RE_PREPARE = /create.*patch|propose.*patch|draft|prepare/;
const RE_RECOMMEND = /recommend|suggest|plan|report/;

/** Classify any action into its approval level */
export function classifyApprovalLevel(action: string): ApprovalLevel {
  const lower = action.toLowerCase();
  if (RE_EXECUTE.test(lower)) return 'execute';
  if (RE_PREPARE.test(lower)) return 'prepare';
  if (RE_RECOMMEND.test(lower)) return 'recommend';
  return 'observe';
}

/** Full recommendation record emitted by any Atlas agent or background job */
export interface RecommendationRecord {
  /** Stable UUID for dedup/audit trail */
  recommendationId: string;
  type: RecommendationType;
  /** Human-readable recommendation text */
  recommendation: string;
  /** Justification explaining why this recommendation was produced */
  why: string;
  /** IDs of evidence packets / sources that support this recommendation */
  evidenceIds: string[];
  /** Expected quality gain if recommendation is acted upon (0-1) */
  expectedGain: number;
  /** Risk of acting on this recommendation (0-1) */
  risk: number;
  cost: CostEstimate;
  /** Agent confidence in this recommendation (0-1) */
  confidence: number;
  approvalLevel: ApprovalLevel;
  requiresApproval: boolean;
  createdAt: Date;
  /** Optional: source finding that triggered this recommendation */
  sourceFindingId?: string;
}

/** Finding produced by background research / audit jobs */
export interface FindingRecord {
  findingId: string;
  findingType: FindingType;
  severity: Severity;
  /** Structured evidence supporting this finding */
  evidence: Array<{
    sourceRef: string;
    packetKey?: string;
    excerpt?: string;
    signalStrength: number; // 0-1
  }>;
  recommendedAction: string;
  confidence: number;
  requiresHumanReview: boolean;
  createdAt: Date;
  /** Recommendations spawned from this finding */
  recommendations?: RecommendationRecord[];
}

/** Hypothesis ranking used in the agentic error-fixing loop */
export interface HypothesisScore {
  /** Evidence match: how well evidence supports hypothesis */
  evidenceMatch: number;        // weight 0.25
  /** Historical success rate for similar fixes */
  historicalSuccess: number;    // weight 0.20
  /** How close the code path is to the failure site */
  codePathProximity: number;    // weight 0.15
  /** Signature similarity to known error patterns */
  errorSignatureMatch: number;  // weight 0.15
  /** Ease of reverting this fix (1 = trivially reversible) */
  reversibility: number;        // weight 0.10
  /** Ease of writing a targeted test */
  testability: number;          // weight 0.10
  /** Implementation effort (1 = trivial) */
  implementationEasiness: number; // weight 0.05
}

/** Compute hypothesis ranking score from component scores */
export function scoreHypothesis(h: HypothesisScore): number {
  return (
    0.25 * h.evidenceMatch +
    0.20 * h.historicalSuccess +
    0.15 * h.codePathProximity +
    0.15 * h.errorSignatureMatch +
    0.10 * h.reversibility +
    0.10 * h.testability +
    0.05 * h.implementationEasiness
  );
}

/** Recommendation scoring (did-you-mean, search suggestions) */
export interface DidYouMeanScore {
  editSimilarity: number;       // 0.30
  corpusFrequency: number;      // 0.20
  workspaceRelevance: number;   // 0.15
  semanticSimilarity: number;   // 0.15
  entityTypeCompatibility: number; // 0.10
  historicalAcceptance: number; // 0.10
}

export function scoreDidYouMean(s: DidYouMeanScore): number {
  return (
    0.30 * s.editSimilarity +
    0.20 * s.corpusFrequency +
    0.15 * s.workspaceRelevance +
    0.15 * s.semanticSimilarity +
    0.10 * s.entityTypeCompatibility +
    0.10 * s.historicalAcceptance
  );
}

/** PageRank-based recommendation score (§10 of audit) */
export interface PageRankRecommendationScore {
  retrievalRelevance: number;   // 0.30
  personalizedPageRank: number; // 0.15
  authorityImportance: number;  // 0.15
  coverageGain: number;         // 0.15
  novelty: number;              // 0.10
  contradictionValue: number;   // 0.10
  recentUtility: number;        // 0.05
}

export function scorePageRankRecommendation(s: PageRankRecommendationScore): number {
  return (
    0.30 * s.retrievalRelevance +
    0.15 * s.personalizedPageRank +
    0.15 * s.authorityImportance +
    0.15 * s.coverageGain +
    0.10 * s.novelty +
    0.10 * s.contradictionValue +
    0.05 * s.recentUtility
  );
}

/** Build a RecommendationRecord with defaults */
export function makeRecommendation(
  partial: Omit<RecommendationRecord, 'recommendationId' | 'requiresApproval' | 'createdAt'>
): RecommendationRecord {
  const { requiresApproval } = APPROVAL_POLICY[partial.approvalLevel];
  return {
    ...partial,
    recommendationId: crypto.randomUUID(),
    requiresApproval,
    createdAt: new Date(),
  };
}
