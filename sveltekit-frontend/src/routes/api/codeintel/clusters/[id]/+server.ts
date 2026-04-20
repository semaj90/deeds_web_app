/**
 * GET  /api/codeintel/clusters/[id]  — fetch one cluster summary
 * POST /api/codeintel/clusters/[id]  — trigger re-summarization (calls Ollama)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { clusterSummaries } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const DEFAULT_MODEL = 'gemma4-legal-fast:latest';
const EMBED_MODEL = 'embeddinggemma:latest';

// ─── GET ─────────────────────────────────────────────────────────────────────

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) return json({ cluster: null, error: 'Unauthorized' }, { status: 401 });

	const clusterId = parseInt(params.id, 10);
	if (isNaN(clusterId) || clusterId < 0) {
		return json({ cluster: null, error: 'Invalid cluster id' }, { status: 400 });
	}

	try {
		const rows = await db
			.select({
				id: clusterSummaries.id,
				repoId: clusterSummaries.repoId,
				gpuCluster: clusterSummaries.gpuCluster,
				summary: clusterSummaries.summary,
				purpose: clusterSummaries.purpose,
				patterns: clusterSummaries.patterns,
				warnings: clusterSummaries.warnings,
				tags: clusterSummaries.tags,
				memberCount: clusterSummaries.memberCount,
				representativeChunkIds: clusterSummaries.representativeChunkIds,
				summaryModel: clusterSummaries.summaryModel,
				centroidDistanceMean: clusterSummaries.centroidDistanceMean,
				hasSummaryEmbedding: sql<boolean>`(summary_embedding IS NOT NULL)`,
				metadataJson: sql<string>`COALESCE(metadata::text, '{}')`,
				updatedAt: sql<string>`COALESCE(updated_at::text, '')`,
			})
			.from(clusterSummaries)
			.where(eq(clusterSummaries.gpuCluster, clusterId))
			.limit(1);

		if (rows.length === 0) {
			return json({ cluster: null, error: 'Not found' }, { status: 404 });
		}
		return json({ cluster: rows[0], error: null });
	} catch {
		return json({ cluster: null, error: null });
	}
};

// ─── POST (re-summarize) ─────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user)
		return json({ ok: false, item: null, degraded: false, error: 'Unauthorized' }, { status: 401 });

	const clusterId = parseInt(params.id, 10);
	if (isNaN(clusterId) || clusterId < 0) {
		return json({ ok: false, item: null, degraded: false, error: 'Invalid cluster id' }, { status: 400 });
	}

	const body = await request.json().catch(() => ({}));
	const model = (body.model as string) || DEFAULT_MODEL;

	// Fetch representative chunks from DB
	let chunkResult: Awaited<ReturnType<typeof db.execute>>;
	try {
		chunkResult = await db.execute(sql`
			SELECT relative_path, COALESCE(symbol,'') AS symbol, COALESCE(kind,'') AS kind,
			       COALESCE(content,'') AS content
			FROM codebase_chunk_index
			WHERE gpu_cluster = ${clusterId}
			  AND content IS NOT NULL AND length(content) > 20
			ORDER BY COALESCE(page_rank_score, 0) DESC, indexed_at DESC
			LIMIT 12
		`);
	} catch (e: unknown) {
		console.error(`[codeintel] chunk fetch for cluster ${clusterId} failed:`, e instanceof Error ? e.message : String(e));
		return json({ ok: false, item: null, degraded: true, error: 'Unable to refresh cluster summary right now.' }, { status: 207 });
	}

	const snippets = chunkResult.rows.map((r: any) => {
		const label = r.symbol ? `${r.kind} ${r.symbol}` : r.kind || 'chunk';
		const content = String(r.content).slice(0, 400);
		return `[${label} in ${r.relative_path}]\n${content}`;
	});

	if (snippets.length === 0) {
		return json({ ok: false, item: null, degraded: true, error: 'No code chunks found for this cluster.' }, { status: 207 });
	}

	// Call Ollama
	const prompt = buildPrompt(clusterId, snippets);
	let summaryText: string;
	try {
		const resp = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.3, num_predict: 512 } }),
			signal: AbortSignal.timeout(120_000),
		});
		const data = await resp.json();
		summaryText = (data.response as string).trim();
	} catch (e: unknown) {
		console.error(`[codeintel] Ollama summarize cluster ${clusterId} failed:`, e instanceof Error ? e.message : String(e));
		return json({ ok: false, item: null, degraded: true, error: 'Cluster summarization unavailable.' }, { status: 207 });
	}

	// Embed (non-fatal)
	let embedding: number[] | null = null;
	try {
		const embedResp = await fetch(`${OLLAMA_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBED_MODEL, input: summaryText }),
			signal: AbortSignal.timeout(30_000),
		});
		const embedData = await embedResp.json();
		const vec = embedData.embeddings?.[0];
		if (Array.isArray(vec) && vec.length === 768) embedding = vec;
	} catch {
		// embedding failure is non-fatal — proceed without embedding
	}

	// Upsert
	try {
		await db.execute(sql`
			INSERT INTO cluster_summaries (repo_id, gpu_cluster, summary, summary_model, summary_embedding, updated_at)
			VALUES (${body.repoId ?? 'default'}, ${clusterId}, ${summaryText}, ${model},
			        ${embedding ? sql`${JSON.stringify(embedding)}::vector` : sql`NULL`}, now())
			ON CONFLICT (gpu_cluster) DO UPDATE
			  SET summary = EXCLUDED.summary,
			      summary_model = EXCLUDED.summary_model,
			      summary_embedding = EXCLUDED.summary_embedding,
			      updated_at = now()
		`);
	} catch (e: unknown) {
		console.error(`[codeintel] DB upsert cluster ${clusterId} failed:`, e instanceof Error ? e.message : String(e));
		return json({ ok: false, item: null, degraded: true, error: 'Unable to persist cluster summary.' }, { status: 207 });
	}

	return json({
		ok: true,
		item: {
			gpuCluster: clusterId,
			summary: summaryText,
			summaryModel: model,
			hasSummaryEmbedding: embedding !== null,
		},
		degraded: false,
		error: null,
	});
};

function buildPrompt(cluster: number, snippets: string[]): string {
	return `You are analyzing a cluster of related code chunks from a legal AI application.
Cluster ID: ${cluster}
Analyze these code samples and produce a concise JSON object with these fields:
- summary: 2-3 sentence overview
- purpose: one-line functional label
- patterns: list of 3-5 architectural/design patterns used
- warnings: list of any concerns (empty list if none)
- tags: list of 5-8 semantic tags

Code samples:
${snippets.join('\n\n---\n\n')}

Respond ONLY with valid JSON, no markdown.`;
}
