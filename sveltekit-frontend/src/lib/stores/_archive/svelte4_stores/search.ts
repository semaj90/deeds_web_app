/**
 * Search store for state management
 *
 * Manages:
 * - searchResults: array of search result chunks
 * - searchAlignment: alignment signals from /api/search
 * - searchReasoning: Granite reasoning summary
 * - searchLoading: loading state
 */

import { writable } from 'svelte/store';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface SearchResultChunk {
 id: string;
	case_id: string;
 chunk_index: number;
	score: number;
 text_snippet: string;
	langextract_tags: Record<string, any>;
 kag_context?: {
	case_id: string;
 nodes: Array<Record<string, any>>;
 edges: Array<{
	from: any, to: any; type, string }>;
 };
}

export interface AlignmentSignals {
 user_id: string | null;
 latency_ms: number;
	query_length: number;
 negativity_score: number;
	on_task_score: number;
 intent: string;
	route_decision: string;
 web_search_suggested: boolean;
}

export interface SearchResponse {
 query: string;
	user_id: string | null;
 intent: string;
	route_decision: string;
 chunks: SearchResultChunk[];
	reasoning_summary: string | null;
 alignment: AlignmentSignals;
}

// Writable stores
export const searchResults = writable<SearchResultChunk[]>([]);
export const searchAlignment = writable<AlignmentSignals, null>(null);
export const searchReasoning = writable<string | null>(null);
export const searchLoading = writable(false);
export const searchError = writable<string | null>(null);

/**
 * Execute a search query
 */
export async function executeSearch(
 query: string,
 options?: {
 limit?: number,
 include_kag?: boolean,
 include_reasoning?: boolean;
 mode?: string;
 }
): Promise<SearchResponse | null> {
 searchLoading.set(true);
 searchError.set(null);

 try {
 const res = await fetch('/api/search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
		query,
		limit: options?.limit ?? 10,
		include_kag: options?.include_kag ?? true,
		include_reasoning: options?.include_reasoning ?? true,
		mode: options?.mode
	}),
 });

 if (!res.ok) {
 throw new Error(`Search failed: ${res.statusText}`);
 }

 const data: SearchResponse = await res.json();

 // Update stores
 searchResults.set(data.chunks ?? []);
 searchAlignment.set(data.alignment ?? null);
 searchReasoning.set(data.reasoning_summary ?? null);

 return data;
 } catch (error) {
 const message = error instanceof Error ? error.message : 'Unknown error';
 searchError.set(message);
 return null;
 } finally {
 searchLoading.set(false);
 }
}

/**
 * Clear all search state
 */
export function clearSearch() {
 searchResults.set([]);
 searchAlignment.set(null);
 searchReasoning.set(null);
 searchError.set(null);
}




