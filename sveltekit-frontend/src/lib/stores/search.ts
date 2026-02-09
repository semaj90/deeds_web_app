/**
 * Search Store - Barrel Export
 *
 * Re-exports from archived Svelte 4 search store.
 * This file restores the import path for components that reference the old location.
 *
 * TODO: Migrate to Svelte 5 runes pattern (knowledge-search.svelte.ts)
 */

export {
	searchResults,
	searchAlignment,
	searchReasoning,
	searchLoading,
	searchError,
	executeSearch,
	clearSearch,
	type SearchResultChunk,
	type AlignmentSignals,
	type SearchResponse
} from './_archive/svelte4_stores/search';