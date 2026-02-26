/**
 * POST /api/web/crawl
 *
 * Web crawl proxy — delegates to the langextract Docker service (port 8095)
 * for URL content extraction, then optionally embeds + stores the result.
 *
 * Body: { url: string, extractText?: boolean, generateEmbedding?: boolean }
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

const LANGEXTRACT_URL = 'http://localhost:8095';

interface CrawlResult {
	url: string;
	title: string;
	text: string;
	html?: string;
	extractedAt: string;
	contentLength: number;
	source: 'langextract' | 'fallback';
}

export async function POST({ request }: RequestEvent) {
	const body = await request.json();
	const { url, extractText = true, generateEmbedding = false } = body as {
		url: string;
		extractText?: boolean;
		generateEmbedding?: boolean;
	};

	if (!url || typeof url !== 'string') {
		return json({ error: 'url is required' }, { status: 400 });
	}

	// Validate URL format
	try {
		new URL(url);
	} catch {
		return json({ error: 'Invalid URL format' }, { status: 400 });
	}

	const start = performance.now();

	// Try langextract Docker service first
	let result: CrawlResult;
	try {
		result = await crawlViaLangextract(url);
	} catch {
		// Fallback: basic fetch + text extraction
		try {
			result = await crawlFallback(url);
		} catch (err) {
			return json({ error: `Crawl failed: ${err instanceof Error ? err.message : 'Unknown'}` }, { status: 502 });
		}
	}

	// Optionally generate embedding for the extracted text
	let embedding: number[] | null = null;
	if (generateEmbedding && result.text.length > 0) {
		try {
			const embedRes = await fetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: result.text.slice(0, 4000) }),
				signal: AbortSignal.timeout(10_000)
			});
			if (embedRes.ok) {
				const data = await embedRes.json();
				embedding = data.embedding ?? null;
			}
		} catch { /* embedding is optional */ }
	}

	return json({
		...result,
		embedding: embedding ? { dims: embedding.length, vector: embedding } : null,
		timing: { totalMs: Math.round(performance.now() - start) }
	});
}

/** Crawl via langextract Docker service (Phase 66 infrastructure). */
async function crawlViaLangextract(url: string): Promise<CrawlResult> {
	const res = await fetch(`${LANGEXTRACT_URL}/extract`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url, extract_text: true }),
		signal: AbortSignal.timeout(15_000)
	});

	if (!res.ok) {
		throw new Error(`langextract ${res.status}`);
	}

	const data = await res.json();
	return {
		url,
		title: data.title ?? '',
		text: data.text ?? data.content ?? '',
		extractedAt: new Date().toISOString(),
		contentLength: (data.text ?? data.content ?? '').length,
		source: 'langextract'
	};
}

/** Fallback: basic fetch + HTML stripping. */
async function crawlFallback(url: string): Promise<CrawlResult> {
	const res = await fetch(url, {
		headers: { 'User-Agent': 'DeedsAI/1.0 (legal research)' },
		signal: AbortSignal.timeout(10_000)
	});

	if (!res.ok) {
		throw new Error(`HTTP ${res.status}`);
	}

	const html = await res.text();
	// Extract title
	const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
	const title = titleMatch ? titleMatch[1].trim() : '';
	// Strip HTML tags for plain text
	const text = html
		.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
		.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
		.replace(/<[^>]+>/g, ' ')
		.replace(/\s+/g, ' ')
		.trim()
		.slice(0, 50_000);

	return {
		url,
		title,
		text,
		extractedAt: new Date().toISOString(),
		contentLength: text.length,
		source: 'fallback'
	};
}
