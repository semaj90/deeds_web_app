/**
 * Search Store - Svelte 5 Runes (Session 30)
 *
 * Migrated from writable/derived pattern to class-based $state/$derived.
 * Replaces search.ts stub.
 */

export interface SearchResultChunk {
	id: string;
	content: string;
	score: number;
	metadata?: Record<string, unknown>;
	case_id?: string;
	chunk_index?: number;
	text_snippet?: string;
	langextract_tags: Record<string, string>;
	kag_context?: {
		nodes: Array<{ id: string; label: string }>;
		edges: Array<{ source: string; target: string; label: string }>;
	};
}

export interface AlignmentSignals {
	relevance: number;
	confidence: number;
	reasoning: string;
	intent?: string;
	route_decision?: string;
	on_task_score: number;
	negativity_score: number;
	latency_ms: number;
	web_search_suggested?: boolean;
}

export interface SearchOptions {
	include_kag?: boolean;
	include_reasoning?: boolean;
}

export interface SearchResponse {
	results: SearchResultChunk[];
	alignment?: AlignmentSignals;
	query: string;
}

class SearchStore {
	results = $state<SearchResultChunk[]>([]);
	alignment = $state<AlignmentSignals | null>(null);
	reasoning = $state('');
	loading = $state(false);
	error = $state<string | null>(null);

	hasResults = $derived(this.results.length > 0);

	async executeSearch(query: string, _options?: SearchOptions): Promise<void> {
		// Stub — integrate with knowledge-search backend
		this.loading = false;
	}

	clearSearch(): void {
		this.results = [];
		this.alignment = null;
		this.reasoning = '';
		this.error = null;
	}
}

export const searchStore = new SearchStore();
