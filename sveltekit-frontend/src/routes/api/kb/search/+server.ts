import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { orchestrateRetrieval } from '$lib/server/retrieval/orchestrator.js';

const searchSchema = z.object({
  query: z.string().min(1).max(1000),
  tags: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).default(10),
  somCluster: z.number().int().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ results: [], total: 0, source: 'error' }, { status: 401 });

  try {
    const raw = await request.json();
    const parsed = searchSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ results: [], total: 0, source: 'error' }, { status: 400 });
    }
    const { query, tags, limit, somCluster } = parsed.data;

    const result = await orchestrateRetrieval({
      query,
      pipeline: 'codebase',
      topK: limit,
      skipGraph: true,
      skipDag: true,
      skipAuthority: true,
    });

    // Prefer codebaseChunks (ranked by cross-encoder); fall back to chunks
    const raw_results = result.codebaseChunks.length
      ? result.codebaseChunks
      : result.chunks.map(c => ({
          file_path: c.sourceId ?? '',
          file_name: '',
          extension: '',
          content: c.content,
          similarity: c.similarity,
          score: c.similarity,
          tags: [] as string[],
          som_cluster: null as number | null,
        }));

    // Post-filter by tags/somCluster (orchestrator doesn't support these natively)
    const filtered = raw_results.filter(r => {
      const rTags: string[] = (r as { tags?: string[] }).tags ?? [];
      if (tags && tags.length > 0 && !tags.some(t => rTags.includes(t))) return false;
      if (somCluster !== undefined) {
        const rc = (r as { som_cluster?: number | null }).som_cluster;
        if (rc !== somCluster) return false;
      }
      return true;
    });

    const results = filtered.slice(0, limit).map(r => ({
      id:          (r as { id?: string }).id ?? (r as { file_path?: string }).file_path ?? '',
      score:       (r as { similarity?: number; score?: number }).similarity ?? (r as { score?: number }).score ?? 0,
      file_path:   (r as { file_path?: string }).file_path ?? null,
      content:     (r as { content?: string }).content ?? '',
      summary:     (r as { summary?: string }).summary ?? null,
      tags:        (r as { tags?: string[] }).tags ?? [],
      som_cluster: (r as { som_cluster?: number | null }).som_cluster ?? null,
      language:    (r as { language?: string }).language ?? null,
      chunk_index: (r as { chunk_index?: number }).chunk_index ?? null,
    }));

    return json({ results, total: results.length, source: 'orchestrator', latencyMs: result.latencyMs });
  } catch (err) {
    console.error('[kb/search] Error:', err);
    return json({ results: [], total: 0, source: 'error' });
  }
};