// Canonical types shared across wiki modules.

export type GapSeverity = 'HIGH' | 'MED' | 'LOW';
export type GapStatus = 'open' | 'in_progress' | 'fixed' | 'wont_fix';

export type GapType =
	| 'dead_retrieval_lane'
	| 'orphan_file'
	| 'orphan_symbol'
	| 'schema_drift'
	| 'cache_read_without_write'
	| 'tool_exposure_mismatch'
	| 'vector_lane_mismatch'
	| 'context_gap'
	| 'test_gap'
	| 'concept_duplication';

export interface WikiGap {
	id: string;              // e.g. "gap_ace_001"
	title: string;
	severity: GapSeverity;
	type?: GapType;
	status: GapStatus;
	// 0–1: 0.30×centrality + 0.25×callers_affected + 0.20×retrieval_impact + 0.15×test_missing + 0.10×severity
	score?: number;
	summary: string;         // One sentence: what is missing
	why: string;             // Why it matters / impact
	patch: string;           // Where / what to fix
	affectedFiles: string[];
	affectedSymbols: string[];
	affectedRedisKeys: string[];
	affectedMcpTools: string[];
	discoveredByRun?: string; // run_id that found this
	fixedByCommit?: string;
	createdAt: string;
	updatedAt: string;
}

export interface WikiCard {
	id: string;              // e.g. "wiki:ace-multi-lane-retrieval"
	type: 'wiki_page';
	title: string;
	summary: string;
	files: string[];
	symbols: string[];
	gaps: string[];          // gap IDs
	redisKeys: string[];
	updatedAt: string;
}

export interface GapReport {
	runId: string;
	pipelineVersion: string;
	generatedAt: string;
	gaps: WikiGap[];
	summary: {
		total: number;
		high: number;
		med: number;
		low: number;
		open: number;
	};
}
