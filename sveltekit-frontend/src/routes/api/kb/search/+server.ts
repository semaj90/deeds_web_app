import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';

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
      return json(
        { results: [], total: 0, source: 'error' },
        { status: 400 }
      );
    }
    const { query, tags, limit, somCluster } = parsed.data;

    // 1. Embed the query
    const embResult = await generateEmbeddings([query]);
    const vector = embResult.vectors[0];

    // 2. Build Qdrant filter
    const mustClauses: object[] = [];
    if (tags && tags.length > 0) {
      mustClauses.push({
        key: 'tags',
        match: { any: tags },
      });
    }
    if (somCluster !== undefined) {
      mustClauses.push({
        key: 'som_cluster',
        match: { value: somCluster },
      });
    }
    const filter = mustClauses.length > 0 ? { must: mustClauses } : undefined;

    // 3. Search Qdrant codebase_chunks_768
    const searchBody: Record<string, unknown> = {
      vector: { name: 'content', vector },
      limit,
      with_payload: true,
    };
    if (filter) searchBody.filter = filter;

    const resp = await fetch(
      `${ENV.QDRANT_URL}/collections/codebase_chunks_768/points/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchBody),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (!resp.ok) {
      console.error('[kb/search] Qdrant error:', resp.status, await resp.text());
      return json({ results: [], total: 0, source: 'error' });
    }

    const data = await resp.json();
    const results = (data?.result ?? []).map((r: Record<string, unknown>) => {
      const payload = (r.payload as Record<string, unknown>) ?? {};
      return {
        id: r.id,
        score: r.score,
        file_path: payload.file_path ?? null,
        content: payload.content ?? payload.text ?? '',
        summary: payload.summary ?? null,
        tags: payload.tags ?? [],
        som_cluster: payload.som_cluster ?? null,
        language: payload.language ?? null,
        chunk_index: payload.chunk_index ?? null,
      };
    });

    return json({ results, total: results.length, source: 'qdrant' });
  } catch (err) {
    console.error('[kb/search] Error:', err);
    return json({ results: [], total: 0, source: 'error' });
  }
};