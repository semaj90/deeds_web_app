import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client.js';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { sceneMarkers } from '$lib/server/db/schema/scene-markers.js';
import { sceneAssets } from '$lib/server/db/schema/scene-assets.js';
import { listInvestigation, listSummaryExports } from '$lib/server/investigation/investigation-v1.js';
import { listLatestSceneDocumentSourceProjectionsV1, readSavedImageStorybookChapterV1, readSavedStorybookChapterV1 } from '$lib/server/scene-document-revisions-v1.js';
import { formatEvidenceSourceRevisionV1 } from '$lib/server/evidence-source-revision-v1.js';
import { buildVideoStorybookCoverageV1 } from '$lib/server/features/evidence/video/video-storybook-coverage-v1.js';
import { isUuid } from '$lib/server/validation.js';

function currentSourceRevision(hash: string | null) {
	if (!hash) return null;
	try { return formatEvidenceSourceRevisionV1(hash); } catch { return null; }
}

/**
 * Crime-scene page data, read from PostgreSQL 18 on the server. The case layout has already
 * authorized the case, so every query here is scoped to params.id. Degrades to empty arrays
 * with a loadError message instead of throwing (page-load contract).
 */
export const load: PageServerLoad = async ({ params, parent, url }) => {
	const { caseData } = await parent();
	const caseId = params.id;
	const chapterId = url.searchParams.get('chapter');
	const requestedFrame = url.searchParams.get('frame');
	const storyScene = url.searchParams.get('storyScene');
	const storyEvent = url.searchParams.get('storyEvent');
	const storyImage = url.searchParams.get('storyImage');
	const storyRevision = Number(url.searchParams.get('storyRevision'));
	const savedChapterRequested = storyScene !== null || storyEvent !== null || storyImage !== null || url.searchParams.has('storyRevision');

	try {
		const validScene = storyScene && isUuid(storyScene) && Number.isSafeInteger(storyRevision) && storyRevision > 0 ? storyScene : null;
		const savedChapterPromise = validScene && storyImage === null && storyEvent && isUuid(storyEvent)
			? readSavedStorybookChapterV1({ caseId, sceneId: validScene, revision: storyRevision, eventId: storyEvent }).catch(() => null)
			: Promise.resolve(null);
		const savedImagePromise = validScene && storyEvent === null && storyImage && isUuid(storyImage)
			? readSavedImageStorybookChapterV1({ caseId, sceneId: validScene, revision: storyRevision, chapterId: storyImage }).catch(() => null)
			: Promise.resolve(null);
		let sceneSourcesUnavailable = false;
		const sceneSourcesPromise = listLatestSceneDocumentSourceProjectionsV1({ caseId, maxScenes: 50 }).catch((cause) => {
			sceneSourcesUnavailable = true;
			console.error('[crime-scene] scene source projection unavailable', cause instanceof Error ? cause.name : 'unknown');
			return { scenes: [], unavailableRevisionCount: 0 };
		});
		const [markers, assets, facets, exportsList, availableEvidence, sceneSourceProjection, savedChapter, savedImageChapter] = await Promise.all([
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
				.select({ id: evidence.id, title: evidence.title, uploadedAt: evidence.uploadedAt, mimeType: evidence.mimeType })
				.from(evidence)
				.where(and(eq(evidence.caseId, caseId), isNull(evidence.deletedAt)))
				.orderBy(desc(evidence.uploadedAt))
				.limit(100),
			sceneSourcesPromise,
			savedChapterPromise,
			savedImagePromise
		]);
		const media = availableEvidence.filter((item) => item.mimeType?.startsWith('video/') || item.mimeType?.startsWith('image/'));
		const chapter = media.find((item) => item.id === chapterId) ?? media[0] ?? null;
		let videoStorybook = null;
		let storybookUnavailable = false;
		if (chapter?.mimeType?.startsWith('video/')) {
			try {
				const [source] = await db.select({ hash: evidence.hash, aiAnalysis: evidence.aiAnalysis })
					.from(evidence)
					.where(and(eq(evidence.caseId, caseId), eq(evidence.id, chapter.id), isNull(evidence.deletedAt)))
					.limit(1);
				const root = source?.aiAnalysis as { videoAnalysis?: unknown } | null;
				const coverage = source && buildVideoStorybookCoverageV1({
					evidenceId: chapter.id, caseId, sourceRevision: currentSourceRevision(source.hash), videoAnalysis: root?.videoAnalysis,
				});
				if (coverage) {
					const { frames, ...manifest } = coverage;
					const frame = frames.find((item) => String(item.frameIndex) === requestedFrame) ?? frames[0] ?? null;
					videoStorybook = { ...manifest, frame, frames: frames.map(({ frameIndex, timestampMs }) => ({ frameIndex, timestampMs })) };
				} else if (root?.videoAnalysis != null) storybookUnavailable = true;
			} catch (cause) {
				storybookUnavailable = true;
				console.error('[crime-scene] storybook unavailable', cause instanceof Error ? cause.name : 'unknown');
			}
		}

		return {
			caseId,
			caseTitle: caseData?.title ?? '',
			caseNumber: caseData?.caseNumber ?? null,
			markers,
			assets,
			facets,
			availableEvidence,
			storybookChapters: media.map(({ id, title }) => ({ id, title })),
			storybookChapter: chapter ? { id: chapter.id, title: chapter.title, kind: chapter.mimeType?.startsWith('video/') ? 'video' as const : 'image' as const } : null,
			videoStorybook,
			storybookUnavailable,
			savedChapter,
			savedImageChapter,
			savedChapterRequested,
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
			storybookChapters: [],
			storybookChapter: null,
			videoStorybook: null,
			storybookUnavailable: true,
			savedChapter: null,
			savedImageChapter: null,
			savedChapterRequested,
			sceneSources: [],
			sceneSourcesUnavailable: true,
			unavailableSceneRevisionCount: 0,
			latestExport: null,
			loadError: 'Crime-scene data is temporarily unavailable.'
		};
	}
};
