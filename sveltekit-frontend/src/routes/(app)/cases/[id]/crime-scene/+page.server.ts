import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client.js';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { sceneMarkers } from '$lib/server/db/schema/scene-markers.js';
import { sceneAssets } from '$lib/server/db/schema/scene-assets.js';
import { listInvestigation, listSummaryExports } from '$lib/server/investigation/investigation-v1.js';

/**
 * Crime-scene page data, read from PostgreSQL 18 on the server. The case layout has already
 * authorized the case, so every query here is scoped to params.id. Degrades to empty arrays
 * with a loadError message instead of throwing (page-load contract).
 */
export const load: PageServerLoad = async ({ params, parent }) => {
	const { caseData } = await parent();
	const caseId = params.id;

	try {
		const [markers, assets, facets, exportsList] = await Promise.all([
			db
				.select({
					id: sceneMarkers.id,
					sceneKey: sceneMarkers.sceneKey,
					markerKey: sceneMarkers.markerKey,
					label: sceneMarkers.label,
					posX: sceneMarkers.posX,
					posY: sceneMarkers.posY,
					posZ: sceneMarkers.posZ,
					anchorKind: sceneMarkers.anchorKind,
					anchorStatus: sceneMarkers.anchorStatus,
					revision: sceneMarkers.revision,
					evidenceId: evidence.id,
					evidenceTitle: evidence.title,
					evidenceSummary: evidence.summary,
					evidenceAiSummary: evidence.aiSummary
				})
				.from(sceneMarkers)
				.innerJoin(evidence, eq(evidence.id, sceneMarkers.evidenceId))
				.where(and(eq(sceneMarkers.caseId, caseId), isNull(sceneMarkers.deletedAt)))
				.orderBy(asc(sceneMarkers.sceneKey), asc(sceneMarkers.markerKey))
				.limit(200),
			db
				.select({
					assetId: sceneAssets.assetId,
					sceneId: sceneAssets.sceneId,
					format: sceneAssets.format,
					byteLength: sceneAssets.byteLength,
					sha256: sceneAssets.sha256,
					createdAt: sceneAssets.createdAt
				})
				.from(sceneAssets)
				.where(eq(sceneAssets.caseId, caseId))
				.orderBy(desc(sceneAssets.createdAt))
				.limit(50),
			listInvestigation(caseId),
			listSummaryExports(caseId)
		]);

		return {
			caseId,
			caseTitle: caseData?.title ?? '',
			caseNumber: caseData?.caseNumber ?? null,
			markers,
			assets,
			facets,
			latestExport: exportsList[0] ?? null,
			loadError: null as string | null
		};
	} catch (cause) {
		console.error('[crime-scene] load failed', cause instanceof Error ? cause.name : 'unknown');
		return {
			caseId,
			caseTitle: caseData?.title ?? '',
			caseNumber: caseData?.caseNumber ?? null,
			markers: [],
			assets: [],
			facets: [],
			latestExport: null,
			loadError: 'Crime-scene data is temporarily unavailable.'
		};
	}
};
