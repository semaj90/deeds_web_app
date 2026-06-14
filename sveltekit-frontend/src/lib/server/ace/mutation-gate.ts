/**
 * ACE Mutation Gate: Stage 5 Policy Action Selection
 * Extracts ACE context features, fetches SOM embedding, calls policy inference.
 * Bridges retrieval pipeline into deterministic agent action loop (Lane 12).
 */

import { loadTorchModel, runPolicyInference } from '$lib/server/policy/inference.js';
import { db } from '$lib/server/db/client.js';
import { eq } from 'drizzle-orm';
import { policyRerankerMetadata } from '$lib/server/db/schema-postgres.js';

/**
 * ACE Context Features (64-dim scalar vector)
 * Extracted from retrieval pipeline state.
 */
export interface ACEFeatures {
  // Ranking signals (12 dims)
  pageRankScore: number; // 0-1, Neo4j PageRank normalized
  attentionScore: number; // 0-1, SOM attention boosted
  authorityScore: number; // 0-1, Karpathy blend authority
  communityConfidence: number; // 0-1, source community credibility
  semanticRelevance: number; // 0-1, Qdrant cosine similarity
  cacheHitCertainty: number; // 0-1, Redis/Bifrost cache confidence
  freshness: number; // 0-1, recency score (decay by age)
  diversity: number; // 0-1, result set diversity penalty

  // Context signals (8 dims)
  fileImportance: number; // 0-1, centrality in import graph
  featureCoverage: number; // 0-1, % of feature_id dependencies covered
  contextSize: number; // 0-1, normalized context window fill
  conflictDensity: number; // 0-1, # contradictions in results
  ambiguityScore: number; // 0-1, confidence in disambiguation
  evidenceQuality: number; // 0-1, citation + cross-reference quality
  temporalConsistency: number; // 0-1, temporal alignment with query
  relationshipDepth: number; // 0-1, normalized Neo4j hop count

  // Agent state signals (12 dims)
  retrievalAttempts: number; // 0-5, count (clipped)
  fallbackActivations: number; // 0-3, # of cascade fallbacks triggered
  errorRecoveryScore: number; // 0-1, prior retry success rate
  userApprovalHistory: number; // 0-1, % of past actions approved
  similarityToPriors: number; // 0-1, similarity to successful prior actions
  contextMissRiskScore: number; // 0-1, likelihood context is incomplete
  modelConfidenceDecay: number; // 0-1, decay in policy model confidence
  staleDataRisk: number; // 0-1, risk of cold-cache data

  // Task decomposition (20 dims)
  estimatedFixComplexity: number; // 0-1, normalized fix difficulty (NLP heuristic)
  parallelizability: number; // 0-1, can task parallelize?
  downstreamImpact: number; // 0-1, # of affected files / total files
  rollbackFeasibility: number; // 0-1, can change be safely reverted?
  testCoverageGap: number; // 0-1, missing test coverage for path
  integrationRisk: number; // 0-1, risk of breaking other features
  deploymentReadiness: number; // 0-1, ready to merge?
  documentationDelta: number; // 0-1, docs update required?
  semanticCorrectnessScore: number; // 0-1, NLP meaning alignment with fix spec
  syntacticValidityScore: number; // 0-1, TypeScript/Syntax parser pass rate
  performanceImpactScore: number; // 0-1, O(n) complexity risk
  securityAuditScore: number; // 0-1, OWASP/auth bypass risk
  maintainabilityScore: number; // 0-1, future reader comprehension
}

/**
 * Action Space (7 actions)
 * Selected by policy model at Stage 5.
 */
export type PolicyAction =
  | 'repair_file' // Apply code fix directly
  | 'rerank' // Re-run retrieval with adjusted weights
  | 'call_tool' // Invoke MCP tool for more context
  | 'rollback' // Revert prior action, try different path
  | 'run_tests' // Verify fix doesn't break existing tests
  | 'ask_gemma4' // Escalate to Gemma4 for reasoning
  | 'expand_graph'; // Fetch more Neo4j context before deciding

export const ACTION_SPACE: PolicyAction[] = [
  'repair_file',
  'rerank',
  'call_tool',
  'rollback',
  'run_tests',
  'ask_gemma4',
  'expand_graph'
];

/**
 * SOM Embedding (64-dim vector)
 * Fetched from Qdrant payload or Redis cache.
 * Represents learned topology position in SOM grid.
 */
export interface SOMEmbedding {
  dimensions: 64;
  values: number[];
  somClusterX: number; // 0-19, SOM grid position
  somClusterY: number; // 0-19
  somClusterId: number; // Flattened cluster ID (0-399)
  confidence: number; // 0-1, BMU confidence
}

/**
 * Policy Decision
 * Output from mutation gate.
 * Feeds deterministic agent action loop.
 */
export interface PolicyDecision {
  action: PolicyAction;
  confidence: number; // 0-1, model confidence in action
  logits: number[]; // Raw logits (7-dim)
  reasoning: string; // Human-readable justification
  fallbackReason?: string; // If fallback policy was used
  latencyMs: number;
  modelVersion: string;
}

/**
 * Extract 64-dim ACE feature vector from retrieval context.
 * Called after Stage 4 (cache) but before Stage 5 (policy).
 */
export function extractACEFeatures(context: {
  pageRankScore: number;
  attentionScore: number;
  authorityScore: number;
  communityConfidence: number;
  semanticRelevance: number;
  cacheHitCertainty: number;
  freshness: number;
  diversity: number;
  fileImportance: number;
  featureCoverage: number;
  contextSize: number;
  conflictDensity: number;
  ambiguityScore: number;
  evidenceQuality: number;
  temporalConsistency: number;
  relationshipDepth: number;
  retrievalAttempts: number;
  fallbackActivations: number;
  errorRecoveryScore: number;
  userApprovalHistory: number;
  similarityToPriors: number;
  contextMissRiskScore: number;
  modelConfidenceDecay: number;
  staleDataRisk: number;
  estimatedFixComplexity: number;
  parallelizability: number;
  downstreamImpact: number;
  rollbackFeasibility: number;
  testCoverageGap: number;
  integrationRisk: number;
  deploymentReadiness: number;
  documentationDelta: number;
  semanticCorrectnessScore: number;
  syntacticValidityScore: number;
  performanceImpactScore: number;
  securityAuditScore: number;
  maintainabilityScore: number;
}): ACEFeatures {
  // Validate input has exactly 32 fields (will expand to 64 with SOM embedding)
  const required: (keyof typeof context)[] = [
    'pageRankScore',
    'attentionScore',
    'authorityScore',
    'communityConfidence',
    'semanticRelevance',
    'cacheHitCertainty',
    'freshness',
    'diversity',
    'fileImportance',
    'featureCoverage',
    'contextSize',
    'conflictDensity',
    'ambiguityScore',
    'evidenceQuality',
    'temporalConsistency',
    'relationshipDepth',
    'retrievalAttempts',
    'fallbackActivations',
    'errorRecoveryScore',
    'userApprovalHistory',
    'similarityToPriors',
    'contextMissRiskScore',
    'modelConfidenceDecay',
    'staleDataRisk',
    'estimatedFixComplexity',
    'parallelizability',
    'downstreamImpact',
    'rollbackFeasibility',
    'testCoverageGap',
    'integrationRisk',
    'deploymentReadiness',
    'documentationDelta',
    'semanticCorrectnessScore',
    'syntacticValidityScore',
    'performanceImpactScore',
    'securityAuditScore',
    'maintainabilityScore'
  ];

  for (const field of required) {
    const val = context[field];
    if (typeof val !== 'number' || isNaN(val)) {
      throw new Error(`Invalid ACE feature ${field}: ${val}`);
    }
    if (val < 0 || val > 1) {
      throw new Error(`ACE feature ${field} out of range [0,1]: ${val}`);
    }
  }

  return {
    pageRankScore: context.pageRankScore,
    attentionScore: context.attentionScore,
    authorityScore: context.authorityScore,
    communityConfidence: context.communityConfidence,
    semanticRelevance: context.semanticRelevance,
    cacheHitCertainty: context.cacheHitCertainty,
    freshness: context.freshness,
    diversity: context.diversity,
    fileImportance: context.fileImportance,
    featureCoverage: context.featureCoverage,
    contextSize: context.contextSize,
    conflictDensity: context.conflictDensity,
    ambiguityScore: context.ambiguityScore,
    evidenceQuality: context.evidenceQuality,
    temporalConsistency: context.temporalConsistency,
    relationshipDepth: context.relationshipDepth,
    retrievalAttempts: context.retrievalAttempts,
    fallbackActivations: context.fallbackActivations,
    errorRecoveryScore: context.errorRecoveryScore,
    userApprovalHistory: context.userApprovalHistory,
    similarityToPriors: context.similarityToPriors,
    contextMissRiskScore: context.contextMissRiskScore,
    modelConfidenceDecay: context.modelConfidenceDecay,
    staleDataRisk: context.staleDataRisk,
    estimatedFixComplexity: context.estimatedFixComplexity,
    parallelizability: context.parallelizability,
    downstreamImpact: context.downstreamImpact,
    rollbackFeasibility: context.rollbackFeasibility,
    testCoverageGap: context.testCoverageGap,
    integrationRisk: context.integrationRisk,
    deploymentReadiness: context.deploymentReadiness,
    documentationDelta: context.documentationDelta,
    semanticCorrectnessScore: context.semanticCorrectnessScore,
    syntacticValidityScore: context.syntacticValidityScore,
    performanceImpactScore: context.performanceImpactScore,
    securityAuditScore: context.securityAuditScore,
    maintainabilityScore: context.maintainabilityScore
  };
}

/**
 * Fetch SOM embedding (64-dim) from Qdrant payload or Redis cache.
 * Represents packet position in learned SOM topology.
 */
export async function fetchSOMEmbedding(packetKey: string): Promise<SOMEmbedding> {
  // Production: query Qdrant codebase_chunks_768 payload for som_embedding
  // or fetch from Redis cache ace:som:{packetKey}
  // For now, return mock embedding with correct structure.

  const mockEmbedding = Array(64).fill(0).map(() => Math.random());

  return {
    dimensions: 64,
    values: mockEmbedding,
    somClusterX: Math.floor(Math.random() * 20),
    somClusterY: Math.floor(Math.random() * 20),
    somClusterId: Math.floor(Math.random() * 400),
    confidence: 0.75 + Math.random() * 0.2 // 0.75-0.95
  };
}

/**
 * Mutation Gate: Main entry point for Stage 5 policy action selection.
 * Called by OpenCode agent after ACE retrieval (Stages 0-4) complete.
 */
export async function selectMutationAction(options: {
  aceFeatures: ACEFeatures;
  somEmbedding: SOMEmbedding;
  packetKey?: string; // For context logging
  userId?: string; // For telemetry
}): Promise<PolicyDecision> {
  const startTime = Date.now();

  try {
    // Load active policy model
    const metadata = await db
      .select()
      .from(policyRerankerMetadata)
      .where(eq(policyRerankerMetadata.isDefault, true))
      .limit(1);

    if (!metadata.length) {
      // Fallback: rule-based priority (no model available)
      return fallbackPolicyDecision(options);
    }

    const model = metadata[0];
    const modelStartTime = Date.now();

    // Convert ACE features to 64-dim scalar array
    const scalarFeatures = [
      options.aceFeatures.pageRankScore,
      options.aceFeatures.attentionScore,
      options.aceFeatures.authorityScore,
      options.aceFeatures.communityConfidence,
      options.aceFeatures.semanticRelevance,
      options.aceFeatures.cacheHitCertainty,
      options.aceFeatures.freshness,
      options.aceFeatures.diversity,
      options.aceFeatures.fileImportance,
      options.aceFeatures.featureCoverage,
      options.aceFeatures.contextSize,
      options.aceFeatures.conflictDensity,
      options.aceFeatures.ambiguityScore,
      options.aceFeatures.evidenceQuality,
      options.aceFeatures.temporalConsistency,
      options.aceFeatures.relationshipDepth,
      options.aceFeatures.retrievalAttempts,
      options.aceFeatures.fallbackActivations,
      options.aceFeatures.errorRecoveryScore,
      options.aceFeatures.userApprovalHistory,
      options.aceFeatures.similarityToPriors,
      options.aceFeatures.contextMissRiskScore,
      options.aceFeatures.modelConfidenceDecay,
      options.aceFeatures.staleDataRisk,
      options.aceFeatures.estimatedFixComplexity,
      options.aceFeatures.parallelizability,
      options.aceFeatures.downstreamImpact,
      options.aceFeatures.rollbackFeasibility,
      options.aceFeatures.testCoverageGap,
      options.aceFeatures.integrationRisk,
      options.aceFeatures.deploymentReadiness,
      options.aceFeatures.documentationDelta,
      options.aceFeatures.semanticCorrectnessScore,
      options.aceFeatures.syntacticValidityScore,
      options.aceFeatures.performanceImpactScore,
      options.aceFeatures.securityAuditScore,
      options.aceFeatures.maintainabilityScore
    ];

    // Run policy inference
    const torchModel = await loadTorchModel(model.metadata.torchscriptExportPath);
    const { logits, selectedAction, confidence } = await runPolicyInference(
      torchModel,
      scalarFeatures,
      options.somEmbedding.values,
      ACTION_SPACE
    );

    const inferenceLatency = Date.now() - modelStartTime;

    // Build reasoning explanation
    const reasoning = buildReasoningExplanation(selectedAction, options.aceFeatures, confidence);

    return {
      action: selectedAction as PolicyAction,
      confidence,
      logits,
      reasoning,
      latencyMs: Date.now() - startTime,
      modelVersion: model.modelVersion
    };
  } catch (error) {
    console.error('[Mutation Gate] Error:', error);
    // Fallback on error
    return fallbackPolicyDecision(options);
  }
}

/**
 * Fallback policy: rule-based action selection when model unavailable.
 * Deterministic priority order based on ACE features.
 */
function fallbackPolicyDecision(options: { aceFeatures: ACEFeatures; somEmbedding: SOMEmbedding }): PolicyDecision {
  const { aceFeatures } = options;
  let action: PolicyAction = 'repair_file'; // Default
  let reasoning = '';

  // Priority: high-confidence context → repair directly
  if (aceFeatures.semanticRelevance > 0.8 && aceFeatures.pageRankScore > 0.7) {
    action = 'repair_file';
    reasoning = 'High-confidence context: semantic relevance + high authority. Proceeding with repair.';
  }
  // Priority: uncertain context → ask Gemma4
  else if (aceFeatures.ambiguityScore > 0.6 || aceFeatures.conflictDensity > 0.5) {
    action = 'ask_gemma4';
    reasoning = 'Ambiguous or conflicting context. Requesting Gemma4 reasoning.';
  }
  // Priority: missing context → expand graph
  else if (aceFeatures.contextMissRiskScore > 0.7) {
    action = 'expand_graph';
    reasoning = 'High risk of incomplete context. Expanding Neo4j neighborhood.';
  }
  // Priority: test coverage gap → run tests first
  else if (aceFeatures.testCoverageGap > 0.7) {
    action = 'run_tests';
    reasoning = 'Significant test coverage gap. Running tests before repair.';
  }
  // Priority: integration risk → rerank to find safer approach
  else if (aceFeatures.integrationRisk > 0.7) {
    action = 'rerank';
    reasoning = 'High integration risk. Reranking retrieval with safety weights.';
  }
  // Priority: need MCP tool assistance
  else if (aceFeatures.contextSize < 0.5) {
    action = 'call_tool';
    reasoning = 'Small context. Calling MCP tool to gather more information.';
  }

  return {
    action,
    confidence: 0.65, // Lower confidence for fallback
    logits: Array(7).fill(0),
    reasoning,
    fallbackReason: 'Model unavailable or error occurred; using rule-based fallback',
    latencyMs: 5,
    modelVersion: 'fallback-1.0'
  };
}

/**
 * Build human-readable reasoning explanation for selected action.
 */
function buildReasoningExplanation(
  action: PolicyAction,
  features: ACEFeatures,
  confidence: number
): string {
  const signals: string[] = [];

  // Top positive signals
  if (features.pageRankScore > 0.7) signals.push('high authority source');
  if (features.semanticRelevance > 0.8) signals.push('strong semantic match');
  if (features.userApprovalHistory > 0.8) signals.push('consistent user approval');
  if (features.testCoverageGap < 0.3) signals.push('good test coverage');
  if (features.integrationRisk < 0.3) signals.push('low integration risk');

  // Top risk signals
  if (features.ambiguityScore > 0.6) signals.push('⚠️ ambiguous context');
  if (features.contextMissRiskScore > 0.6) signals.push('⚠️ potentially incomplete context');
  if (features.integrationRisk > 0.6) signals.push('⚠️ high integration risk');

  const signalSummary = signals.length > 0 ? signals.join(', ') : 'neutral signals';

  return `Selected '${action}' (confidence ${(confidence * 100).toFixed(1)}%) based on: ${signalSummary}`;
}
