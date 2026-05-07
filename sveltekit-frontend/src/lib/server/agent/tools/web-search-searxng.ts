import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

/**
 * Web Search Tool - SearXNG + DuckDuckGo Fallback
 *
 * Free web search implementation using:
 * 1. SearXNG (self-hosted, privacy-focused meta-search engine)
 * 2. DuckDuckGo HTML scraping (fallback if SearXNG not available)
 * 3. Curated results (fallback for common queries)
 *
 * SearXNG Setup:
 * - Docker: docker run -d -p 8080:8080 searxng/searxng
 * - Or use public instance: https://searx.space/
 * - Set SEARXNG_URL in .env (e.g., http://localhost:8888)
 */

export const webSearchSchema = z.object({
	query: z.string().describe('Search query'),
	maxResults: z.number().optional().default(10).describe('Maximum number of results to return'),
	searchType: z
		.enum(['general', 'stackoverflow', 'github', 'docs'])
		.optional()
		.default('general')
		.describe('Type of search to perform')
});

export type WebSearchInput = z.infer<typeof webSearchSchema>;

export interface SearchResult {
	title: string;
	url: string;
	snippet: string;
	source: string;
}

export interface WebSearchResult {
	query: string;
	results: SearchResult[];
	totalResults: number;
	duration: number;
	searchType: string;
	method: 'searxng' | 'duckduckgo' | 'curated';
}

/**
 * Execute web search with fallback chain:
 * 1. Try SearXNG (if configured)
 * 2. Try DuckDuckGo HTML scraping
 * 3. Fallback to curated results
 */
export async function webSearch(input: WebSearchInput): Promise<WebSearchResult> {
	const startTime = Date.now();
	const { query, maxResults = 10, searchType = 'general' } = input;

	// Build search query with domain filters
	let searchQuery = query;
	if (searchType === 'stackoverflow') {
		searchQuery = `site:stackoverflow.com ${query}`;
	} else if (searchType === 'github') {
		searchQuery = `site:github.com ${query}`;
	} else if (searchType === 'docs') {
		searchQuery = `${query} documentation`;
	}

	// Try SearXNG first
	if (ENV.SEARXNG_URL) {
		try {
			const searxngResults = await searchViaSearXNG(searchQuery, maxResults);
			return {
				query,
				results: searxngResults,
				totalResults: searxngResults.length,
				duration: Date.now() - startTime,
				searchType,
				method: 'searxng'
			};
		} catch (error) {
			console.warn('[WebSearch] SearXNG failed, trying DuckDuckGo:', error);
		}
	}

	// Try DuckDuckGo HTML scraping
	try {
		const duckduckgoResults = await searchViaDuckDuckGo(searchQuery, maxResults);
		if (duckduckgoResults.length > 0) {
			return {
				query,
				results: duckduckgoResults,
				totalResults: duckduckgoResults.length,
				duration: Date.now() - startTime,
				searchType,
				method: 'duckduckgo'
			};
		}
	} catch (error) {
		console.warn('[WebSearch] DuckDuckGo failed, using curated results:', error);
	}

	// Fallback to curated results
	const curatedResults = getCuratedResults(query.toLowerCase(), searchType);
	return {
		query,
		results: curatedResults.slice(0, maxResults),
		totalResults: curatedResults.length,
		duration: Date.now() - startTime,
		searchType,
		method: 'curated'
	};
}

/**
 * Search via SearXNG API
 */
async function searchViaSearXNG(query: string, maxResults: number): Promise<SearchResult[]> {
	const searxngUrl = ENV.SEARXNG_URL;

	const response = await fetch(`${searxngUrl}/search`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: new URLSearchParams({
			q: query,
			format: 'json',
			language: 'en',
			safesearch: '0',
			time_range: '',
			categories: 'general'
		}),
		signal: AbortSignal.timeout(5000) // 5s timeout
	});

	if (!response.ok) {
		throw new Error(`SearXNG HTTP ${response.status}`);
	}

	const data = await response.json();

	if (!data.results || !Array.isArray(data.results)) {
		throw new Error('Invalid SearXNG response format');
	}

	return data.results.slice(0, maxResults).map((result: any) => ({
		title: result.title || 'Untitled',
		url: result.url || '',
		snippet: result.content || result.description || '',
		source: extractDomain(result.url || '')
	}));
}

/**
 * Search via DuckDuckGo HTML scraping
 */
async function searchViaDuckDuckGo(query: string, maxResults: number): Promise<SearchResult[]> {
	const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

	const response = await fetch(url, {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
		},
		signal: AbortSignal.timeout(5000) // 5s timeout
	});

	if (!response.ok) {
		throw new Error(`DuckDuckGo HTTP ${response.status}`);
	}

	const html = await response.text();

	// Parse HTML to extract results
	const results: SearchResult[] = [];
	const resultRegex =
		/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]+)<\/a>/g;

	let match: RegExpExecArray | null;
	while ((match = resultRegex.exec(html)) !== null && results.length < maxResults) {
		const url = decodeURIComponent(match[1]);
		const title = decodeHtml(match[2]);
		const snippet = decodeHtml(match[3]);

		// Skip DuckDuckGo internal links
		if (!url.includes('duckduckgo.com')) {
			results.push({
				title,
				url,
				snippet,
				source: extractDomain(url)
			});
		}
	}

	return results;
}

/**
 * Get curated results for common queries (fallback)
 */
function getCuratedResults(query: string, searchType: string): SearchResult[] {
	const results: SearchResult[] = [];

	// Svelte 5 related queries
	if (query.includes('svelte 5') || query.includes('svelte runes')) {
		results.push(
			{
				title: 'Svelte 5 Documentation - Runes',
				url: 'https://svelte.dev/docs/svelte/overview',
				snippet:
					'Runes are symbols that provide instructions to the Svelte compiler. $state, $derived, $effect, and $props are the main runes.',
				source: 'svelte.dev'
			},
			{
				title: 'Svelte 5 Migration Guide',
				url: 'https://svelte.dev/docs/svelte/v5-migration-guide',
				snippet:
					'Guide for migrating from Svelte 4 to Svelte 5: export let → $props(), $: → $derived(), on:click → onclick',
				source: 'svelte.dev'
			}
		);
	}

	// LangChain related queries
	if (query.includes('langchain') || query.includes('react agent')) {
		results.push(
			{
				title: 'LangChain Agents Documentation',
				url: 'https://js.langchain.com/docs/modules/agents/',
				snippet:
					'Agents use LLMs to determine which actions to take and in what order. ReAct agent combines reasoning and acting.',
				source: 'langchain.com'
			},
			{
				title: 'Building ReAct Agents with LangChain',
				url: 'https://js.langchain.com/docs/how_to/agent_executor/',
				snippet:
					'AgentExecutor is the runtime for agents. It calls the agent, takes actions, and repeats until done.',
				source: 'langchain.com'
			}
		);
	}

	// Ripgrep related queries
	if (query.includes('ripgrep') || query.includes('rg command')) {
		results.push(
			{
				title: 'ripgrep User Guide',
				url: 'https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md',
				snippet:
					'ripgrep is a line-oriented search tool that recursively searches the current directory for a regex pattern.',
				source: 'github.com'
			},
			{
				title: 'ripgrep - Fast regex search',
				url: 'https://github.com/BurntSushi/ripgrep',
				snippet: 'Common usage: rg "pattern" --type ts --json --max-count 100',
				source: 'github.com'
			}
		);
	}

	// Drizzle ORM queries
	if (query.includes('drizzle') || query.includes('sql injection')) {
		results.push(
			{
				title: 'Drizzle ORM - SQL Injection Prevention',
				url: 'https://orm.drizzle.team/docs/sql',
				snippet:
					'Use parameterized queries with sql`` template literals. Never use sql.raw() with string interpolation.',
				source: 'drizzle.team'
			},
			{
				title: 'Drizzle Migration Safety',
				url: 'https://orm.drizzle.team/docs/migrations',
				snippet:
					'Always use drizzle-kit migrate (not push) on production databases. Review SQL for DROP statements.',
				source: 'drizzle.team'
			}
		);
	}

	// SearXNG setup queries
	if (query.includes('searxng') || query.includes('self-hosted search')) {
		results.push(
			{
				title: 'SearXNG Documentation',
				url: 'https://docs.searxng.org/',
				snippet:
					'SearXNG is a free internet metasearch engine which aggregates results from various search services and databases.',
				source: 'searxng.org'
			},
			{
				title: 'SearXNG Docker Setup',
				url: 'https://github.com/searxng/searxng-docker',
				snippet: 'Run SearXNG with Docker: docker run -d -p 8080:8080 searxng/searxng',
				source: 'github.com'
			},
			{
				title: 'Public SearXNG Instances',
				url: 'https://searx.space/',
				snippet: 'List of public SearXNG instances you can use without self-hosting.',
				source: 'searx.space'
			}
		);
	}

	// If no curated results, add generic search link
	if (results.length === 0) {
		results.push({
			title: `Search: ${query}`,
			url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
			snippet: `No curated results available. Click to search DuckDuckGo for: ${query}`,
			source: 'duckduckgo.com'
		});
	}

	return results;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
	try {
		const urlObj = new URL(url);
		return urlObj.hostname.replace('www.', '');
	} catch {
		return 'unknown';
	}
}

/**
 * Decode HTML entities
 */
function decodeHtml(html: string): string {
	return html
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.trim();
}

/**
 * Format web search results as markdown string
 */
export function formatWebSearchResults(result: WebSearchResult): string {
	const { query, results, totalResults, duration, searchType, method } = result;

	let output = `🔍 Web Search: ${query}\n`;
	output += `Type: ${searchType} | Results: ${totalResults} | Duration: ${duration}ms | Method: ${method}\n\n`;

	if (results.length === 0) {
		output += 'No results found.\n';
		return output;
	}

	for (let i = 0; i < results.length; i++) {
		const result = results[i];
		output += `**${i + 1}. ${result.title}**\n`;
		output += `   ${result.url}\n`;
		output += `   ${result.snippet}\n`;
		output += `   Source: ${result.source}\n\n`;
	}

	if (method === 'curated') {
		output += '\n💡 Tip: Set SEARXNG_URL in .env for live web search results\n';
	}

	return output;
}

/**
 * Search multiple sources in parallel
 */
export async function multiSourceSearch(
	query: string,
	sources: Array<'general' | 'stackoverflow' | 'github' | 'docs'> = [
		'general',
		'stackoverflow',
		'github'
	],
	maxResultsPerSource = 5
): Promise<WebSearchResult[]> {
	const searches = sources.map((searchType) =>
		webSearch({ query, maxResults: maxResultsPerSource, searchType })
	);

	return Promise.all(searches);
}

/**
 * Check if SearXNG is available
 */
export async function isSearXNGAvailable(): Promise<boolean> {
	if (!ENV.SEARXNG_URL) return false;

	try {
		const response = await fetch(`${ENV.SEARXNG_URL}/`, {
			signal: AbortSignal.timeout(2000)
		});
		return response.ok;
	} catch {
		return false;
	}
}

/**
 * Fetch and extract readable text content from a URL.
 * Strips HTML tags, scripts, styles, and returns plain text (up to maxLength chars).
 */
export async function fetchPageContent(url: string, maxLength = 6000): Promise<string> {
	const response = await fetch(url, {
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
		},
		signal: AbortSignal.timeout(8000),
		redirect: 'follow'
	});

	if (!response.ok) {
		throw new Error(`HTTP ${response.status} fetching ${url}`);
	}

	const contentType = response.headers.get('content-type') || '';
	if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
		throw new Error(`Non-HTML content type: ${contentType}`);
	}

	const html = await response.text();

	// Strip scripts, styles, and HTML tags to get readable text
	let text = html
		.replace(/<script[\s\S]*?<\/script>/gi, '')
		.replace(/<style[\s\S]*?<\/style>/gi, '')
		.replace(/<nav[\s\S]*?<\/nav>/gi, '')
		.replace(/<header[\s\S]*?<\/header>/gi, '')
		.replace(/<footer[\s\S]*?<\/footer>/gi, '')
		.replace(/<aside[\s\S]*?<\/aside>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&nbsp;/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	return text.slice(0, maxLength);
}
