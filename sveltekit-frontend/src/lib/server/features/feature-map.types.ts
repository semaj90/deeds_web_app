export type FeaturePathKind =
  | 'types'
  | 'services'
  | 'routes'
  | 'tools'
  | 'tests'
  | 'docs'
  | 'svg'
  | 'proto';

export interface FeatureGraphEdge {
  relation:
    | 'CONTAINS'
    | 'REFERENCES'
    | 'IMPLEMENTS'
    | 'TESTS'
    | 'DOCUMENTS'
    | 'VISUALIZES'
    | 'DEFINES_PROTO'
    | 'SUPPORTS';
  from: string;
  to: string;
  confidence: number;
  source: 'frontmatter' | 'body' | 'file-metadata' | 'svg' | 'proto' | 'ast' | 'manual';
}

export interface FeatureGlyphBits {
  flags: number;
  hasTypes: boolean;
  hasServices: boolean;
  hasRoutes: boolean;
  hasTools: boolean;
  hasTests: boolean;
  hasDocs: boolean;
  hasSvg: boolean;
  hasProto: boolean;
  hasGraphEdges: boolean;
  hasGrpoMemory: boolean;
}

export interface FeatureGlyph {
  featureId: string;
  label: string;
  bits: FeatureGlyphBits;
  glyph: Uint8Array;
  svg: string;
  debugText: string;
}

export interface GrpoMemoryStick {
  featureId: string;
  queryHash: string;
  contextPacketHash: string;
  selectedSourceIds: string[];
  rejectedSourceIds: string[];
  rewardSignals: Array<{ name: string; value: number; source?: string }>;
  cacheKeys: string[];
  createdAt: string;
}

export interface FeatureMap {
  featureId: string;
  featureName: string;
  featureSlug: string;
  description: string;
  sourceMarkdown: string;
  frontmatter: Record<string, unknown>;
  pathGroups: Record<FeaturePathKind, string[]>;
  sourcePaths: string[];
  graphEdges: FeatureGraphEdge[];
  graphTriples: Array<[string, string, string]>;
  tokenEstimate: number;
  aceContextPacketDraft: Record<string, unknown>;
  glyph: FeatureGlyph;
  memoryStick: GrpoMemoryStick;
  
  // Graph-ML results
  attentionScore?: number;
  pagerankScore?: number;
  somCluster?: number;
  grpoReward?: number;
}

export interface FeatureCompileResult {
  featureMap: FeatureMap;
  graphTriples: Array<[string, string, string]>;
  glyph: FeatureGlyph;
  aceContextPacketDraft: Record<string, unknown>;
  memoryStick: GrpoMemoryStick;
  tokenEstimate: number;
  warnings: string[];
  storeWrites: unknown;
}
