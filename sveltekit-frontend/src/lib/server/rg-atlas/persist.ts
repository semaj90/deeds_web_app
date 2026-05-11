/**
 * Stage 10 — Persist results
 * INSERT INTO rg_search_runs + rg_search_hits
 */

import { db } from '$lib/server/db/client';
import { rgSearchRuns, rgSearchHits } from '$lib/server/db/schema-search.js';
import type { RgSearchAtlasResult } from './types.js';

/**
 * Persists the entire search run and its hits to PostgreSQL.
 */
export async function persistRgAtlasResult(
	result: RgSearchAtlasResult,
	userId?: number
): Promise<boolean> {
	try {
		await db.transaction(async (tx) => {
			// 1. Insert the run record
			const [run] = await tx
				.insert(rgSearchRuns)
				.values({
					runKey: result.runId,
					query: result.query,
					args: {},
					diagnostics: result.diagnostics,
					clusterCount: result.clusters.length,
					userId: userId ?? null
				})
				.returning({ id: rgSearchRuns.id });

			if (!run) throw new Error('Failed to insert run');

			// 2. Insert the hits in one batch
			if (result.hits.length > 0) {
				await tx.insert(rgSearchHits).values(
					result.hits.map((hit, index) => ({
						runId: run.id,
						filePath: hit.filePath,
						lineNumber: hit.lineNumber ?? null,
						snippet: hit.snippet ?? null,
						source: hit.source,
						scores: hit.scores,
						finalScore: hit.scores.final,
						clusterId: hit.clusterId === -1 ? null : hit.clusterId,
						entities: hit.langExtractEntities ?? [],
						rank: index + 1
					}))
				);
			}
		});

		return true;
	} catch (err) {
		console.error('[persist-rg-atlas] Error:', err);
		return false;
	}
}
