/**
 * JSONB Ingestion Buffer — Pre-compiled codebase context for AI agent consumption.
 *
 * Karpathy-inspired: rather than letting external AI agents parse raw files,
 * we pre-serialize cluster-annotated, relevance-scored context into JSONB
 * documents optimized for context window budgets.
 */

export interface IngestionBufferFile {
	path: string;
	summary: string;
	pageRank: number;
	cluster: number;
	somCluster: number | null;
	importCount: number;
	importedBy: number;
	tags: string[];
}

export interface IngestionBufferEdge {
	from: string;
	to: string;
	type: 'imports' | 'similar_topology';
	weight: number;
}

export interface IngestionBuffer {
	version: 2;
	generatedAt: string;
	scope: 'cluster' | 'module' | 'route' | 'full';
	clusterId: number | null;
	k: number;

	/** Pre-compiled cluster narrative (from Step 1) */
	narrative: string;

	/** Ranked file list with metadata */
	files: IngestionBufferFile[];

	/** Graph edges (sparse adjacency) */
	edges: IngestionBufferEdge[];

	/** Estimated token count (cl100k) */
	tokenEstimate: number;

	/** Compression ratio vs raw file contents */
	compressionRatio: number;
}

export interface ContradictionLintEntry {
	type: 'membership_drift' | 'stale_narrative' | 'import_mismatch';
	clusterId: number;
	detail: string;
	severity: 'info' | 'warning' | 'error';
	timestamp: string;
}

export interface ContradictionLintResult {
	k: number;
	lintedAt: string;
	entries: ContradictionLintEntry[];
	clustersChecked: number;
	filesMoved: number;
}
