import {
  DEFAULT_TOOL_ROUTER_RULES,
  applyRuleBoosts,
  isToolAllowed,
} from './tool-router-rules';
import { toolObservationSchema } from './tool-router-schema';
import type { HmmToolState, RankedTool, ToolId, ToolObservation, ToolRouterRules } from './tool-router-types';

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, score);
}

export function inferToolState(obs: ToolObservation): HmmToolState {
  if (obs.state) return obs.state;
  if (obs.packetValidationScore < 0.05 && obs.semanticScore < 0.1 && obs.keywordScore < 0.1) {
    return 'UNKNOWN';
  }
  if (obs.packetValidationScore >= 0.8 && obs.semanticScore >= 0.4) return 'SYNTHESIZE';
  if (obs.packetValidationScore >= 0.55) return 'VALIDATE_PACKET';
  if (obs.graphScore >= Math.max(obs.keywordScore, obs.semanticScore, obs.astIntentScore)) return 'SEARCH_GRAPH';
  if (obs.semanticScore >= Math.max(obs.keywordScore, obs.astIntentScore)) return 'SEARCH_SEMANTIC';
  if (obs.keywordScore >= 0.45 || obs.astIntentScore >= 0.45) return 'SEARCH_CODE';
  return 'UNKNOWN';
}

export function scoreTools(obs: ToolObservation): Array<{ tool: ToolId; score: number }> {
  return [
    { tool: 'rg.search', score: 0.35 * obs.keywordScore + 0.25 * obs.astIntentScore + 0.05 * obs.latencyScore },
    { tool: 'ast_grep.search', score: 0.45 * obs.astIntentScore + 0.15 * obs.keywordScore },
    { tool: 'qdrant.search', score: 0.5 * obs.semanticScore + 0.08 * obs.priorToolSuccess },
    { tool: 'postgres.bm25', score: 0.45 * obs.keywordScore + 0.04 * obs.latencyScore },
    { tool: 'neo4j.expand', score: 0.5 * obs.graphScore },
    { tool: 'packet.validate', score: 0.6 * obs.packetValidationScore },
    { tool: 'gemma4.synthesize', score: obs.packetValidationScore >= 0.8 ? 0.4 + 0.12 * obs.semanticScore : 0 },
  ];
}

export function rankTools(
  observation: ToolObservation,
  rules: ToolRouterRules = DEFAULT_TOOL_ROUTER_RULES
): RankedTool[] {
  const obs = toolObservationSchema.parse(observation);
  const state = inferToolState(obs);

  return scoreTools(obs)
    .map(({ tool, score }) => {
      const allowed = isToolAllowed(tool, state, obs, rules);
      const boostedScore = allowed.allowed ? applyRuleBoosts(tool, clampScore(score), obs, rules) : 0;
      return {
        tool,
        score: boostedScore,
        state,
        allowed: allowed.allowed,
        reason: allowed.reason,
      };
    })
    .sort((a, b) => b.score - a.score || a.tool.localeCompare(b.tool));
}

export function bestSafeTool(obs: ToolObservation, rules: ToolRouterRules = DEFAULT_TOOL_ROUTER_RULES): RankedTool {
  return rankTools(obs, rules).find((tool) => tool.allowed) ?? {
    tool: 'packet.validate',
    score: 0,
    state: 'QUARANTINE',
    allowed: true,
    reason: 'fallback_validate_packet',
  };
}

