/**
 * Deterministic Tool Ranker — Phase 1 heuristic scoring
 *
 * Rules:
 * 1. Hard eligibility gates first (no amount of semantic similarity overrides)
 * 2. Weighted heuristic scores (not probabilities)
 * 3. Neutral defaults for missing evidence (assume 0.5)
 * 4. Deterministic ordering for ties
 */

import type {
  ToolCandidate,
  ToolDescriptor,
  RouterObservation,
  RouterConstraint,
} from './router-types.js';

// ── Eligibility Gates ────────────────────────────────────────────────────────

export function isEligible(
  tool: ToolDescriptor,
  obs: RouterObservation
): { eligible: boolean; reason?: string } {
  // Gate 1: Read-only constraint
  if (obs.constraints.readOnly && !tool.readOnly) {
    return { eligible: false, reason: 'read-only constraint violated' };
  }

  // Gate 2: Source-ref requirement
  if (obs.constraints.requiresExactSourceRefs && !tool.providesSourceRefs) {
    return { eligible: false, reason: 'requires exact source refs' };
  }

  // Gate 3: Service health
  const unhealthyServices = tool.requiresServices.filter(
    (s) => !obs.healthyServices.has(s)
  );
  if (unhealthyServices.length > 0) {
    return {
      eligible: false,
      reason: `unhealthy services: ${unhealthyServices.join(', ')}`,
    };
  }

  return { eligible: true };
}

// ── Scoring Functions (each returns [0, 1]) ─────────────────────────────────

function scoreSemanticSimilarity(tool: ToolDescriptor, query: string): number {
  // Placeholder: BM25 or EmbeddingGemma similarity
  // Returns normalized score [0, 1]
  // TODO: Wire to actual embedding/BM25 service
  const toolKeywords = [tool.name, tool.namespace, tool.description]
    .join(' ')
    .toLowerCase();
  const queryTokens = query.toLowerCase().split(/\s+/);
  const matches = queryTokens.filter((t) => toolKeywords.includes(t)).length;
  return Math.min(1, matches / Math.max(1, queryTokens.length));
}

function scoreIntentMatch(tool: ToolDescriptor, query: string): number {
  // Placeholder: Gemma intent classification
  // TODO: Wire to actual intent detection service
  // For now, return neutral default
  return 0.5;
}

function scoreSchemaFitness(tool: ToolDescriptor, _query: string): number {
  // Placeholder: Schema compatibility
  // TODO: Wire to actual argument matching logic
  // For now, assume tool is compatible
  return 0.8;
}

function scoreStateTransition(
  tool: ToolDescriptor,
  previousState: string
): number {
  // Placeholder: Legal state transition score
  // TODO: Wire to ALLOWED_TRANSITIONS + telemetry priors
  // For now, assume moderate fit
  return 0.6;
}

function scoreServiceHealth(tool: ToolDescriptor, obs: RouterObservation): number {
  // Fraction of required services that are healthy
  if (tool.requiresServices.length === 0) return 1.0;
  const healthy = tool.requiresServices.filter((s) =>
    obs.healthyServices.has(s)
  ).length;
  return healthy / tool.requiresServices.length;
}

function scoreHistoricalSuccess(
  tool: ToolDescriptor,
  telemetry: RouterObservation['telemetryContext']
): number {
  // If telemetry available, use measured success rate; else neutral default
  if (telemetry?.priorSuccessRate !== undefined) {
    return telemetry.priorSuccessRate;
  }
  return 0.5; // Neutral default: no prior evidence
}

function scoreProvenance(tool: ToolDescriptor): number {
  // Tools that provide source refs score higher (for source-ref tracking)
  return tool.providesSourceRefs ? 0.9 : 0.5;
}

function scoreLatency(tool: ToolDescriptor, telemetry?: RouterObservation['telemetryContext']): number {
  // Lower timeout = higher score
  // timeout > 30s → 0.3, 10-30s → 0.7, < 10s → 0.95
  if (tool.timeout < 10_000) return 0.95;
  if (tool.timeout <= 30_000) return 0.7;
  return 0.3;
}

function scoreTopology(_tool: ToolDescriptor, _query: string): number {
  // Placeholder: Neo4j graph alignment
  // TODO: Wire to actual topology scoring
  return 0.5; // Neutral default
}

// ── Composite Ranking ────────────────────────────────────────────────────────

const SCORE_WEIGHTS = {
  semantic: 0.30,
  intent: 0.18,
  schemaFitness: 0.15,
  transition: 0.10,
  health: 0.08,
  historicalSuccess: 0.07,
  provenance: 0.05,
  latency: 0.04,
  topology: 0.03,
};

export function scoreToolCandidate(
  tool: ToolDescriptor,
  obs: RouterObservation
): ToolCandidate {
  const semanticScore = scoreSemanticSimilarity(tool, obs.query);
  const intentScore = scoreIntentMatch(tool, obs.query);
  const schemaFitness = scoreSchemaFitness(tool, obs.query);
  const transitionScore = scoreStateTransition(tool, obs.previousState);
  const healthScore = scoreServiceHealth(tool, obs);
  const historicalSuccessScore = scoreHistoricalSuccess(tool, obs.telemetryContext);
  const provenanceScore = scoreProvenance(tool);
  const latencyScore = scoreLatency(tool, obs.telemetryContext);
  const topologyScore = scoreTopology(tool, obs.query);

  const compositeScore =
    SCORE_WEIGHTS.semantic * semanticScore +
    SCORE_WEIGHTS.intent * intentScore +
    SCORE_WEIGHTS.schemaFitness * schemaFitness +
    SCORE_WEIGHTS.transition * transitionScore +
    SCORE_WEIGHTS.health * healthScore +
    SCORE_WEIGHTS.historicalSuccess * historicalSuccessScore +
    SCORE_WEIGHTS.provenance * provenanceScore +
    SCORE_WEIGHTS.latency * latencyScore +
    SCORE_WEIGHTS.topology * topologyScore;

  const eligibility = isEligible(tool, obs);

  return {
    tool,
    eligible: eligibility.eligible,
    ineligibilityReason: eligibility.reason,
    semanticScore,
    intentScore,
    schemaFitness,
    transitionScore,
    healthScore,
    historicalSuccessScore,
    provenanceScore,
    latencyScore,
    topologyScore,
    compositeScore: eligibility.eligible ? compositeScore : -Infinity,
  };
}

// ── Rank Tools ───────────────────────────────────────────────────────────────

export function rankTools(
  tools: ToolDescriptor[],
  obs: RouterObservation
): ToolCandidate[] {
  const candidates = tools.map((tool) => scoreToolCandidate(tool, obs));

  // Filter to only eligible tools
  const eligible = candidates.filter((c) => c.eligible);

  // Sort by composite score (descending), then by tool name (deterministic tie-break)
  eligible.sort((a, b) => {
    if (Math.abs(a.compositeScore - b.compositeScore) > 1e-6) {
      return b.compositeScore - a.compositeScore;
    }
    return a.tool.name.localeCompare(b.tool.name);
  });

  return eligible;
}

// ── Top-K Selection ──────────────────────────────────────────────────────────

export function selectTopTools(
  candidates: ToolCandidate[],
  k: number = 3
): ToolCandidate[] {
  return candidates.slice(0, k);
}
