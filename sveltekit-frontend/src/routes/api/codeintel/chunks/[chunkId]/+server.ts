/**
 * GET /api/codeintel/chunks/[chunkId]?repoId=...
 * Look up a single codebase chunk from codebase_chunk_index.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, url, locals }) => {
	if (!locals.user) return json({ chunk: null }, { status: 401 });

	const { chunkId } = params;
	if (!chunkId || chunkId.length > 128) {
		return json({ chunk: null }, { status: 400 });
	}

	const repoId = url.searchParams.get('repoId') ?? '';

	try {
		const result = await db.execute(sql`
			SELECT qdrant_id,
			       COALESCE(repo_id, 'default') AS repo_id,
			       COALESCE(relative_path, '') AS relative_path,
			       COALESCE(symbol, '') AS symbol,
			       COALESCE(kind, '') AS kind,
			       COALESCE(domain, '') AS domain,
			       COALESCE(language, '') AS language,
			       COALESCE(extension, '') AS extension,
			       COALESCE(gpu_cluster, -1) AS gpu_cluster,
			       COALESCE(som_cluster, -1) AS som_cluster,
			       COALESCE(semantic_tags, '{}') AS semantic_tags,
			       COALESCE(summary, '') AS summary,
			       COALESCE(metadata::text, '{}') AS metadata_json
			FROM codebase_chunk_index
			WHERE (qdrant_id = ${chunkId} OR chunk_id = ${chunkId})
			  AND (${repoId} = '' OR repo_id = ${repoId})
			LIMIT 1
		`);

		if (result.rows.length === 0) {
			return json({ chunk: null }, { status: 404 });
		}

		const r = result.rows[0] as any;
		return json({
			chunk: {
				chunkId: r.qdrant_id,
				repoId: r.repo_id,
				relativePath: r.relative_path,
				symbol: r.symbol,
				kind: r.kind,
				domain: r.domain,
				language: r.language,
				extension: r.extension,
				gpuCluster: Number(r.gpu_cluster),
				somCluster: Number(r.som_cluster),
				semanticTags: Array.isArray(r.semantic_tags) ? r.semantic_tags : [],
				summary: r.summary,
				metadataJson: r.metadata_json,
			},
		});
	} catch {
		return json({ chunk: null });
	}
};
