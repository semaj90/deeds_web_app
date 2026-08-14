import type { AtlasSearchResponse } from '../retrieval/search-runtime-adapter.js';

export interface RlmBudget {
	maxDepth: number;
	maxSubcalls: number;
	maxSearchCalls: number;
	maxGraphExpansions: number;
	maxProcessLookups: number;
	maxPacketHydrations: number;
	maxSourceReads: number;
	maxPacketsHydrated: number;
	maxTokens: number;
	deadlineMs: number;
}

export interface RlmSearchRequest {
	requestId: string;
	workspaceRevision: string;
	policyRevision: string;
	query: string;
	filters?: Record<string, unknown>;
	topK?: number;
	budget: RlmBudget;
}

export interface RlmTraceStep {
	sequence: number;
	kind: 'SEARCH' | 'PACKET' | 'SOURCE' | 'GRAPH' | 'PROCESS' | 'RECURSE' | 'BUDGET' | 'LOOP';
	query?: string;
	selectedCanonicalIds?: string[];
	cacheStatus?: 'HIT' | 'MISS' | 'BYPASS';
	reason?: string;
	durationMs: number;
}

export interface RlmTrace {
	requestId: string;
	workspaceRevision: string;
	policyRevision: string;
	depthReached: number;
	subcalls: number;
	steps: RlmTraceStep[];
	status: 'COMPLETED' | 'BUDGET_EXHAUSTED' | 'DEGRADED' | 'FAILED';
}

export interface RlmSearchResult {
	response: AtlasSearchResponse;
	trace: RlmTrace;
}

export interface RlmInspectionTools {
	packet(packetKey: string): Promise<unknown>;
	source(sourceRef: string, span?: { start: number; end: number }): Promise<unknown>;
	graph(canonicalId: string, depth: number): Promise<unknown>;
	process(processId: string, name?: string): Promise<unknown>;
}
