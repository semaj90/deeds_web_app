/**
 * VLM Cluster-to-Narrative Synthesis (Step 5)
 *
 * Generates a structured narrative for a GPU k-means cluster by:
 *   1. Scrolling Qdrant for the top-pageRank chunks in that cluster
 *   2. Feeding them to Gemma4-legal for structured summarisation
 *   3. Caching the result in Redis (6h TTL)
 *
 * Powers the "What does cluster N do?" answer in the codebase viewer
 * and in Claude / Copilot context enrichment.
 */
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { pool } from '$lib/server/db/client';
import { TTL, clusterSummaryKey } from '$lib/server/cache-keys.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';

const QDRANT_COLLECTION = 'codebase_chunks_768';
const TOP_CHUNKS         = 10;
const MODEL = ENV.OLLAMA_CHAT_MODEL;

export interface ClusterSummary {
	clusterId: number;
	summary:   string;
	purpose:   string;
	patterns:  string[];
	keyFiles:  string[];
	warnings:  string[];
	generatedAt: string;
}

// ── Redis helpers ─────────────────────────────────────────────────────────────

async function getCache(clusterId: number): Promise<ClusterSummary | null> {
	try {
		const { getJson } = await import('$lib/server/redis.js');
		return await getJson<ClusterSummary>(clusterSummaryKey.cached(clusterId));
	} catch {
		return null;
	}
}

async function setCache(summary: ClusterSummary): Promise<void> {
	try {
		const { setJsonWithTtl } = await import('$lib/server/redis.js');
		await setJsonWithTtl(
			clusterSummaryKey.cached(summary.clusterId),
			summary,
			TTL.CLUSTER_SUMMARY,
		);
	} catch { /* non-fatal */ }
}

// ── Qdrant scroll for cluster chunks ────────────────────────────────────────

interface QdrantPoint {
	id: number | string;
	payload: Record<string, unknown>;
}

async function fetchClusterChunksFromPostgres(clusterId: number): Promise<QdrantPoint[]> {
  try {
    const result = await pool.query<{
      qdrant_id: string | null;
      relative_path: string;
      symbol: string | null;
      kind: string | null;
      content: string | null;
      tags: unknown;
      page_rank_score: number | null;
      gpu_cluster: number | null;
      som_cluster: number | null;
      cluster_summary: unknown;
    }>(
      `SELECT qdrant_id,
			        relative_path,
			        symbol,
			        kind,
			        content,
			        tags,
			        page_rank_score,
			        gpu_cluster,
			        som_cluster,
			        cluster_summary
		   FROM codebase_chunk_index
		  WHERE (gpu_cluster = $1 OR som_cluster = $1)
		    AND relative_path IS NOT NULL
		    AND relative_path <> ''
		    AND relative_path <> '__unknown__'
		  ORDER BY COALESCE(page_rank_score, 0) DESC,
		           indexed_at DESC
		  LIMIT 50`,
      [clusterId]
    );

    return result.rows.map((row) => ({
      id: row.qdrant_id ?? row.relative_path,
      payload: {
        relativePath: row.relative_path,
        path: row.relative_path,
        symbol: row.symbol ?? '',
        kind: row.kind ?? '',
        content: row.content ?? '',
        tags: Array.isArray(row.tags) ? row.tags : [],
        pagerank_score: row.page_rank_score ?? 0,
        neo4j_gpuCluster: row.gpu_cluster ?? null,
        som_cluster: row.som_cluster ?? null,
        cluster_summary: row.cluster_summary ?? {},
      },
    }));
  } catch {
    return [];
  }
}

async function fetchClusterChunks(clusterId: number): Promise<QdrantPoint[]> {
  // Qdrant-first: has full content + relativePath; Postgres mirror is sparse
  const filter = {
    should: [
      { key: 'neo4j_gpuCluster', match: { value: clusterId } },
      { key: 'som_cluster', match: { value: clusterId } },
    ],
  };

  let points: QdrantPoint[] = [];
  try {
    const res = await fetch(`${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: 50,
        with_payload: true,
        with_vector: false,
        filter,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (res.ok) {
      const data = await res.json();
      points = data.result?.points ?? [];
    } else {
      console.log(`[cluster-summary] Qdrant scroll failed: ${res.status}`);
    }
  } catch (err) {
    console.log(`[cluster-summary] Qdrant unreachable: ${(err as Error)?.message}`);
  }

  const withContent = points.filter((p) => String(p.payload['content'] ?? '').length > 10);
  console.log(`[cluster-summary] Qdrant: ${points.length} raw, ${withContent.length} with content`);

  if (withContent.length > 0) {
    // Sort by pageRankScore DESC (prefer Colab bare key, then CouchDB, then local)
    withContent.sort((a, b) => {
      const scoreOf = (p: QdrantPoint) =>
        (p.payload['pagerank_score'] as number | undefined) ??
        (p.payload['pagerank_score_couchdb'] as number | undefined) ??
        (p.payload['neo4j_pageRankScore'] as number | undefined) ??
        0;
      return scoreOf(b) - scoreOf(a);
    });
    return withContent.slice(0, TOP_CHUNKS);
  }

  // Fallback: Postgres mirror (only if Qdrant returned nothing useful)
  console.log(`[cluster-summary] Qdrant empty, falling back to Postgres`);
  const postgresChunks = await fetchClusterChunksFromPostgres(clusterId);
  const pgWithContent = postgresChunks.filter(
    (p) => String(p.payload['content'] ?? '').length > 10
  );
  console.log(
    `[cluster-summary] Postgres fallback: ${postgresChunks.length} rows, ${pgWithContent.length} with content`
  );
  return pgWithContent.slice(0, TOP_CHUNKS);
}

async function embedSummary(summary: string): Promise<number[] | null> {
  try {
    const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: summary }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { embedding?: number[]; embeddings?: number[][] };
    return data.embedding ?? data.embeddings?.[0] ?? null;
  } catch {
    return null;
  }
}

async function persistClusterSummary(summary: ClusterSummary): Promise<void> {
  try {
    // 1. Update codebase_chunk_index.cluster_summary + output_meta JSONB for all chunks in this cluster.
    //    Skip path-less stub rows — they have no content for the summary to describe.
    const outputMeta = {
      summary:  summary.summary,
      model:    MODEL,
      pipeline: 'ace',
      generatedAt: summary.generatedAt,
    };

    await pool.query(
      `UPDATE codebase_chunk_index
			    SET cluster_summary = $1::jsonb,
              output_meta     = $2::jsonb,
			        enriched_at     = NOW(),
			        updated_at      = NOW()
			  WHERE (gpu_cluster = $3 OR som_cluster = $3)
			    AND relative_path IS NOT NULL
			    AND relative_path <> ''
			    AND relative_path <> '__unknown__'`,
      [JSON.stringify(summary), JSON.stringify(outputMeta), summary.clusterId]
    );

    const summaryEmbedding = await embedSummary(summary.summary);
    if (summaryEmbedding) {
      await pool.query(
        `UPDATE codebase_chunk_index
				    SET summary_embedding = $1::vector,
				        enriched_at = NOW(),
				        updated_at = NOW()
				  WHERE (gpu_cluster = $2 OR som_cluster = $2)
				    AND relative_path IS NOT NULL
				    AND relative_path <> ''
				    AND relative_path <> '__unknown__'`,
        [JSON.stringify(summaryEmbedding), summary.clusterId]
      );
    }

    // 2. Upsert into cluster_summaries table (primary read path for fix-recommender)
    await pool.query(
      `INSERT INTO cluster_summaries
              (repo_id, gpu_cluster, summary, purpose, patterns, warnings, tags, updated_at)
       VALUES ('default', $1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (repo_id, gpu_cluster) DO UPDATE
          SET summary    = EXCLUDED.summary,
              purpose    = EXCLUDED.purpose,
              patterns   = EXCLUDED.patterns,
              warnings   = EXCLUDED.warnings,
              tags       = EXCLUDED.tags,
              updated_at = NOW()`,
      [
        summary.clusterId,
        summary.summary,
        summary.purpose,
        summary.patterns,
        summary.warnings,
        summary.keyFiles,
      ]
    );

    // 3. Push summary payload to Qdrant so dual-vector search results carry it
    await pushSummaryToQdrant(summary).catch((err) => {
      console.warn(
        `[cluster-summary] Qdrant payload push failed for cluster ${summary.clusterId} (non-fatal):`,
        (err as Error)?.message
      );
    });
  } catch (err) {
    console.warn(
      `[cluster-summary] PostgreSQL mirror failed for cluster ${summary.clusterId}:`,
      (err as Error)?.message
    );
  }
}

/**
 * Fetch all Qdrant point IDs that belong to this cluster and batch-update
 * their payload with cluster_purpose + cluster_summary_text so downstream
 * dual-vector search results carry the cluster narrative without an extra DB hop.
 */
async function pushSummaryToQdrant(summary: ClusterSummary): Promise<void> {
  const filter = {
    should: [
      { key: 'neo4j_gpuCluster', match: { value: summary.clusterId } },
      { key: 'som_cluster',      match: { value: summary.clusterId } },
    ],
  };

  // Scroll for point IDs only (no vectors needed)
  const scrollRes = await fetch(
    `${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 500, with_vector: false, with_payload: false, filter }),
      signal: AbortSignal.timeout(15_000),
    }
  );
  if (!scrollRes.ok) return;

  const scrollData = await scrollRes.json();
  const pointIds: Array<string | number> = (scrollData.result?.points ?? []).map(
    (p: { id: string | number }) => p.id
  );
  if (pointIds.length === 0) return;

  // Batch-update payload (all points in cluster get same summary fields)
  const BATCH = 100;
  for (let i = 0; i < pointIds.length; i += BATCH) {
    const batch = pointIds.slice(i, i + BATCH);
    await fetch(
      `${ENV.QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payload: {
            cluster_id:           summary.clusterId,
            cluster_purpose:      summary.purpose,
            cluster_summary_text: summary.summary,
            cluster_patterns:     summary.patterns,
            cluster_warnings:     summary.warnings,
            cluster_tags:         summary.keyFiles,
          },
          points: batch,
        }),
        signal: AbortSignal.timeout(20_000),
      }
    );
  }
}

// ── JSON extraction (handles markdown code fences) ───────────────────────────

function extractJson(text: string): string {
	// Strip ```json ... ``` fences if present
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (fenced) return fenced[1].trim();
	// Grab first {...} block
	const obj = text.match(/\{[\s\S]*\}/);
	return obj ? obj[0] : text.trim();
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Generate (or retrieve cached) a structured narrative for a GPU cluster.
 *
 * @param clusterId  GPU k-means / SOM cluster index
 * @param force      Bypass Redis cache and regenerate (default: false)
 */
export type ClusterSummaryResult =
  | { ok: true; summary: ClusterSummary }
  | { ok: false; reason: string };

export async function generateClusterSummary(
  clusterId: number,
  force = false
): Promise<ClusterSummaryResult> {
  if (!force) {
    const cached = await getCache(clusterId);
    if (cached) return { ok: true, summary: cached };
  }

  const chunks = await fetchClusterChunks(clusterId);
  if (chunks.length === 0)
    return { ok: false, reason: `No chunks found in Postgres or Qdrant for cluster ${clusterId}` };

  // Build the code context for the LLM
  const chunkText = chunks
    .map((pt) => {
      const p = pt.payload;
      const path = String(p['relativePath'] ?? p['path'] ?? 'unknown');
      const kind = String(p['kind'] ?? '');
      const sym = String(p['symbol'] ?? '');
      const content = String(p['content'] ?? '').slice(0, 600);
      return `// ${path} [${kind}${sym ? ': ' + sym : ''}]\n${content}`;
    })
    .join('\n\n---\n\n');

  const systemPrompt =
    'You are a senior code architect. Analyse the following source files and output ONLY valid JSON ' +
    '(no markdown fences, no prose). The JSON must match this schema exactly:\n' +
    '{ "summary": string, "purpose": string, "patterns": string[], "keyFiles": string[], "warnings": string[] }\n' +
    'summary: 1-2 sentence plain-English description of what this cluster does.\n' +
    'purpose: one-line label (e.g. "Database access layer", "Authentication middleware").\n' +
    'patterns: 3-5 key design/architectural patterns observed (e.g. "Singleton", "Repository pattern").\n' +
    'keyFiles: relative paths of the 3-5 most important files in the cluster.\n' +
    'warnings: any security, performance, or correctness concerns (may be empty array).';

  const userMessage = `Analyse cluster ${clusterId} (${chunks.length} files):\n\n${chunkText}`;

  let raw: string;
  try {
    raw = await traceLLM(
      'codebase-cluster-summary',
      { model: MODEL, clusterId, chunkCount: chunks.length, prompt: userMessage.slice(0, 500) },
      async (gen) => {
        // Direct Ollama call (bypasses Bifrost — Bifrost provider is unreliable)
        const ollamaUrl = `${ENV.OLLAMA_BASE_URL}/api/chat`;
        console.log(`[cluster-summary] Calling Ollama directly: ${ollamaUrl} model=${MODEL}`);
        const res = await ollamaFetch(ollamaUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userMessage },
            ],
            stream: false,
            options: { temperature: 0.2, num_predict: 2048 },
          }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          const message = `Ollama ${res.status}: ${errText.slice(0, 200)}`;
          gen.end({ output: message, level: 'ERROR' });
          throw new Error(message);
        }

        const data = (await res.json()) as { message?: { content?: string } };
        const content = data.message?.content ?? '';
        gen.end({ output: content.slice(0, 1000), level: content ? 'DEFAULT' : 'WARNING' });
        console.log(
          `[cluster-summary] Ollama OK (${content.length} chars) for cluster ${clusterId}`
        );
        return content;
      }
    );
  } catch (err) {
    const msg = (err as Error)?.message ?? 'unknown';
    console.warn(`[cluster-summary] LLM call failed for cluster ${clusterId}:`, msg);
    return { ok: false, reason: `Ollama call failed: ${msg}` };
  }

  if (!raw) {
    console.warn(`[cluster-summary] Empty LLM response for cluster ${clusterId}`);
    return { ok: false, reason: `Ollama returned empty response for cluster ${clusterId}` };
  }

  let parsed: {
    summary: string;
    purpose: string;
    patterns: string[];
    keyFiles: string[];
    warnings: string[];
  };
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    console.warn(
      `[cluster-summary] JSON parse failed for cluster ${clusterId}. Raw:`,
      raw.slice(0, 200)
    );
    return {
      ok: false,
      reason: `JSON parse failed (${raw.length} chars). Preview: ${raw.slice(0, 120)}`,
    };
  }

  const summary: ClusterSummary = {
    clusterId,
    summary: String(parsed.summary ?? ''),
    purpose: String(parsed.purpose ?? ''),
    patterns: Array.isArray(parsed.patterns) ? parsed.patterns.map(String) : [],
    keyFiles: Array.isArray(parsed.keyFiles) ? parsed.keyFiles.map(String) : [],
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map(String) : [],
    generatedAt: new Date().toISOString(),
  };

  await setCache(summary);
  await persistClusterSummary(summary);

  // D19: Record in code-llm-index via recordKagAnswer for ACE preflight memory cascade.
  // This stores the summary in the structured outputMeta JSONB envelope (summary + pipeline tag).
  void import('$lib/server/cache/code-llm-index.js')
    .then(({ recordKagAnswer }) =>
      recordKagAnswer(`cluster:${clusterId}`, summary.summary, {
        glyphClusterId: clusterId,
        model:          MODEL,
      })
    )
    .catch(() => null);

  // Fire-and-forget: generate durable wiki note for this cluster
  import('$lib/server/indexer/karpathy-wiki.js')
    .then(({ generateClusterNote }) => generateClusterNote(clusterId, 'gpu'))
    .catch(() => {
      /* non-fatal */
    });

  return { ok: true, summary };
}
