/**
 * POST /api/web/crawl
 *
 * Web crawl proxy — delegates to the langextract Docker service (port 8095)
 * for URL content extraction, then optionally embeds + stores the result.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';
import { langextractFetch } from '$lib/server/langextract-client.js';
import { validateExternalUrl } from '$lib/server/security/url-validator.js';

const webCrawlSchema = z.object({
  url: z.string().min(1, 'url is required').max(2000).url('Invalid URL format'),
  extractText: z.boolean().optional().default(true),
  generateEmbedding: z.boolean().optional().default(false),
});

interface CrawlResult {
  url: string;
  title: string;
  text: string;
  html?: string;
  extractedAt: string;
  contentLength: number;
  source: 'langextract' | 'fallback';
}

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json();
  const parsed = webCrawlSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { url, generateEmbedding } = parsed.data;

  // SSRF protection: block internal/private IPs and cloud metadata
  const urlCheck = validateExternalUrl(url);
  if (!urlCheck.valid) {
    return json({ error: urlCheck.error }, { status: 400 });
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
      return json({ error: 'Crawl failed' }, { status: 502 });
    }
  }

  // Optionally generate embedding for the extracted text
  let embedding: number[] | null = null;
  if (generateEmbedding && result.text.length > 0) {
    try {
      const embedRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'embeddinggemma:latest',
          prompt: result.text.slice(0, 4000),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (embedRes.ok) {
        const data = await embedRes.json();
        embedding = data.embedding ?? null;
      }
    } catch {
      /* embedding is optional */
    }
  }

  return json({
    ...result,
    embedding: embedding ? { dims: embedding.length, vector: embedding } : null,
    timing: { totalMs: Math.round(performance.now() - start) },
  });
}

/** Crawl via langextract Docker service (via shared adapter). */
async function crawlViaLangextract(url: string): Promise<CrawlResult> {
	const res = await langextractFetch('/extract', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url, extract_text: true }),
		signal: AbortSignal.timeout(15_000)
	});

	if (!res?.ok) {
		throw new Error(`langextract ${res?.status ?? 'unavailable'}`);
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
