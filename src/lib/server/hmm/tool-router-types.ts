export const HMM_TOOL_STATES = [
  'UNKNOWN',
  'SEARCH_CODE',
  'SEARCH_GRAPH',
  'SEARCH_SEMANTIC',
  'VALIDATE_PACKET',
  'SYNTHESIZE',
  'QUARANTINE',
] as const;

export type HmmToolState = (typeof HMM_TOOL_STATES)[number];

export const TOOL_IDS = [
  'rg.search',
  'ast_grep.search',
  'qdrant.search',
  'postgres.bm25',
  'neo4j.expand',
  'packet.validate',
  'gemma4.synthesize',
] as const;

export type ToolId = (typeof TOOL_IDS)[number];

export interface ToolObservation {
  query: string;
  keywordScore: number;
  astIntentScore: number;
  semanticScore: number;
  graphScore: number;
  packetValidationScore: number;
  priorToolSuccess: number;
  latencyScore: number;
  state?: HmmToolState;
}

export interface RankedTool {
  tool: ToolId;
  score: number;
  state: HmmToolState;
  allowed: boolean;
  reason: string;
}

export interface ToolRouterRules {
  gemma4RequiresPacketValidationMin: number;
  quarantineBlocksSynthesis: boolean;
  rgFirstForCodeLocation: boolean;
  rrfFinalRanking: boolean;
}

