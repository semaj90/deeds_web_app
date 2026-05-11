import { ENV } from '$lib/server/env.server.js';
import { JSDOM } from 'jsdom';

export interface WebSearchResult {
	title: string;
	url: string;
	content: string;
	engine: string;
}

/**
 * Perform web search with SearXNG, falling back to a lightweight DuckDuckGo scraper
 * if SearXNG is unavailable (common on local Windows dev without Docker).
 */
export async function performWebSearch(query: string, maxResults = 5): Promise<WebSearchResult[]> {
	// 1. Try SearXNG
	try {
		const searxngUrl = ENV.SEARXNG_URL;
		const searchUrl = new URL('/search', searxngUrl);
		searchUrl.searchParams.set('q', query);
		searchUrl.searchParams.set('format', 'json');
		searchUrl.searchParams.set('categories', 'general');

		const res = await fetch(searchUrl.toString(), {
			signal: AbortSignal.timeout(5000)
		});

		if (res.ok) {
			const data = await res.json();
			return (data.results ?? []).slice(0, maxResults).map((r: any) => ({
				title: r.title ?? '',
				url: r.url ?? '',
				content: r.content ?? '',
				engine: r.engine ?? 'searxng'
			}));
		}
	} catch (err) {
		// SearXNG unavailable, continue to fallback
	}

	// 2. Fallback: DuckDuckGo HTML Scraper (No API key needed)
	try {
		const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
		const res = await fetch(ddgUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
			},
			signal: AbortSignal.timeout(5000)
		});

		if (res.ok) {
			const html = await res.text();
			const dom = new JSDOM(html);
			const doc = dom.window.document;
			const results: WebSearchResult[] = [];

			const links = doc.querySelectorAll('.result__body');
			for (let i = 0; i < Math.min(links.length, maxResults); i++) {
				const link = links[i];
				const titleEl = link.querySelector('.result__a');
				const snippetEl = link.querySelector('.result__snippet');
				
				if (titleEl) {
					results.push({
						title: titleEl.textContent?.trim() ?? '',
						url: titleEl.getAttribute('href') ?? '',
						content: snippetEl?.textContent?.trim() ?? '',
						engine: 'duckduckgo-lite'
					});
				}
			}
			return results;
		}
	} catch (err) {
		console.warn('[web-search-utils] DuckDuckGo fallback failed:', err);
	}

	return [];
}

/**
 * Scrape full text from a URL using JSDOM
 */
export async function scrapeUrl(url: string): Promise<string> {
	try {
		const res = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
			},
			signal: AbortSignal.timeout(10000)
		});

		if (!res.ok) return '';
		const html = await res.text();
		const dom = new JSDOM(html);
		const doc = dom.window.document;

		// Remove script/style/nav/footer/header elements
		const toRemove = doc.querySelectorAll('script, style, nav, footer, header, noscript, iframe, ad');
		toRemove.forEach(el => el.remove());

		// Basic main content extraction (naive)
		const main = doc.querySelector('main, article, .content, #content, .post, .entry') || doc.body;
		
		// Clean up text: replace multiple spaces/newlines
		return main.textContent?.replace(/\s+/g, ' ').trim() || '';
	} catch (err) {
		console.warn(`[web-search-utils] Scrape failed for ${url}:`, err);
		return '';
	}
}
