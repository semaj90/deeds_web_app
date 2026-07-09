import type { HmmToolState, ToolId, ToolObservation, ToolRouterRules } from './tool-router-types';

export const DEFAULT_TOOL_ROUTER_RULES: ToolRouterRules = {
  gemma4RequiresPacketValidationMin: 0.8,
  quarantineBlocksSynthesis: true,
  rgFirstForCodeLocation: true,
  rrfFinalRanking: true,
};

const CODE_LOCATION_PATTERNS = [
  /\bwhere\b/i,
  /\bfile\b/i,
  /\bimplemented\b/i,
  /\bfunction\b/i,
  /\bclass\b/i,
  /\broute\b/i,
  /\bsymbol\b/i,
];

export function hasCodeLocationIntent(query: string): boolean {
  return CODE_LOCATION_PATTERNS.some((pattern) => pattern.test(query));
}

export function isToolAllowed(
  tool: ToolId,
  state: HmmToolState,
  obs: ToolObservation,
  rules: ToolRouterRules = DEFAULT_TOOL_ROUTER_RULES
): { allowed: boolean; reason: string } {
  if (state === 'QUARANTINE' && rules.quarantineBlocksSynthesis && tool === 'gemma4.synthesize') {
    return { allowed: false, reason: 'quarantine_blocks_synthesis' };
  }

  if (tool === 'gemma4.synthesize' && obs.packetValidationScore < rules.gemma4RequiresPacketValidationMin) {
    return { allowed: false, reason: 'packet_validation_below_threshold' };
  }

  return { allowed: true, reason: 'allowed' };
}

export function applyRuleBoosts(
  tool: ToolId,
  score: number,
  obs: ToolObservation,
  rules: ToolRouterRules = DEFAULT_TOOL_ROUTER_RULES
): number {
  if (!rules.rgFirstForCodeLocation || !hasCodeLocationIntent(obs.query)) return score;
  if (tool === 'rg.search') return score + 0.08;
  if (tool === 'ast_grep.search') return score + 0.06;
  return score;
}

