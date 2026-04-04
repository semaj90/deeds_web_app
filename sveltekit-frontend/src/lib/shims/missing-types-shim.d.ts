/**
 * Global type shims for types used across multiple files without explicit imports.
 * Only includes types with >0 actual usages in the codebase.
 *
 * Canonical type definitions live in:
 *   - src/lib/types/ai.ts (AIResponse, EnhancedRAGEngine)
 *   - src/lib/types/api.ts (CommandSearchRequest, CommandSearchResponse)
 *   - src/lib/stores/knowledge-search.svelte.ts (LLMProvider)
 *   - src/lib/types/rowlist-augment.d.ts (RowList)
 */

declare global {
	/** Worker thread message format (used by compute-pool, worker-embed) */
	type WorkerMessage = {
		taskId: string;
		type: 'status' | 'result' | 'error';
		data: Record<string, unknown>;
		timestamp: Date;
	};

	/** Vector/RAG search result (used by 12+ files: embedding cache, webgpu RAG, db queries) */
	type QueryResult = {
		content: string;
		score: number;
		sources?: unknown[];
	};
}

export {};
