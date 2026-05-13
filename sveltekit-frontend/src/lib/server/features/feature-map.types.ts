export type FeatureStatus = 'planning' | 'implemented' | 'broken' | 'deprecated';

export type FeatureGraphRelation =
  | 'IMPLEMENTS'
  | 'USES'
  | 'CALLS'
  | 'STATIC_IMPORTS'
  | 'DYNAMIC_IMPORTS'
  | 'DEPENDS_ON'
  | 'VISUALIZED_BY'
  | 'USES_SCHEMA'
  | 'USES_REDIS_KEY'
  | 'USES_QDRANT_COLLECTION'
  | 'USES_PROTO'
  | 'USES_GRPC_METHOD'
  | 'EXPORTS_SYMBOL'
  | 'NAPI_KERNEL'
  | 'ACE_CONTEXT_SOURCE'
  | 'CACHE_KEY'
  | 'GRPO_MEMORY';

export type FeatureGraphEdge = {
  source: string;
  relation: FeatureGraphRelation;
  target: string;
  confidence: number;
  sourceKind: 'ast' | 'rg' | 'svg' | 'proto' | 'llm' | 'runtime' | 'manual';
};

export const FeatureGlyphBits = {
  HAS_TYPES: 1 << 0,
  HAS_SERVICE: 1 << 1,
  HAS_ROUTE: 1 << 2,
  HAS_TOOL: 1 << 3,
  HAS_TEST: 1 << 4,
  HAS_DOCS: 1 << 5,
  HAS_GRAPH_EDGE: 1 << 6,
  HAS_CACHE_PACKET: 1 << 7
} as const;

export type FeatureGlyph = {
  featureId: string;
  width: 8;
  height: 8;
  bits: number[];
  mask: number;
  debugSvg?: string;
};

export type GrpoMemoryStick = {
  id: string;
  featureId?: string;
  queryHash: string;
  contextPacketHash: string;
  selectedSourceIds: string[];
  rejectedSourceIds: string[];
  rewardSignals: {
    compilePassed?: boolean;
    testsPassed?: boolean;
    userAccepted?: boolean;
    hallucinationDetected?: boolean;
    latencyMs?: number;
  };
  scores: {
    attentionScore?: number;
    grpoReward?: number;
    finalUtility?: number;
  };
  cacheKeys: {
    redis: string[];
    bitfrost: string[];
    qdrant: string[];
    neo4j: string[];
  };
};

export type FeatureMap = {
  featureId: string;
  title: string;
  status: FeatureStatus;
  paths: {
    featureNote?: string;
    types: string[];
    services: string[];
    apiRoutes: string[];
    uiComponents: string[];
    tools: string[];
    tests: string[];
    docs: string[];
    svgDiagrams: string[];
    protos: string[];
  };
  graphTriples: [string, string, string][];
  edges: FeatureGraphEdge[];
  summaries: {
    short: string;
    ace?: string;
    svg?: string[];
  };
  vectors?: {
    qdrantPointId?: string;
    encoded64?: number[];
  };
  scores?: {
    pagerank?: number;
    clusterPagerank?: number;
    karpathyBlend?: number;
    autoencoderScore?: number;
    attentionScore?: number;
    grpoUtility?: number;
  };
  glyph: FeatureGlyph;
  cache: {
    redisKeys: string[];
    bitfrostKeys: string[];
    qdrantPointIds: string[];
    neo4jNodeIds: string[];
    postgresPk?: string;
  };
};

export type FeatureCompileResult = {
  featureMap: FeatureMap;
  grpoMemoryStick?: GrpoMemoryStick;
  warnings: string[];
};
