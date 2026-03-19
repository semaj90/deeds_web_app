/**
 * Type-safe search client for legal search system
 * Handles both case and law searches with streaming support
 */

import { fetchWithStreaming, type StreamingOptions } from './streaming-handler.js';
import type { PlatformEntityType, PlatformSearchResponse } from '$lib/types/search.js';

export interface SearchQuery {
 query: string;
 limit?: number;
 jurisdiction?: string;
 crimeCategory?: string;
 crimeClassification?: string;
 sectionType?: string;
}

export interface SearchResult {
 id: string;
	title: string;
	text: string;
	score: number;
	metadata: Record<string, any>;
}

export interface SearchResponse {
 results: SearchResult[];
	total: number;
	query: string;
	executionTimeMs: number;
}

/**
 * Search cases with optional streaming
 */
export async function searchCases(
 query: SearchQuery,
 options?: StreamingOptions
): Promise<SearchResponse> {
 const params = new URLSearchParams({
 query: query.query,
 limit: String(query?.limit ?? 10),
 ...(query?.jurisdiction&& { jurisdiction: query.jurisdiction }),
 ...(query?.crimeCategory&& { crimeCategory: query.crimeCategory }),
 ...(query?.crimeClassification&& { crimeClassification: query.crimeClassification }),
 });

 return fetchWithStreaming(`/api/search/cases?${params}`, {
 method: 'GET',
 ...options,
 }).then((text) => {
 try {
 return JSON.parse(text);
 } catch {
 return { results: [], total: 0, query: query.query, executionTimeMs: 0 };
 }
 });
}

/**
 * Search laws with optional streaming
 */
export async function searchLaws(
 query: SearchQuery,
 options?: StreamingOptions
): Promise<SearchResponse> {
 const params = new URLSearchParams({
 query: query.query,
 limit: String(query?.limit ?? 10),
 ...(query?.jurisdiction&& { jurisdiction: query.jurisdiction }),
 ...(query?.sectionType&& { sectionType: query.sectionType }),
 });

 return fetchWithStreaming(`/api/search/laws?${params}`, {
 method: 'GET',
 ...options,
 }).then((text) => {
 try {
 return JSON.parse(text);
 } catch {
 return { results: [], total: 0, query: query.query, executionTimeMs: 0 };
 }
 });
}

/**
 * Get search suggestions/autocomplete
 */
export async function getSearchSuggestions(
 query: string,
 type: 'cases' | 'laws' | 'all' = 'all'
): Promise<string[]> {
 try {
const response = await fetch(
  `/api/search/suggestions?query=${encodeURIComponent(query)}&type=${type}`
 );
 if (!response.ok) return [];
 const data = await response.json();
 return data.suggestions ?? [];
 } catch {
 return [];
 }
}

/**
 * Get search filters/facets
 */
export async function getSearchFilters(
 type: 'cases' | 'laws' = 'laws'
): Promise<Record<string, any>> {
 try {
 const response = await fetch(`/api/search/filters?type=${type}`);
 if (!response.ok) return {};
 return response.json();
 } catch {
 return {};
 }
}

/**
 * Unified platform search — queries all entity types via /api/search
 */
export async function unifiedSearch(
	query: string,
	type: PlatformEntityType | 'all' = 'all',
	limit: number = 20
): Promise<PlatformSearchResponse> {
	const params = new URLSearchParams({
		q: query,
		type,
		limit: String(limit),
	});
	try {
		const res = await fetch(`/api/search?${params}`);
		if (!res.ok) {
			return { hits: [], groups: {} as any, totalResults: 0, timing: { totalMs: 0, adapters: {} } };
		}
		return res.json();
	} catch {
		return { hits: [], groups: {} as any, totalResults: 0, timing: { totalMs: 0, adapters: {} } };
	}
}

/**
 * Track search analytics
 */
export async function trackSearch(
	query: string, resultCount: number, executionTimeMs: number,
	type: 'cases' | 'laws' | 'evidence' | 'all' = 'all'
): Promise<void> {
	try {
		await fetch('/api/analytics/search', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query,
				resultCount,
				executionTimeMs,
				type,
				timestamp: new Date().toISOString(),
			}),
		});
	} catch (error) {
		console.error('Failed to track search:', error);
	}
}



