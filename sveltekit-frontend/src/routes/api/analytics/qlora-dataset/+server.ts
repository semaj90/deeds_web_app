/**
 * POST /api/analytics/qlora-dataset
 *
 * Distills high-quality RAG/ACE interactions into QLoRA training examples.
 *
 * Selection gate:
 *   - top_rerank_score >= minRerankScore (default 0.80)
 *   - response self-eval score >= minResponseScore (default 0.80)
 *   - not already captured in qlora_examples for this query_hash
 *
 * For each qualifying row in rag_query_log:
 *   1. Pull top chunk_hit_log hits for that query_hash
 *   2. Fetch cluster narrative from Redis (CouchDB fallback)
 *   3. Re-fetch the LLM response from inference_log (CouchDB)
 *   4. Format as instruction + context + response
 *   5. INSERT INTO qlora_examples
 *
 * GET /api/analytics/qlora-dataset
 *   Returns dataset stats + last 10 examples.
 *
 * GET /api/analytics/qlora-dataset?export=jsonl
 *   Streams JSONL export in Alpaca format (for trl/transformers QLoRA training).
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { pgRows } from '$lib/server/db/client';
import { getRedis } from '$lib/server/redis.js';
import { queryHash } from '$lib/server/analytics/search-analytics.js';

// ── Schema ─────────────────────────────────────────────────────────────────

const bodySchema = z.object({
  minRerankScore:   z.number().min(0).max(1).default(0.80),
  minResponseScore: z.number().min(0).max(1).default(0.80),
  limit:            z.number().int().min(1).max(500).default(100),
  dryRun:           z.boolean().default(false),
});

// ── Alpaca format helper ───────────────────────────────────────────────────

interface AlpacaExample {
  instruction: string;
  input:       string;   // retrieved context chunks
  output:      string;   // LLM response
  metadata: {
    quality_tier:     string;
    avg_rerank_score: number | null;
    gpu_clusters:     number[];
    pipeline_hits:    Record<string, number>;
    created_at:       string;
  };
}

function toAlpacaFormat(row: {
  instruction: string;
  context_chunks: unknown;
  graph_summary: string | null;
  response: string;
  quality_tier: string;
  avg_rerank_score: number | null;
  gpu_clusters: unknown;
  pipeline_hits: unknown;
  created_at: string;
}): AlpacaExample {
  const chunks = (Array.isArray(row.context_chunks) ? row.context_chunks : []) as Array<{
    content?: string; filePath?: string; score?: number;
  }>;

  const contextText = [
    row.graph_summary ? `## Cluster Summary\n${row.graph_summary}\n` : '',
    chunks.length
      ? `## Retrieved Context\n${chunks.map((c, i) =>
          `### Chunk ${i + 1}${c.filePath ? ` (${c.filePath})` : ''}\n${c.content ?? ''}`
        ).join('\n\n')}`
      : '',
  ].filter(Boolean).join('\n');

  const clusters = Array.isArray(row.gpu_clusters)
    ? (row.gpu_clusters as number[])
    : [];

  const hits = (typeof row.pipeline_hits === 'object' && row.pipeline_hits !== null)
    ? (row.pipeline_hits as Record<string, number>)
    : {};

  return {
    instruction: row.instruction,
    input:       contextText,
    output:      row.response,
    metadata: {
      quality_tier:     row.quality_tier,
      avg_rerank_score: row.avg_rerank_score,
      gpu_clusters:     clusters,
      pipeline_hits:    hits,
      created_at:       row.created_at,
    },
  };
}

// ── POST — run distillation job ────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw    = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  const { minRerankScore, minResponseScore, limit, dryRun } =
    parsed.success ? parsed.data : bodySchema.parse({});

  // 1. Find qualifying query_log rows not yet in qlora_examples
  const candidates = await pgRows<{
    query: string;
    query_hash: string;
    top_rerank_score: number | null;
    entity_statutes: unknown;
    entity_cases: unknown;
    created_at: string;
  }>(
    `SELECT ql.query, ql.query_hash, ql.top_rerank_score,
            ql.entity_statutes, ql.entity_cases, ql.created_at::text
     FROM   rag_query_log ql
     WHERE  ql.top_rerank_score >= $1
       AND  NOT EXISTS (
         SELECT 1 FROM qlora_examples qe WHERE qe.query_hash = ql.query_hash
       )
     ORDER  BY ql.top_rerank_score DESC
     LIMIT  $2`,
    [minRerankScore, limit]
  ).catch(() => []);

  if (dryRun) {
    return json({ dryRun: true, candidates: candidates.length });
  }

  let inserted = 0;
  const skipped: string[] = [];

  for (const row of candidates) {
    try {
      // 2. Pull top chunk hits for this query
      const hits = await pgRows<{
        chunk_id: string;
        relative_path: string;
        gpu_cluster: number | null;
        pipeline: string;
        score: number;
        rerank_score: number | null;
      }>(
        `SELECT chunk_id, relative_path, gpu_cluster, pipeline,
                score, rerank_score
         FROM   chunk_hit_log
         WHERE  query_hash = $1
         ORDER  BY COALESCE(rerank_score, score) DESC
         LIMIT  10`,
        [row.query_hash]
      ).catch(() => []);

      if (hits.length === 0) { skipped.push(row.query_hash); continue; }

      // 3. Fetch cluster narrative from Redis (fast path)
      const redis   = getRedis();
      const topCluster = hits.find((h) => h.gpu_cluster != null)?.gpu_cluster;
      let graphSummary: string | null = null;
      if (topCluster != null) {
        const cached = await redis.get(`cluster-summary:${topCluster}`).catch(() => null);
        if (cached) {
          const parsed = JSON.parse(cached) as { summary?: string; purpose?: string };
          graphSummary = parsed.summary ?? parsed.purpose ?? null;
        }
      }

      // 4. Fetch LLM response from inference_log (CouchDB) — best-effort
      let llmResponse = '';
      try {
        const couchUrl = process.env.COUCHDB_URL ?? 'http://localhost:5984';
        const couchRes = await fetch(
          `${couchUrl}/inference_log/_find`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              selector: { query_hash: row.query_hash },
              sort:     [{ created_at: 'desc' }],
              limit:    1,
              fields:   ['response', 'self_eval_score'],
            }),
            signal: AbortSignal.timeout(5_000),
          }
        );
        if (couchRes.ok) {
          const data = await couchRes.json() as {
            docs?: Array<{ response?: string; self_eval_score?: number }>;
          };
          const doc = data.docs?.[0];
          if (doc?.response && (doc.self_eval_score ?? 0) >= minResponseScore) {
            llmResponse = doc.response;
          }
        }
      } catch { /* non-fatal */ }

      if (!llmResponse) { skipped.push(row.query_hash); continue; }

      // 5. Compute quality tier
      const avgRerank = hits.reduce((s, h) => s + (h.rerank_score ?? h.score), 0) / hits.length;
      const tier = avgRerank >= 0.90 ? 'gold' : avgRerank >= 0.80 ? 'silver' : 'bronze';

      const clusterIds   = [...new Set(hits.map((h) => h.gpu_cluster).filter((c): c is number => c != null))];
      const pipelineHits = hits.reduce<Record<string, number>>((acc, h) => {
        acc[h.pipeline] = (acc[h.pipeline] ?? 0) + 1;
        return acc;
      }, {});

      const contextChunks = hits.map((h) => ({
        id:           h.chunk_id,
        filePath:     h.relative_path,
        pipeline:     h.pipeline,
        score:        h.score,
        rerankScore:  h.rerank_score,
        // content omitted here — fetched from Qdrant/pgvector in training scripts
      }));

      // 6. Insert into qlora_examples
      await pgRows(
        `INSERT INTO qlora_examples
           (query, query_hash, instruction, context_chunks, graph_summary,
            response, response_score, pipeline_hits, gpu_clusters, avg_rerank_score,
            entity_tags, quality_tier, model_version)
         VALUES
           ($1, $2, $3, $4::jsonb, $5, $6, $7, $8::jsonb, $9::jsonb, $10,
            $11::jsonb, $12, $13)
         ON CONFLICT DO NOTHING`,
        [
          row.query,
          row.query_hash,
          row.query.trim(),                       // instruction
          JSON.stringify(contextChunks),           // context_chunks
          graphSummary,                            // graph_summary
          llmResponse,                             // response
          avgRerank,                               // response_score
          JSON.stringify(pipelineHits),            // pipeline_hits
          JSON.stringify(clusterIds),              // gpu_clusters
          avgRerank,                               // avg_rerank_score
          JSON.stringify([
            ...((row.entity_statutes as string[]) ?? []),
            ...((row.entity_cases   as string[]) ?? []),
          ]),
          tier,                                    // quality_tier
          process.env.OLLAMA_MODEL ?? 'gemma4-legal',
        ]
      );

      inserted++;
    } catch (err) {
      console.warn('[qlora-dataset] Failed to insert example:', err);
      skipped.push(row.query_hash);
    }
  }

  return json({
    candidates: candidates.length,
    inserted,
    skipped: skipped.length,
    dryRun: false,
  });
};

// ── GET — stats + export ───────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const exportFormat = url.searchParams.get('export');

  // JSONL export for QLoRA training — hydrates chunk content from pgvector
  if (exportFormat === 'jsonl') {
    const split    = url.searchParams.get('split') ?? 'train';
    const hydrate  = url.searchParams.get('hydrate') !== 'false'; // default true

    const rows = await pgRows<{
      instruction: string;
      context_chunks: unknown;
      graph_summary: string | null;
      response: string;
      quality_tier: string;
      avg_rerank_score: number | null;
      gpu_clusters: unknown;
      pipeline_hits: unknown;
      created_at: string;
    }>(
      `SELECT instruction, context_chunks, graph_summary, response,
              quality_tier, avg_rerank_score, gpu_clusters, pipeline_hits,
              created_at::text
       FROM   qlora_examples
       WHERE  dataset_split = $1
       ORDER  BY response_score DESC`,
      [split]
    ).catch(() => []);

    // Hydrate chunk content from pgvector mirror (codebase_chunk_index)
    // Groups all chunk IDs across all rows into one batched query
    if (hydrate && rows.length > 0) {
      const allChunkIds = new Set<string>();
      for (const row of rows) {
        const chunks = Array.isArray(row.context_chunks) ? row.context_chunks : [];
        for (const c of chunks as Array<{ id?: string }>) {
          if (c.id) allChunkIds.add(c.id);
        }
      }

      // Batch fetch content from pgvector mirror
      const contentMap = new Map<string, string>();
      if (allChunkIds.size > 0) {
        const ids = [...allChunkIds].slice(0, 1000); // safety cap
        const contentRows = await pgRows<{ qdrant_id: string; content: string }>(
          `SELECT qdrant_id, content
           FROM   codebase_chunk_index
           WHERE  qdrant_id = ANY($1::text[])`,
          [ids]
        ).catch(() => []);
        for (const r of contentRows) {
          contentMap.set(r.qdrant_id, r.content);
        }

        // Fallback: also query Qdrant for any IDs not in pgvector
        const missing = ids.filter((id) => !contentMap.has(id));
        if (missing.length > 0) {
          try {
            const qdrantUrl = process.env.QDRANT_URL ?? 'http://localhost:6333';
            const res = await fetch(
              `${qdrantUrl}/collections/codebase_chunks_768/points`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: missing, with_payload: true, with_vector: false }),
                signal: AbortSignal.timeout(10_000),
              }
            );
            if (res.ok) {
              const data = await res.json() as { result?: Array<{ id: string; payload?: { content?: string } }> };
              for (const pt of data.result ?? []) {
                if (pt.payload?.content) contentMap.set(String(pt.id), pt.payload.content);
              }
            }
          } catch { /* Qdrant unavailable — use stub content */ }
        }
      }

      // Inject content back into context_chunks
      for (const row of rows) {
        const chunks = Array.isArray(row.context_chunks) ? row.context_chunks : [];
        (row as Record<string, unknown>).context_chunks = (chunks as Array<{ id?: string }>).map((c) => ({
          ...c,
          content: (c.id && contentMap.has(c.id)) ? contentMap.get(c.id) : undefined,
        }));
      }
    }

    const body = rows.map((r) => JSON.stringify(toAlpacaFormat(r))).join('\n');
    return new Response(body, {
      headers: {
        'Content-Type':        'application/x-ndjson',
        'Content-Disposition': `attachment; filename="qlora_${split}_${Date.now()}.jsonl"`,
      },
    });
  }

  // Stats + preview
  const [stats, recent] = await Promise.all([
    pgRows<{ quality_tier: string; cnt: number; avg_score: number }>(
      `SELECT quality_tier, COUNT(*)::int AS cnt, AVG(response_score)::real AS avg_score
       FROM   qlora_examples GROUP BY quality_tier ORDER BY quality_tier`
    ).catch(() => []),
    pgRows<{
      instruction: string; quality_tier: string;
      avg_rerank_score: number | null; created_at: string;
    }>(
      `SELECT instruction, quality_tier, avg_rerank_score, created_at::text
       FROM   qlora_examples ORDER BY created_at DESC LIMIT 10`
    ).catch(() => []),
  ]);

  return json({ stats, recent });
};
