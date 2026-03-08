/**
 * Wikipedia Search Integration
 *
 * Provides legal research context from Wikipedia's public MediaWiki API.
 * No API key required. Used as supplementary source for non-legal background.
 *
 * Usage:
 *   const results = await searchWikipedia('tort law negligence', 3);
 */

export interface WikipediaResult {
	title: string;
	snippet: string;
	url: string;
	pageId: number;
	wordCount: number;
}

export interface WikipediaSearchResponse {
	results: WikipediaResult[];
	query: string;
	searchMs: number;
}

const WIKI_API = 'https://en.wikipedia.org/w/api.php';

/**
 * Search Wikipedia for articles matching query.
 * Returns structured results with snippets and URLs.
 */
export async function searchWikipedia(
	query: string,
	limit: number = 3
): Promise<WikipediaSearchResponse> {
	const start = performance.now();

	try {
		const params = new URLSearchParams({
			action: 'query',
			list: 'search',
			srsearch: query,
			srlimit: String(Math.min(limit, 10)),
			srprop: 'snippet|wordcount',
			format: 'json',
			origin: '*'
		});

		const res = await fetch(`${WIKI_API}?${params}`, {
			signal: AbortSignal.timeout(5000),
			headers: { 'User-Agent': 'DeedsLegalAI/1.0 (legal research tool)' }
		});

		if (!res.ok) {
			throw new Error(`Wikipedia API ${res.status}`);
		}

		const data = await res.json();
		const items = (data?.query?.search ?? []) as Array<{
			title: string;
			snippet: string;
			pageid: number;
			wordcount: number;
		}>;

		const results: WikipediaResult[] = items.map((item) => ({
			title: item.title,
			snippet: stripHtmlTags(item.snippet),
			url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
			pageId: item.pageid,
			wordCount: item.wordcount
		}));

		return {
			results,
			query,
			searchMs: Math.round(performance.now() - start)
		};
	} catch (err) {
		console.warn('[Wikipedia] Search failed:', err);
		return {
			results: [],
			query,
			searchMs: Math.round(performance.now() - start)
		};
	}
}

/**
 * Get a longer excerpt for a specific Wikipedia page.
 * Returns plain-text extract (first ~500 chars).
 */
export async function getWikipediaExcerpt(
	pageId: number,
	maxChars: number = 500
): Promise<string | null> {
	try {
		const params = new URLSearchParams({
			action: 'query',
			pageids: String(pageId),
			prop: 'extracts',
			exintro: '1',
			explaintext: '1',
			exchars: String(maxChars),
			format: 'json',
			origin: '*'
		});

		const res = await fetch(`${WIKI_API}?${params}`, {
			signal: AbortSignal.timeout(3000),
			headers: { 'User-Agent': 'DeedsLegalAI/1.0 (legal research tool)' }
		});

		if (!res.ok) return null;

		const data = await res.json();
		const pages = data?.query?.pages ?? {};
		const page = pages[String(pageId)];
		return page?.extract ?? null;
	} catch {
		return null;
	}
}

/**
 * Format Wikipedia results as context string for LLM prompt.
 */
export function formatWikipediaAsContext(response: WikipediaSearchResponse): string {
	if (response.results.length === 0) return '';

	const lines = [`## Wikipedia Context (${response.searchMs}ms)`];
	for (const [i, r] of response.results.entries()) {
		lines.push(`[Wiki ${i + 1}] ${r.title}`);
		lines.push(`  URL: ${r.url}`);
		lines.push(`  ${r.snippet.slice(0, 300)}`);
	}
	return lines.join('\n');
}

/** Strip HTML tags from Wikipedia API snippets. */
function stripHtmlTags(html: string): string {
	return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
