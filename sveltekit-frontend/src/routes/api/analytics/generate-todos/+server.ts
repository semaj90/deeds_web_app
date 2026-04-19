/**
 * POST /api/analytics/generate-todos
 *
 * Runs Gemma4 gap analysis over the last N days of search analytics to
 * generate a prioritised predictive to-do list stored in `predictive_todos`.
 *
 * Analysis inputs (all from Postgres):
 *   - chunk_hit_log cluster heat map (which clusters are hit vs dark)
 *   - rag_query_log low-rerank queries (which questions keep missing)
 *   - qlora_examples coverage (which clusters have no training examples)
 *   - query_variance_pairs (which question families are most diverse)
 *
 * Returns { jobId } immediately. Poll GET ?jobId=<id> for completion.
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { pool } from '$lib/server/db/client';
import { bifrostChat } from '$lib/server/ollama.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

// ── Schema ────────────────────────────────────────────────────────────────

const bodySchema = z.object({
	days:   z.number().int().min(1).max(30).default(7),
	dryRun: z.boolean().default(false),
});

// ── Job tracker ───────────────────────────────────────────────────────────

interface TodoJob {
  jobId: string;
  status: 'running' | 'done' | 'error';
  startedAt: string;
  finishedAt?: string;
  inserted?: number;
  error?: string;
}
const jobs = new Map<string, TodoJob>();

// ── POST — fire-and-forget analysis ───────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const { days, dryRun } = parsed.data;

	const jobId = randomUUID();
  const job: TodoJob = { jobId, status: 'running', startedAt: new Date().toISOString() };
  jobs.set(jobId, job);

	_runAnalysis(job, days, dryRun, locals.user.id).catch((err) => {
    job.status = 'error';
    job.finishedAt = new Date().toISOString();
    job.error = String((err as { message?: string })?.message ?? err);
  });

	return json({ jobId, status: 'started', days, dryRun });
};

// ── GET — poll ────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const jobId = url.searchParams.get('jobId');
  if (!jobId) {
    const recent = await pool
      .query<{
        id: string;
        todo_type: string;
        gpu_cluster: number | null;
        reason: string;
        suggested_action: string;
        estimated_impact: string;
        status: string;
        generated_at: string;
      }>(
        `SELECT id::text, todo_type, gpu_cluster, reason, suggested_action,
			        estimated_impact, status, generated_at::text
			 FROM   predictive_todos
			 ORDER  BY generated_at DESC
			 LIMIT  30`
      )
      .then((r) => r.rows)
      .catch(
        (): Array<{
          id: string;
          todo_type: string;
          gpu_cluster: number | null;
          reason: string;
          suggested_action: string;
          estimated_impact: string;
          status: string;
          generated_at: string;
        }> => []
      );

    return json({ todos: recent, jobs: [...jobs.values()].slice(-5) });
  }

	const job = jobs.get(jobId);
  if (!job) return json({ error: 'Job not found' }, { status: 404 });
  return json(job);
};

// ── Core analysis ─────────────────────────────────────────────────────────

async function _runAnalysis(
  job: TodoJob,
  days: number,
  dryRun: boolean,
  userId: string
): Promise<void> {
  // 1. Cluster heat map — identify hot and cold clusters
  const clusterHeat = await pool
    .query<{
      gpu_cluster: number;
      total_hits: number;
      unique_queries: number;
      avg_rerank: number | null;
      ace_hits: number;
      rag_hits: number;
      kag_hits: number;
    }>(
      `SELECT gpu_cluster,
		        COUNT(*)::int                                    AS total_hits,
		        COUNT(DISTINCT query_hash)::int                  AS unique_queries,
		        AVG(rerank_score)::real                          AS avg_rerank,
		        COUNT(*) FILTER (WHERE pipeline='ace')::int      AS ace_hits,
		        COUNT(*) FILTER (WHERE pipeline='rag')::int      AS rag_hits,
		        COUNT(*) FILTER (WHERE pipeline='kag')::int      AS kag_hits
		 FROM   chunk_hit_log
		 WHERE  hit_at > NOW() - ($1 || ' days')::interval
		   AND  gpu_cluster IS NOT NULL
		 GROUP  BY gpu_cluster
		 ORDER  BY total_hits DESC`,
      [String(days)]
    )
    .then((r) => r.rows)
    .catch(
      (): Array<{
        gpu_cluster: number;
        total_hits: number;
        unique_queries: number;
        avg_rerank: number | null;
        ace_hits: number;
        rag_hits: number;
        kag_hits: number;
      }> => []
    );

  // 2. Low-rerank queries — what keeps getting poor results
  const lowRerankQueries = await pool
    .query<{
      query: string;
      avg_rerank: number;
      hit_count: number;
    }>(
      `SELECT rl.query,
		        AVG(hl.rerank_score)::real AS avg_rerank,
		        COUNT(hl.id)::int         AS hit_count
		 FROM   rag_query_log rl
		 JOIN   chunk_hit_log hl ON hl.query_hash = rl.query_hash
		 WHERE  rl.created_at > NOW() - ($1 || ' days')::interval
		   AND  hl.rerank_score IS NOT NULL
		 GROUP  BY rl.query
		 HAVING AVG(hl.rerank_score) < 0.45
		 ORDER  BY avg_rerank ASC
		 LIMIT  10`,
      [String(days)]
    )
    .then((r) => r.rows)
    .catch((): Array<{ query: string; avg_rerank: number; hit_count: number }> => []);

  // 3. Clusters with no QLoRA training examples
  const untrainedClusters = await pool
    .query<{ gpu_cluster: number }>(
      `SELECT DISTINCT chl.gpu_cluster
		 FROM   chunk_hit_log chl
		 WHERE  chl.hit_at > NOW() - ($1 || ' days')::interval
		   AND  chl.gpu_cluster IS NOT NULL
		   AND  NOT EXISTS (
		     SELECT 1 FROM qlora_examples qe
		     WHERE  qe.gpu_clusters @> to_jsonb(chl.gpu_cluster)
		   )
		 LIMIT  10`,
      [String(days)]
    )
    .then((r) => r.rows)
    .catch((): Array<{ gpu_cluster: number }> => []);

  // 4. Most diverse query families (variance pairs — need more coverage)
  const highVariance = await pool
    .query<{ query_a: string; variant_count: number }>(
      `SELECT query_a,
		        COUNT(*)::int AS variant_count
		 FROM   query_variance_pairs
		 WHERE  last_seen > NOW() - ($1 || ' days')::interval
		 GROUP  BY query_a
		 ORDER  BY variant_count DESC
		 LIMIT  5`,
      [String(days)]
    )
    .then((r) => r.rows)
    .catch((): Array<{ query_a: string; variant_count: number }> => []);

  // 5. Collection name bug check (old codebase_chunks still returning 0 results)
  //    Proxy: rag_query_log rows with total_found = 0
  const zeroResultQueries = await pool
    .query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
		 FROM   rag_query_log
		 WHERE  total_found = 0
		   AND  created_at > NOW() - ($1 || ' days')::interval`,
      [String(days)]
    )
    .then((r) => r.rows)
    .catch((): Array<{ cnt: number }> => [{ cnt: 0 }]);

  // 6. Feed to Gemma4 for structured gap analysis
  const analysisInput = JSON.stringify(
    {
      period_days: days,
      cluster_heat: clusterHeat.slice(0, 15),
      low_rerank_queries: lowRerankQueries,
      untrained_clusters: untrainedClusters,
      high_variance_queries: highVariance,
      zero_result_queries: zeroResultQueries[0]?.cnt ?? 0,
    },
    null,
    2
  );

  const prompt = `You are a codebase intelligence system analyst.
Analyse the following search analytics and generate a prioritised to-do list.

Analytics data:
${analysisInput}

Rules:
- Identify clusters with high hit count but low avg_rerank (< 0.45) → need cluster summary
- Identify clusters with 0 hits in period → may be dark/irrelevant → flag for review
- Identify untrained_clusters → add_qlora_training action
- low_rerank_queries with avg_rerank < 0.35 → add_kb_article for those topics
- zero_result_queries > 5 → fix_collection action (codebase_chunks vs codebase_chunks_768)
- high_variance query families → suggest cluster_summary for the dominant cluster

Output ONLY valid JSON matching this schema:
{
  "todos": [
    {
      "todo_type": "add_cluster_summary|reindex_cluster|add_kb_article|fix_collection|qlora_retrain|add_qlora_training",
      "gpu_cluster": <number or null>,
      "reason": "<1-2 sentence explanation citing the data>",
      "suggested_action": "<specific API call or action>",
      "estimated_impact": "high|medium|low"
    }
  ]
}

Generate 5-10 todos ordered by estimated impact descending.`;

  let todos: Array<{
    todo_type: string;
    gpu_cluster: number | null;
    reason: string;
    suggested_action: string;
    estimated_impact: string;
  }> = [];

  try {
    const raw = await bifrostChat([{ role: 'user', content: prompt }], 'gemma4-legal:latest', {
      temperature: 0.1,
      maxTokens: 1500,
      cacheKey: `generate-todos-${days}d`,
    });

    // Extract JSON from possible markdown fencing
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = fastJsonParse<{ todos?: typeof todos }>(jsonMatch[0]);
      todos = parsed?.todos ?? [];
    }
  } catch (err) {
    console.warn('[generate-todos] LLM analysis failed, using rule-based fallback:', err);

    // Rule-based fallback — no LLM needed
    if ((zeroResultQueries[0]?.cnt ?? 0) > 5) {
      todos.push({
        todo_type: 'fix_collection',
        gpu_cluster: null,
        reason: `${zeroResultQueries[0]?.cnt} queries returned 0 results in ${days} days — likely wrong collection name`,
        suggested_action:
          "Fix: change QDRANT_COLLECTION in dual-embedder.ts and codebase-context.ts to 'codebase_chunks_768'",
        estimated_impact: 'high',
      });
    }

    for (const c of clusterHeat
      .filter((h) => h.total_hits > 5 && (h.avg_rerank ?? 1) < 0.45)
      .slice(0, 3)) {
      todos.push({
        todo_type: 'add_cluster_summary',
        gpu_cluster: c.gpu_cluster,
        reason: `Cluster ${c.gpu_cluster} hit ${c.total_hits}× with avg rerank ${(c.avg_rerank ?? 0).toFixed(2)} — no cluster summary exists`,
        suggested_action: `POST /api/codebase-index/cluster-summary with { clusterId: ${c.gpu_cluster}, force: true }`,
        estimated_impact: 'high',
      });
    }

    for (const c of untrainedClusters.slice(0, 3)) {
      todos.push({
        todo_type: 'add_qlora_training',
        gpu_cluster: c.gpu_cluster,
        reason: `Cluster ${c.gpu_cluster} has hits but no QLoRA training examples`,
        suggested_action: `POST /api/analytics/qlora-dataset to trigger distillation pass covering cluster ${c.gpu_cluster}`,
        estimated_impact: 'medium',
      });
    }
  }

  if (!dryRun && todos.length > 0) {
    let inserted = 0;
    for (const t of todos) {
      try {
        await pool.query(
          `INSERT INTO predictive_todos (todo_type, gpu_cluster, reason, suggested_action, estimated_impact, metadata)
					 VALUES ($1, $2, $3, $4, $5, $6::jsonb)
					 ON CONFLICT DO NOTHING`,
          [
            t.todo_type,
            t.gpu_cluster ?? null,
            t.reason.slice(0, 1000),
            t.suggested_action.slice(0, 500),
            t.estimated_impact,
            JSON.stringify({ userId, days, generatedBy: 'gemma4-legal' }),
          ]
        );
        inserted++;
      } catch {
        /* skip duplicate */
      }
    }
    job.inserted = inserted;
  } else if (dryRun) {
    job.inserted = todos.length;
  }

  job.status = 'done';
  job.finishedAt = new Date().toISOString();
}

// ── PATCH — update todo status (dismiss / mark done) ─────────────────────

export const PATCH: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const raw = await request.json().catch(() => ({})) as { id?: string; status?: string };
  const { id, status } = raw;
  if (!id || !status) return json({ error: 'id and status required' }, { status: 400 });

  const allowed = ['pending', 'in_progress', 'done', 'dismissed'];
  if (!allowed.includes(status)) return json({ error: 'invalid status' }, { status: 400 });

  await pool.query(
    `UPDATE predictive_todos SET status = $1, resolved_at = CASE WHEN $1 IN ('done','dismissed') THEN now() ELSE resolved_at END WHERE id = $2`,
    [status, id]
  ).catch(() => null);

  return json({ ok: true });
};
