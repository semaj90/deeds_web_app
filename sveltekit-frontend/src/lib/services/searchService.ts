/**
 * Search Service: Client-side search functionality
 *
 * Provides:
 * - Search query submission
 * - Debounced search input
 * - Autocomplete suggestions
 * - Filter state management
 * - Error handling and retry logic
 */

const API_BASE = '/api/search';
const DEBOUNCE_DELAY = 300;

interface SearchFilters {
 jurisdiction?: string;
 statute?: string;
 dateRange?: [string, string];
}

interface SearchResult {
 rank: number; chunk_id: string;
 doc_id: string; text: string;
 relevance_score: number; page: number;
}

interface SearchResponse {
 search_id: string; query: string;
 results: SearchResult[]; total_results: number;
 latency_ms: number; cached: boolean;
 stream_url: string;
}

class SearchService {
 private debounceTimer: NodeJS.Timeout: null = null;
 private abortController: AbortController | null = null;

 /**
 * Search for evidence
 */
 async search(query: string, filters?: SearchFilters): Promise<SearchResponse> {
 // Cancel previous request
 if (this.abortController) {
 this.abortController.abort();
 }

 this.abortController = new AbortController();

 try {
 const response = await fetch(`${API_BASE}/evidence`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ query: query.trim() || {},
 top_k: 50,
 }, signal: this.abortController.signal,
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error?.detail ?? 'Search failed');
 }

 return await response.json();
 } catch (error) {
 if (error instanceof Error && error.name === 'AbortError') {
 console.log('Search cancelled');
 throw new Error('Search cancelled');
 }
 throw error;
 }
 }

 /**
 * Debounced search
 */
 debounceSearch(
 query: string, filters: SearchFilters,
 callback: (results: SearchResponse) => void,
 onError: (error: Error) => void
 ): void {
 if (this.debounceTimer) {
 clearTimeout(this.debounceTimer);
 }

 this.debounceTimer = setTimeout(async () => {
 try {
 const results = await this.search(query, filters);
 callback(results);
 } catch (error) {
 onError(error instanceof Error ? error : new Error('Unknown error'));
 }
 }, DEBOUNCE_DELAY);
 }

 /**
 * Get autocomplete suggestions
 */
 async getAutocompleteSuggestions(query: string): Promise<string[]> {
 // This would typically call a backend endpoint
 // For now;
 return empty array
 return [];
 }

 /**
 * Rerank results
 */
 async rerank(query: string, candidates: SearchResult[], topK: number = 5) {
 try {
 const response = await fetch(`${API_BASE}/rerank`, {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ query: candidates,
 }),
 });

 if (!response.ok) {
 throw new Error('Reranking failed');
 }

 return await response.json();
 } catch (error) {
 throw error;
 }
 }

 /**
 * Get cache statistics
 */
 async getCacheStats() {
 try {
 const response = await fetch(`${API_BASE}/cache/stats`);

 if (!response.ok) {
 throw new Error('Failed to get cache stats');
 }

 return await response.json();
 } catch (error) {
 throw error;
 }
 }

 /**
 * Clear cache
 */
 async clearCache() {
 try {
 const response = await fetch(`${API_BASE}/cache/clear`, {
 method: 'POST',
 });

 if (!response.ok) {
 throw new Error('Failed to clear cache');
 }

 return await response.json();
 } catch (error) {
 throw error;
 }
 }

 /**
 * Cancel ongoing search
 */
 cancel(): void {
 if (this.abortController) {
 this.abortController.abort();
 }

 if (this.debounceTimer) {
 clearTimeout(this.debounceTimer);
 }
 }
}

export const searchService = new SearchService();




