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
	maxFetchedBytes?: number;
	maxCandidateExpansion?: number;
}

export type RlmPermittedOperation =
	| 'FILTER' | 'SORT' | 'GROUP' | 'SLICE' | 'FETCH_PACKET'
	| 'FETCH_AST' | 'FETCH_RELATION' | 'SUBCALL';

export interface RlmEnvironmentV1 {
	schema: 'atlas.rlm-environment.v1';
	contextArtifactId: string;
	candidateSnapshotRevision: string;
	ordinalMapChecksum: string;
	candidateOrdinals: number[];
	permittedOperations: RlmPermittedOperation[];
	maxDepth: number;
	maxSubcalls: number;
	maxTokens: number;
	maxWallClockMs: number;
	maxFetchedBytes: number;
	maxCandidateExpansion: number;
}

export interface RlmSearchRequest {
	requestId: string;
	workspaceRevision: string;
	policyRevision: string;
	query: string;
	filters?: Record<string, unknown>;
	topK?: number;
	budget: RlmBudget;
	environment?: RlmEnvironmentV1;
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
	failureCode?: 'RLM_PROGRAM_FAILED' | 'RLM_ENVIRONMENT_INVALID';
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
