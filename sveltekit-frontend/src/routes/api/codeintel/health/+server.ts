/**
 * GET /api/codeintel/health
 * Reports readiness of the CodeIntel pipeline:
 *   - cluster_summaries row count + embedding coverage
 *   - codebase_chunk_index row count
 *   - gRPC service reachability (if CODEINTEL_GRPC_ENABLED)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ ok: false, status: 'unauthorized' }, { status: 401 });

	const checks: Record<string, unknown> = {
		grpcEnabled: ENV.CODEINTEL_GRPC_ENABLED,
		grpcUrl: ENV.CODEINTEL_GRPC_URL,
	};

	// cluster_summaries stats
	try {
		const r = await db.execute(sql`
			SELECT COUNT(*) AS total,
			       COUNT(summary_embedding) AS with_embedding,
			       COUNT(CASE WHEN summary <> '' THEN 1 END) AS with_summary
			FROM cluster_summaries
		`);
		const row = r.rows[0] as any;
		checks.clusterSummaries = {
			total: Number(row.total),
			withEmbedding: Number(row.with_embedding),
			withSummary: Number(row.with_summary),
		};
	} catch {
		checks.clusterSummaries = { error: 'query failed' };
	}

	// codebase_chunk_index stats
	try {
		const r = await db.execute(sql`
			SELECT COUNT(*) AS total,
			       COUNT(DISTINCT gpu_cluster) AS clusters
			FROM codebase_chunk_index
		`);
		const row = r.rows[0] as any;
		checks.chunkIndex = {
			total: Number(row.total),
			clusters: Number(row.clusters),
		};
	} catch {
		checks.chunkIndex = { error: 'query failed' };
	}

	// gRPC health check (optional)
	if (ENV.CODEINTEL_GRPC_ENABLED) {
		try {
			const controller = new AbortController();
			const tid = setTimeout(() => controller.abort(), 2000);
			const r = await fetch(`http://${ENV.CODEINTEL_GRPC_URL}/healthz`, {
				signal: controller.signal,
			}).finally(() => clearTimeout(tid));
			checks.grpcHealth = r.ok ? 'ok' : `http ${r.status}`;
		} catch {
			checks.grpcHealth = 'unreachable';
		}
	}

	const allOk =
		typeof checks.clusterSummaries === 'object' &&
		!('error' in (checks.clusterSummaries as object));

	return json({ ok: allOk, ...checks });
};
