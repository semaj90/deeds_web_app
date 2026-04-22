/**
 * POST /api/research/ingest
 *
 * Lane 3 research ingest endpoint.
 * Accepts { source, query, options } and triggers GitHub/Reddit/web-crawl
 * harvesting, then embeds + upserts into chunks_web_search Qdrant collection.
 *
 * Body:
 *   source: 'github_issues' | 'github_code' | 'github_repos' | 'reddit' | 'web'
 *   query: string
 *   limit?: number
 *   semantic?: boolean   (github_issues only)
 *   subreddit?: string   (reddit only)
 *   urls?: string[]      (web only)
 *   addTags?: boolean    (fire Gemma 4 tagging, default false — slow)
 *
 * Returns: { source, fetched, ingested, skipped, errors, durationMs }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const bodySchema = z.object({
  source: z.enum(['github_issues', 'github_code', 'github_repos', 'reddit', 'web']),
  query: z.string().min(1).max(512),
  limit: z.number().min(1).max(100).default(20),
  semantic: z.boolean().default(false),
  subreddit: z.string().optional(),
  urls: z.array(z.string().url()).max(20).optional(),
  addTags: z.boolean().default(false),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  // Auth guard
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid request', issues: parsed.error.issues }, { status: 400 });
  }

  const { source, query, limit, semantic, subreddit, urls, addTags } = parsed.data;
  const t0 = Date.now();

  try {
    const { ingestResearchChunks } = await import(
      '$lib/server/research/web-research-ingester.js'
    );

    let chunks: any[] = [];

    if (source === 'github_issues') {
      const { searchGitHubIssues } = await import('$lib/server/research/github-harvester.js');
      chunks = await searchGitHubIssues({ query, limit, semantic });
    } else if (source === 'github_code') {
      const { searchGitHubCode } = await import('$lib/server/research/github-harvester.js');
      chunks = await searchGitHubCode({ query, limit });
    } else if (source === 'github_repos') {
      const { searchGitHubRepos } = await import('$lib/server/research/github-harvester.js');
      chunks = await searchGitHubRepos({ query, limit });
    } else if (source === 'reddit') {
      const { searchReddit } = await import('$lib/server/research/reddit-harvester.js');
      const result = await searchReddit({ query, subreddit, limit });
      chunks = result.chunks;
    } else if (source === 'web') {
      // Basic URL fetch fallback — uses existing crawlDocs infrastructure
      if (urls?.length) {
        const { crawlDocsHandler } = await import(
          '$lib/server/tools/handlers/crawlDocs.js'
        );
        const crawlResult = await crawlDocsHandler({
          run_id: `research_${Date.now()}`,
          urls,
          options: { extract_code: false, extract_tables: false, timeout_ms: 15000 },
        } as any);

        // Map crawled pages to WebResearchChunk shape
        const { sha256Hex } = await import('$lib/server/research/research-utils.js');
        chunks = ((crawlResult.data as any)?.pages ?? []).map((page: any) => ({
          id: sha256Hex(`web_page:${page.url}:${page.content?.slice(0, 200) ?? ''}`),
          source: 'web_page' as const,
          url: page.url,
          title: page.title ?? page.url,
          body: page.content?.slice(0, 8000) ?? '',
          score: 1,
          fetched_at: page.crawled_at ?? new Date().toISOString(),
        }));
      }
    }

    const ingestResult = chunks.length
      ? await ingestResearchChunks(chunks, addTags)
      : { ingested: 0, skipped: 0, errors: 0 };

    return json({
      source,
      query,
      fetched: chunks.length,
      ...ingestResult,
      durationMs: Date.now() - t0,
    });
  } catch (err) {
    console.error('[/api/research/ingest] error:', err);
    return json({
      source,
      query,
      fetched: 0,
      ingested: 0,
      skipped: 0,
      errors: 1,
      durationMs: Date.now() - t0,
    });
  }
};
