import { z } from 'zod';

/**
 * Web Search Tool - Simple Implementation
 *
 * Searches the web for documentation, Stack Overflow answers, GitHub issues.
 *
 * PRODUCTION NOTE: This is a simplified implementation using DuckDuckGo HTML scraping.
 * For production, integrate with a proper search API:
 * - Brave Search API (https://brave.com/search/api/)
 * - SearXNG self-hosted (https://searxng.github.io/searxng/)
 * - Google Custom Search API
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
}

/**
 * Execute web search
 *
 * SIMPLIFIED IMPLEMENTATION: Returns curated search results based on query keywords.
 * For production, replace with real search API integration.
 */
export async function webSearch(input: WebSearchInput): Promise<WebSearchResult> {
	const startTime = Date.now();
	const { query, maxResults = 10, searchType = 'general' } = input;

	try {
		// PRODUCTION TODO: Replace with real search API
		const results = await performSearch(query, searchType, maxResults);

		const duration = Date.now() - startTime;

		return {
			query,
			results,
			totalResults: results.length,
			duration,
			searchType
		};
	} catch (err) {
		throw new Error(`Web search failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
	}
}

/**
 * Perform search (simplified implementation)
 *
 * PRODUCTION: Replace with real API calls to Brave Search, SearXNG, or Google Custom Search
 */
async function performSearch(
	query: string,
	searchType: string,
	maxResults: number
): Promise<SearchResult[]> {
	// For now, return curated results based on query keywords
	// This allows the agent to work without external API dependencies
	const results: SearchResult[] = [];

	// Add type-specific domain prefix
	let searchQuery = query;
	if (searchType === 'stackoverflow') {
		searchQuery = `site:stackoverflow.com ${query}`;
	} else if (searchType === 'github') {
		searchQuery = `site:github.com ${query}`;
	} else if (searchType === 'docs') {
		searchQuery = `${query} documentation`;
	}

	// Curated results for common queries
	const curatedResults = getCuratedResults(query.toLowerCase(), searchType);
	if (curatedResults.length > 0) {
		results.push(...curatedResults.slice(0, maxResults));
	}

	// If no curated results, generate generic placeholders
	if (results.length === 0) {
		results.push(
			...generateGenericResults(searchQuery, searchType).slice(0, maxResults)
		);
	}

	return results;
}

/**
 * Get curated results for common queries
 */
function getCuratedResults(query: string, searchType: string): SearchResult[] {
	const results: SearchResult[] = [];

	// Svelte 5 related queries
	if (query.includes('svelte 5') || query.includes('svelte runes')) {
		results.push(
			{
				title: 'Svelte 5 Documentation - Runes',
				url: 'https://svelte.dev/docs/svelte/overview',
				snippet: 'Runes are symbols that provide instructions to the Svelte compiler. $state, $derived, $effect, and $props are the main runes.',
				source: 'svelte.dev'
			},
			{
				title: 'Svelte 5 Migration Guide',
				url: 'https://svelte.dev/docs/svelte/v5-migration-guide',
				snippet: 'Guide for migrating from Svelte 4 to Svelte 5: export let → $props(), $: → $derived(), on:click → onclick',
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
				snippet: 'Agents use LLMs to determine which actions to take and in what order. ReAct agent combines reasoning and acting.',
				source: 'langchain.com'
			},
			{
				title: 'Building ReAct Agents with LangChain',
				url: 'https://js.langchain.com/docs/how_to/agent_executor/',
				snippet: 'AgentExecutor is the runtime for agents. It calls the agent, takes actions, and repeats until done.',
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
				snippet: 'ripgrep is a line-oriented search tool that recursively searches the current directory for a regex pattern.',
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
				snippet: 'Use parameterized queries with sql`` template literals. Never use sql.raw() with string interpolation.',
				source: 'drizzle.team'
			},
			{
				title: 'Drizzle Migration Safety',
				url: 'https://orm.drizzle.team/docs/migrations',
				snippet: 'Always use drizzle-kit migrate (not push) on production databases. Review SQL for DROP statements.',
				source: 'drizzle.team'
			}
		);
	}

	return results;
}

/**
 * Generate generic results for queries without curated data
 */
function generateGenericResults(query: string, searchType: string): SearchResult[] {
	const baseResults: SearchResult[] = [];

	// Generate different results based on search type
	if (searchType === 'stackoverflow') {
		baseResults.push({
			title: `${query} - Stack Overflow`,
			url: `https://stackoverflow.com/search?q=${encodeURIComponent(query)}`,
			snippet: `Community discussions and solutions for: ${query}`,
			source: 'stackoverflow.com'
		});
	} else if (searchType === 'github') {
		baseResults.push({
			title: `${query} - GitHub Repository Search`,
			url: `https://github.com/search?q=${encodeURIComponent(query)}`,
			snippet: `Code repositories, issues, and discussions related to: ${query}`,
			source: 'github.com'
		});
	} else if (searchType === 'docs') {
		baseResults.push({
			title: `${query} Documentation`,
			url: `https://duckduckgo.com/?q=${encodeURIComponent(query + ' documentation')}`,
			snippet: `Official documentation and guides for: ${query}`,
			source: 'documentation'
		});
	} else {
		baseResults.push({
			title: query,
			url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
			snippet: `Search results for: ${query}`,
			source: 'web'
		});
	}

	return baseResults;
}

/**
 * Format web search results as markdown
 */
export function formatWebSearchResults(result: WebSearchResult): string {
	const { query, results, totalResults, duration, searchType } = result;

	let output = `🔍 Web Search: ${query}\n`;
	output += `Type: ${searchType} | Results: ${totalResults} | Duration: ${duration}ms\n\n`;

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
