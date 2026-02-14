/**
 * Search Store - Stub (Session 27)
 *
 * Previous implementation imported from _archive/svelte4_stores/search which was
 * archived to deeds_lab. This stub provides the same exports as no-ops.
 *
 * TODO: Migrate to knowledge-search.svelte.ts ($state/$derived pattern)
 */

import { writable, type Writable } from 'svelte/store';

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

export const searchResults: Writable<SearchResultChunk[]> = writable([]);
export const searchAlignment: Writable<AlignmentSignals | null> = writable(null);
export const searchReasoning: Writable<string> = writable('');
export const searchLoading: Writable<boolean> = writable(false);
export const searchError: Writable<string | null> = writable(null);

export async function executeSearch(_query: string, _options?: SearchOptions): Promise<void> {
  // Stub — migrate to knowledge-search.svelte.ts
  searchLoading.set(false);
}

export function clearSearch(): void {
  searchResults.set([]);
  searchAlignment.set(null);
  searchReasoning.set('');
  searchError.set(null);
}
