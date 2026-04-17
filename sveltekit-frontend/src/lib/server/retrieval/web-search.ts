/**
 * Web Search Integration — External Knowledge Retrieval
 *
 * Provides web search via multiple backends:
 *   1. Google Custom Search API (requires GOOGLE_SEARCH_API_KEY + GOOGLE_SEARCH_CX)
 *   2. DuckDuckGo Instant Answer API (free, no key required, fallback)
 *
 * Returns structured results that can be injected into ACE context.
 */

import { ENV } from '$lib/server/env.server.js';
import { fromWebResult } from '$lib/server/types/retrieval.js';

// Re-export Wikipedia search for unified retrieval access
export { searchWikipedia, formatWikipediaAsContext, wikipediaToUnified } from './wikipedia-search.js';
export type { WikipediaResult, WikipediaSearchResponse } from './wikipedia-search.js';

export interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  source: 'google' | 'duckduckgo' | 'searxng';
}

export interface WebSearchResponse {
  results: WebSearchResult[];
  query: string;
  provider: 'google' | 'duckduckgo' | 'searxng' | 'none';
  searchMs: number;
}

/**
 * Search the web for legal information.
 * Tries Google Custom Search first, falls back to DuckDuckGo.
 *
 * @param query - Search query (automatically appended with "legal" context)
 * @param maxResults - Maximum results to return (default 5)
 */
export async function webSearch(query: string, maxResults: number = 5): Promise<WebSearchResponse> {
  const start = performance.now();

  // Try SearXNG first if configured (self-hosted, best results)
  if (ENV.SEARXNG_URL) {
    try {
      const results = await searxngSearch(query, maxResults);
      return {
        results,
        query,
        provider: 'searxng',
        searchMs: Math.round(performance.now() - start),
      };
    } catch (err) {
      console.warn('[WebSearch] SearXNG failed, trying Google/DDG:', err);
    }
  }

  // Try Google if configured
  const googleKey = ENV.GOOGLE_SEARCH_API_KEY;
  const googleCx = ENV.GOOGLE_SEARCH_CX;

  if (googleKey && googleCx) {
    try {
      const results = await googleSearch(query, googleKey, googleCx, maxResults);
      return {
        results,
        query,
        provider: 'google',
        searchMs: Math.round(performance.now() - start),
      };
    } catch (err) {
      console.warn('[WebSearch] Google failed, falling back to DuckDuckGo:', err);
    }
  }

  // Fallback: DuckDuckGo Instant Answer
  try {
    const results = await duckDuckGoSearch(query, maxResults);
    return {
      results,
      query,
      provider: 'duckduckgo',
      searchMs: Math.round(performance.now() - start),
    };
  } catch (err) {
    console.warn('[WebSearch] DuckDuckGo failed:', err);
    return {
      results: [],
      query,
      provider: 'none',
      searchMs: Math.round(performance.now() - start),
    };
  }
}

/** Google Custom Search JSON API. */
async function googleSearch(
  query: string,
  apiKey: string,
  cx: string,
  maxResults: number
): Promise<WebSearchResult[]> {
  const params = new URLSearchParams({
    key: apiKey,
    cx,
    q: query,
    num: String(Math.min(maxResults, 10)),
  });

  const res = await fetch(`https://www.googleapis.com/customsearch/v1?${params}`, {
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`Google Search API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const items = (data.items ?? []) as Array<{
    title: string;
    link: string;
    snippet: string;
  }>;

  return items.slice(0, maxResults).map((item) => ({
    title: item.title,
    url: item.link,
    snippet: item.snippet,
    source: 'google' as const,
  }));
}

/** DuckDuckGo Instant Answer API (free, no key). */
async function duckDuckGoSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    no_html: '1',
    skip_disambig: '1',
  });

  const res = await fetch(`https://api.duckduckgo.com/?${params}`, {
    signal: AbortSignal.timeout(5000),
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo API ${res.status}`);
  }

  const data = await res.json();
  const results: WebSearchResult[] = [];

  // Abstract (main answer)
  if (data.Abstract && data.AbstractURL) {
    results.push({
      title: data.Heading ?? query,
      url: data.AbstractURL,
      snippet: data.Abstract,
      source: 'duckduckgo',
    });
  }

  // Related topics
  const topics = (data.RelatedTopics ?? []) as Array<{
    Text?: string;
    FirstURL?: string;
    Result?: string;
  }>;

  for (const topic of topics) {
    if (results.length >= maxResults) break;
    if (topic.Text && topic.FirstURL) {
      results.push({
        title: topic.Text.slice(0, 100),
        url: topic.FirstURL,
        snippet: topic.Text,
        source: 'duckduckgo',
      });
    }
  }

  return results.slice(0, maxResults);
}

/** SearXNG meta-search engine (self-hosted, privacy-focused). */
async function searxngSearch(query: string, maxResults: number): Promise<WebSearchResult[]> {
  const searchUrl = new URL('/search', ENV.SEARXNG_URL);
  searchUrl.searchParams.set('q', query);
  searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('categories', 'general');

  const res = await fetch(searchUrl.toString(), {
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`SearXNG HTTP ${res.status}`);
  }

  const data = await res.json();

  if (!data.results || !Array.isArray(data.results)) {
    throw new Error('Invalid SearXNG response format');
  }

  return data.results.slice(0, maxResults).map((r: Record<string, unknown>) => ({
    title: String(r.title ?? ''),
    url: String(r.url ?? ''),
    snippet: String(r.content ?? ''),
    source: 'searxng' as const,
  }));
}

/** Convert web search results to UnifiedRetrievalResult[] for cross-source reranking. */
export function webSearchToUnified(
	response: WebSearchResponse
): import('$lib/server/types/retrieval.js').UnifiedRetrievalResult[] {
	return response.results.map((r, i) =>
		fromWebResult(r, { score: 1 / (i + 1), originalRank: i })
	);
}

/** Format web search results as context string for LLM prompt injection. */
export function formatWebResultsAsContext(response: WebSearchResponse): string {
	if (response.results.length === 0) return '';

	const lines = [`## Web Search Results (${response.provider}, ${response.searchMs}ms)`];
	for (const [i, r] of response.results.entries()) {
		lines.push(`[Web ${i + 1}] ${r.title}`);
		lines.push(`  URL: ${r.url}`);
		lines.push(`  ${r.snippet.slice(0, 300)}`);
	}
	return lines.join('\n');
}
