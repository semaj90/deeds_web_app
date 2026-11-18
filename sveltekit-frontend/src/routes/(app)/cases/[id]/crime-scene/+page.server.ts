import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client.js';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { sceneMarkers } from '$lib/server/db/schema/scene-markers.js';
import { sceneAssets } from '$lib/server/db/schema/scene-assets.js';
import { listInvestigation, listSummaryExports } from '$lib/server/investigation/investigation-v1.js';
import { listLatestSceneDocumentSourceProjectionsV1 } from '$lib/server/scene-document-revisions-v1.js';

/**
 * Crime-scene page data, read from PostgreSQL 18 on the server. The case layout has already
 * authorized the case, so every query here is scoped to params.id. Degrades to empty arrays
 * with a loadError message instead of throwing (page-load contract).
 */
export const load: PageServerLoad = async ({ params, parent }) => {
	const { caseData } = await parent();
	const caseId = params.id;

	try {
		let sceneSourcesUnavailable = false;
		const sceneSourcesPromise = listLatestSceneDocumentSourceProjectionsV1({ caseId, maxScenes: 50 }).catch((cause) => {
			sceneSourcesUnavailable = true;
			console.error('[crime-scene] scene source projection unavailable', cause instanceof Error ? cause.name : 'unknown');
			return { scenes: [], unavailableRevisionCount: 0 };
		});
		const [markers, assets, facets, exportsList, availableEvidence, sceneSourceProjection] = await Promise.all([
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
					anchorU: sceneMarkers.anchorU,
					anchorV: sceneMarkers.anchorV,
					anchorStatus: sceneMarkers.anchorStatus,
					sourceRevision: sceneMarkers.sourceRevision,
					sourceSha256: sceneMarkers.sourceSha256,
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
			listSummaryExports(caseId),
			db
				.select({ id: evidence.id, title: evidence.title, uploadedAt: evidence.uploadedAt })
				.from(evidence)
				.where(eq(evidence.caseId, caseId))
				.orderBy(desc(evidence.uploadedAt))
				.limit(100),
			sceneSourcesPromise
		]);

		return {
			caseId,
			caseTitle: caseData?.title ?? '',
			caseNumber: caseData?.caseNumber ?? null,
			markers,
			assets,
			facets,
			availableEvidence,
			sceneSources: sceneSourceProjection.scenes,
			sceneSourcesUnavailable,
			unavailableSceneRevisionCount: sceneSourceProjection.unavailableRevisionCount,
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
			availableEvidence: [],
			sceneSources: [],
			sceneSourcesUnavailable: true,
			unavailableSceneRevisionCount: 0,
			latestExport: null,
			loadError: 'Crime-scene data is temporarily unavailable.'
		};
	}
};
