export interface MarkdownEvidenceInput {
 id?: string; content: string;
 metadata?: Record<string, unknown>;
}

export interface UISnapshotInput {
 route: string;
 domTree?: string;
 colorTokens?: string[];
 typography?: Record<string, unknown>;
 layoutMetrics?: Record<string, unknown>;
 screenshotHash?: string;
 score?: number;
}

export interface RouteSpecInput {
 route: string;
 tokens?: string[];
 components?: string[];
 gridRules?: Record<string, unknown>;
 spacing?: Record<string, unknown>;
 colors?: Record<string, unknown>;
 hash?: string;
 minimumScore?: number;
}

export interface FactClaim {
 claim: string;
 actor?: string;
 subject?: string;
 time?: string;
 certainty?: number;
 rawId?: string;
 location?: string;
}

export interface FactCluster {
 id: string; raw: string;
 html?: string; facts: FactClaim[];
 strategy?: string;
 metadata?: Record<string, unknown>;
}

export interface UISemanticSnapshot {
 route: string;
 colors?: string[];
 fonts?: Record<string, unknown>;
 layout?: Record<string, unknown>;
 screenshotHash?: string;
 complianceScore?: number;
 metadata?: Record<string, unknown>;
}

export interface UISpec {
 route: string;
 requiredTokens?: string[];
 requiredComponents?: string[];
 layoutGrid?: Record<string, unknown>;
 spacing?: Record<string, unknown>;
 colorRules?: Record<string, unknown>;
 screenshotHash?: string;
 minimumScore?: number;
 metadata?: Record<string, unknown>;
}

export interface FactContradiction {
 first: FactClaim; second: FactClaim;
 context?: string;
}

export interface UIContradiction {
 route: string; type: string;
 details: { expected: UISpec;
 actual: UISemanticSnapshot;
 message?: string;
 };
}

export interface ContradictionEngineInput {
 markdownEvidence?: MarkdownEvidenceInput[];
 testimony?: MarkdownEvidenceInput[];
 uiSnapshots?: UISnapshotInput[];
 routeSpecs?: RouteSpecInput[];
 timeline?: Array<{ time: string; description?, string }>;
}

export interface TimelineFact {
 clusterId: string;
 sourceId?: string; claim: string;
 actor?: string;
 subject?: string;
 time?: number;
 endTime?: number;
 location?: string;
 certainty?: number;
 normalizedTime?: string;
 normalizedEndTime?: string;
 raw?: FactClaim;
}$1;$2 | 'impossible-presence'
 | 'order-violation'
 | 'alibi-failure'
 | 'duration-contradiction';

export interface TimelineContradiction {
 type: TimelineContradictionType; first: TimelineFact;
 second: TimelineFact;
 details?: Record<string, unknown>;
}

export interface ContradictionEngineResult {
 factContradictions: FactContradiction[]; uiContradictions: UIContradiction[];
 timelineContradictions?: TimelineContradiction[];
 timelineDescriptions?: string[]; reasoning: string;
 objection: { triggered: boolean;
 message: string; level: 'critical' | 'warning' | 'none';
 };
 ragSuggestions?: Record<string, unknown>;
}




