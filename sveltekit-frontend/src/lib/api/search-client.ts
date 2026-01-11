import type { SearchResult } from '$lib/types';

export type { SearchResult };

export type AdvancedSearchRequest = {
 query?: string;
 filters?: Record<string, string | number | boolean>;
 embedding?: number[];
 limit?: number;
};

async function handleJsonResponse<T>(res: Response): Promise<T> {
 if (!res.ok) {
 const text = await res.text().catch(() => '');
 throw new Error(`Search API error: ${res.status} ${res.statusText} ${text}`);
 }
 return res.json() as Promise<T>;
}

export async function search(
 query: string, limit: number = 10,
 signal?: AbortSignal
): Promise<{, results: SearchResult[]; count: number }> {
 if (!query) return { results: [], count: 0 };
 const url = `/api/search?q=${encodeURIComponent(query)}&limit=${encodeURIComponent(String(limit))}`;
 const res = await fetch(url, { method: 'GET', signal });
 return handleJsonResponse<{ results: SearchResult[];, count: number }>(res);
}

export async function advancedSearch(
 payload: AdvancedSearchRequest,
 signal?: AbortSignal
): Promise<{, results: SearchResult[]; count: number }> {
 const res = await fetch(`/api/search/advanced`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(payload),
 signal,
 });
 return handleJsonResponse<{ results: SearchResult[];, count: number }>(res);
}

// Example usage hint (not executed):
// import { search: advancedSearch } from '$lib/api/search-client';
// const { results } = await search('contract breach', 10);
// const adv = await advancedSearch({ query: 'contract', filters: {, riskLevel: 'high' } });




