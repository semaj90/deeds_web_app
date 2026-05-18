export type AtlasNodeType = 'query' | 'cache' | 'chunk' | 'wiki' | 'feature' | 'source';

export interface AtlasNode {
	id: string;
	type: AtlasNodeType;
	label: string;
	position: { x: number; y: number };
	data: {
		source_ref?: string;
		chunk_id?: string;
		feature_key?: string;
		cluster_id?: string;
		qdrant_score?: number;
		pagerank_score?: number;
		topology_score?: number;
		redis_hot?: number;
		llm_synthesis_weight?: number;
		text?: string;
		topology4d?: { x: number; y: number; z: number; w: number };
	};
}

export interface AtlasEdge {
	id: string;
	source: string;
	target: string;
	label?: string;
}

export interface AtlasChunk {
	chunk_id: string;
	source_ref: string;
	text: string;
	score: number;
	signals: {
		cosine: number;
		pagerank: number;
		topology: number;
		hotness: number;
	};
	topology4d?: { x: number; y: number; z: number; w: number };
	aceFeatureKey?: string | null;
}

export interface AtlasRoutingSignals {
	queryLength: number;
	shortQuery: boolean;
	codeAnchors: boolean;
	procedural: boolean;
	debugging: boolean;
	architecture: boolean;
	lexicalHint: boolean;
}

export interface AtlasWeightProfile {
	cosine: number;
	pagerank: number;
	topology: number;
	total: number;
	adaptive: boolean;
	reasons: string[];
}

export interface AtlasRetrievalResult {
	mode: 'fast' | 'deep' | 'hybrid';
	query: string;
	confidence: number;
	latencyMs: number;
	cacheHit: boolean;
	lexicalFallback?: boolean;
	lexicalHitCount?: number;
	codebaseHitCount?: number;
	wikiHitCount?: number;
	effectiveWeights?: AtlasWeightProfile;
	routingSignals?: AtlasRoutingSignals;
	karpathyRev: string;
	chunks: AtlasChunk[];
	sourceRefs: string[];
}

export interface TraceStep {
	stage: string;
	durationMs: number;
	detail: string;
}

export interface AtlasQueryResponse {
	result: AtlasRetrievalResult;
	nodes: AtlasNode[];
	edges: AtlasEdge[];
	trace: TraceStep[];
}

export interface AtlasCacheStats {
	cartridgeCount: number;
	featureCardCount: number;
	karpathyScoreCount: number;
	topoCacheCount: number;
	topScoredFiles: Array<{ path: string; blend: number }>;
}

export interface AtlasHealthStatus {
	redis: { ok: boolean; latencyMs: number; detail?: string };
	qdrant: { ok: boolean; latencyMs: number; collections?: string[]; points?: Record<string, number>; detail?: string };
	neo4j: { ok: boolean; latencyMs: number; nodeCount?: number; detail?: string };
	ollama: { ok: boolean; latencyMs: number; models?: string[]; detail?: string };
	timestamp: string;
}

export const NODE_COLORS: Record<AtlasNodeType, string> = {
	query: '#7c3aed',
	cache: '#ea580c',
	chunk: '#2563eb',
	wiki: '#0d9488',
	feature: '#16a34a',
	source: '#d97706',
};

export const NODE_RADIUS: Record<AtlasNodeType, number> = {
	query: 28,
	cache: 20,
	chunk: 18,
	wiki: 18,
	feature: 16,
	source: 14,
};