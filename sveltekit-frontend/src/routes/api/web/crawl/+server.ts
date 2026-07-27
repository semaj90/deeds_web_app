/**
 * POST /api/web/crawl
 *
 * Web crawl proxy — delegates to the langextract Docker service (port 8095)
 * for URL content extraction, then optionally embeds + stores the result.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { maybeGenerateWebEmbedding, extractWebDocument } from '$lib/server/web/web-crawl.js';

const webCrawlSchema = z.object({
  url: z.string().min(1, 'url is required').max(2000).url('Invalid URL format'),
  extractText: z.boolean().optional().default(true),
  generateEmbedding: z.boolean().optional().default(false),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json();
  const parsed = webCrawlSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { url, generateEmbedding } = parsed.data;

  const start = performance.now();

  let result;
  try {
    result = await extractWebDocument(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return json({ error: message || 'Crawl failed' }, { status: 502 });
  }

  const embedding = generateEmbedding ? await maybeGenerateWebEmbedding(result.text) : null;

  return json({
    ...result,
    embedding: embedding ? { dims: embedding.length, vector: embedding } : null,
    timing: { totalMs: Math.round(performance.now() - start) },
  });
};
