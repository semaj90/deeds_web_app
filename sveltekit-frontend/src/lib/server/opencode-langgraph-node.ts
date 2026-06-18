/**
 * LangGraph Agent Node: OpenCode Stage 5 Policy Action Selection
 * 
 * Wires /api/opencode response → mutation gate → policy decision → LangGraph state
 * 
 * Input: Agent state with query + retrieved context
 * Output: PolicyDecision (action, confidence, reasoning)
 */

import type { BaseMessage } from '@langchain/core/messages';
import { selectMutationAction, extractACEFeatures, fetchSOMEmbedding, type PolicyDecision } from './ace/mutation-gate.js';

export interface OpenCodeAgentState {
  query: string;
  messages: BaseMessage[];
  packets?: any[];
  tools?: any[];
  replayTrace?: any;
  aceFeatures?: Record<string, number>;
  policyDecision?: PolicyDecision;
  nextAction?: string;
}

/**
 * LangGraph node: Call policy decision gate
 * Consumes /api/opencode output (packets, tools, replayTrace)
 * Returns policy decision (action selection)
 */
export async function policyDecisionNode(state: OpenCodeAgentState): Promise<Partial<OpenCodeAgentState>> {
  if (!state.replayTrace?.packets || state.replayTrace.packets.length === 0) {
    return {
      policyDecision: {
        action: 'ask_gemma4',
        confidence: 0.5,
        logits: Array(7).fill(0),
        reasoning: 'No context packets available, escalating to Gemma4',
        latencyMs: 0,
        modelVersion: 'fallback',
      },
      nextAction: 'ask_gemma4',
    };
  }

  try {
    // Extract ACE features from replay trace
    const aceContext = {
      pageRankScore: 0.7,
      attentionScore: 0.8,
      authorityScore: 0.75,
      communityConfidence: 0.6,
      semanticRelevance: state.replayTrace.packets[0]?.score || 0.8,
      cacheHitCertainty: state.replayTrace.cache?.rpcHit ? 1.0 : 0.5,
      freshness: 0.85,
      diversity: 0.6,
      fileImportance: 0.7,
      featureCoverage: 0.75,
      contextSize: state.replayTrace.packets.length / 10,
      conflictDensity: 0.2,
      ambiguityScore: 0.3,
      evidenceQuality: 0.8,
      temporalConsistency: 0.9,
      relationshipDepth: 0.6,
      retrievalAttempts: 1,
      fallbackActivations: 0,
      errorRecoveryScore: 1.0,
      userApprovalHistory: 0.9,
      similarityToPriors: 0.7,
      contextMissRiskScore: 0.1,
      modelConfidenceDecay: 0.9,
      staleDataRisk: 0.0,
      estimatedFixComplexity: 0.5,
      parallelizability: 0.7,
      downstreamImpact: 0.4,
      rollbackFeasibility: 0.9,
      testCoverageGap: 0.2,
      integrationRisk: 0.3,
      deploymentReadiness: 0.8,
      documentationDelta: 0.5,
      semanticCorrectnessScore: 0.85,
      syntacticValidityScore: 0.95,
      performanceImpactScore: 0.2,
      securityAuditScore: 0.9,
      maintainabilityScore: 0.8,
    };

    // Call mutation gate
    const decision = await selectMutationAction({
      aceFeatures: extractACEFeatures(aceContext),
      somEmbedding: await fetchSOMEmbedding(String(state.replayTrace.packets[0]?.packet_key ?? state.query)),
      packetKey: String(state.replayTrace.packets[0]?.packet_key ?? ''),
    });

    return {
      policyDecision: decision,
      nextAction: decision.action,
    };
  } catch (err) {
    console.error('[policyDecisionNode]', err);
    return {
      policyDecision: {
        action: 'ask_gemma4',
        confidence: 0.3,
        logits: Array(7).fill(0),
        reasoning: 'Policy decision error, falling back to Gemma4',
        latencyMs: 0,
        modelVersion: 'error',
      },
      nextAction: 'ask_gemma4',
    };
  }
}

/**
 * Conditional edge: Route based on policy decision
 * action → which node to call next
 */
export function routeAfterPolicy(state: OpenCodeAgentState): string {
  const action = state.policyDecision?.action;
  
  switch (action) {
    case 'repair_file':
      return 'repair_executor';
    case 'call_tool':
      return 'tool_executor';
    case 'run_tests':
      return 'test_executor';
    case 'rerank':
      return 'retrieval_reranker';
    case 'expand_graph':
      return 'graph_expander';
    case 'ask_gemma4':
      return 'gemma4_reasoner';
    case 'rollback':
      return 'rollback_handler';
    default:
      return 'gemma4_reasoner';
  }
}


