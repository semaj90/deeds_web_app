/**
 * Search and Vector Types
 */

// ── Platform Search (unified cross-domain) ───────────────────────────────

export type PlatformEntityType =
	| 'case'
	| 'evidence'
	| 'poi'
	| 'citation'
	| 'document'
	| 'glossary'
	| 'statute'
	| 'report'
	| 'message';

export type PlatformMatchType =
	| 'fts'
	| 'vector'
	| 'fused'
	| 'ilike'
	| 'qdrant'
	| 'semantic'  // RAPTOR summary atlas + thematic dense paths
	| 'agentic';  // AgenticSearchService — multi-query expansion + RRF

export interface PlatformSearchHit {
	id: string;
	entityType: PlatformEntityType;
	title: string;
	snippet: string;
	score: number;
	matchType: PlatformMatchType;
	route: string;
	caseId?: string;
	documentId?: string;
	nodeId?: string;
	chunkId?: string;
	jurisdiction?: string;
	corpusType?: string;
	sourceConfidence?: string;
	/** Optional citation references — populated by the legal FTS adapter */
	citations?: unknown[];
	metadata?: Record<string, unknown>;
}

export interface PlatformSearchTiming {
	totalMs: number;
	adapters: Record<string, { ms: number; count: number; status: 'ok' | 'error' | 'timeout' }>;
}

export interface PlatformSuggestion {
	text: string;
	source: 'heading' | 'citation' | 'document' | 'case' | 'evidence' | 'report';
}

export interface PlatformSearchResponse {
	hits: PlatformSearchHit[];
	groups: Record<PlatformEntityType, PlatformSearchHit[]>;
	totalResults: number;
	timing: PlatformSearchTiming;
}

// ── Legacy Search Types ──────────────────────────────────────────────────

export interface SearchResult {
  id: string;
	title: string;
  content: string;
	similarity: number;
  metadata?: Record<string, any>;
}

export interface SummaryResponse {
  summary: string;
	keyPoints: string[];
  metadata: {
	documentsProcessed: number;
    processingTime: number;
	lambda: number;
    sentenceCount?: number;
  };
  sources?: string[];
}

export interface SummaryRequest {
  documents: any[];
  maxSentences?: number;
  lambda?: number;
  type?: string;
}

export interface GPUChatMessage {
  id: string;
	role: 'user' | 'assistant' | 'system';
  content: string;
	timestamp: Date | string;
  embedding?: number[];
  metadata?: {
    model?: string;
    processingTime?: number;
    gpuUsed?: boolean;
    tokenCount?: number;
  };
}

export interface GPUProcessingStatus {
  gpuAvailable: boolean;
  cudaVersion?: string;
  gpuMemory?: {
	total: number;
    used: number;
	free: number;
  };
  activeJobs: number;
	queueLength: number;
}




