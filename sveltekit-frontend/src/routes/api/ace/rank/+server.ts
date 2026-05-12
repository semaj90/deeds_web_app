import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { generateEmbeddings } from '$lib/server/grpc/embedding-client.js';
import { scoreAttention } from '$lib/server/grpc/graph-ml-client.js';
import type { ACEContextChunk } from '$lib/server/types/ace.js';

const chunkSchema = z.object({
  id: z.string(),
  score: z.number(),
  source: z.enum(['qdrant', 'neo4j', 'redis', 'bifrost', 'manual']),
  file_path: z.string().optional(),
  content: z.string(),
  summary: z.string().optional(),
  tags: z.array(z.string()),
  som_cluster: z.number().nullable().optional(),
  graph_distance: z.number().nullable().optional(),
  authority_score: z.number().nullable().optional(),
});

const rankSchema = z.object({
  query: z.string().min(1).max(4000),
  chunks: z.array(chunkSchema).min(1).max(100),
  queryEmbedding: z.array(z.number()).length(768).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json(
      { chunks: [], attentionSource: 'error', durationMs: 0 },
      { status: 401 }
    );
  }

  const t0 = performance.now();

  try {
    const raw = await request.json();
    const parsed = rankSchema.safeParse(raw);
    if (!parsed.success) {
      return json(
        { chunks: [], attentionSource: 'error', durationMs: 0 },
        { status: 400 }
      );
    }
    const { query, chunks, queryEmbedding: precomputedEmbedding } = parsed.data;

    // 1. Resolve query embedding
    let queryVec: Float32Array;
    if (precomputedEmbedding && precomputedEmbedding.length === 768) {
      queryVec = new Float32Array(precomputedEmbedding);
    } else {
      const embResult = await generateEmbeddings([query]);
      queryVec = new Float32Array(embResult.vectors[0]);
    }

    const n = chunks.length;
    const dim = 768;

    // 2. Batch-embed chunk summaries/content snippets for keys matrix
    const keyTexts = chunks.map((c) =>
      c.summary ? c.summary : c.content.slice(0, 200)
    );

    let keysMatrix: Float32Array;
    try {
      const keyEmbResults = await generateEmbeddings(keyTexts);
      keysMatrix = new Float32Array(n * dim);
      for (let i = 0; i < n; i++) {
        const vec = keyEmbResults.vectors[i];
        if (vec && vec.length === dim) {
          keysMatrix.set(vec, i * dim);
        }
      }
    } catch (embErr) {
      console.warn('[ace/rank] Key embedding failed, returning original order:', embErr);
      return json({
        chunks: chunks as ACEContextChunk[],
        attentionSource: 'cpu-fallback',
        durationMs: Math.round(performance.now() - t0),
      });
    }

    // 3. GPU attention scoring
    let weights: Float32Array;
    let attentionSource: string;
    try {
      const result = await scoreAttention(queryVec, dim, keysMatrix, n);
      weights = result.scores;
      attentionSource = result.source;
    } catch (gpuErr) {
      console.warn('[ace/rank] attentionScoreGPU failed, returning original order:', gpuErr);
      return json({
        chunks: chunks as ACEContextChunk[],
        attentionSource: 'cpu-fallback',
        durationMs: Math.round(performance.now() - t0),
      });
    }

    // 4. Re-sort chunks by attention weight descending
    const indexed = Array.from({ length: n }, (_, i) => ({
      chunk: chunks[i] as ACEContextChunk,
      weight: weights[i] ?? 0,
    }));
    indexed.sort((a, b) => b.weight - a.weight);
    const rerankedChunks = indexed.map(({ chunk }) => chunk);

    return json({
      chunks: rerankedChunks,
      attentionSource,
      durationMs: Math.round(performance.now() - t0),
    });
  } catch (err) {
    console.error('[ace/rank] Error:', err);
    // Degraded: attempt to return original order from parsed body
    try {
      const fallbackRaw = await request.clone().json().catch(() => null);
      const fallbackChunks = fallbackRaw?.chunks ?? [];
      return json({
        chunks: fallbackChunks,
        attentionSource: 'error',
        durationMs: Math.round(performance.now() - t0),
      });
    } catch {
      return json({
        chunks: [],
        attentionSource: 'error',
        durationMs: Math.round(performance.now() - t0),
      });
    }
  }
};
