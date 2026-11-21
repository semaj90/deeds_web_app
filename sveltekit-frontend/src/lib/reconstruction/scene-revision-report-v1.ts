import { z } from 'zod';
import { sha256Hex } from '$lib/splat/spz-loader.js';
import { sceneDocumentV1Schema, stableStringifySceneDocumentV1 } from '$lib/splat/scene-document-v1.js';
import { SceneGenerationPlanV1BodySchema } from './scene-generation-plan-v1.js';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const planFields = SceneGenerationPlanV1BodySchema.shape;

export const SceneRevisionReportV1Schema = z.object({
	schema: z.literal('parent-atlas.scene-revision-report/v1'),
	reportKind: z.literal('illustrative_scene_review'),
	caseId: z.uuid(),
	sceneId: z.uuid(),
	revision: z.number().int().positive(),
	manifestSha256: digest,
	createdAt: z.string().datetime(),
	classification: z.enum(['MEASURED_MULTI_IMAGE', 'SINGLE_IMAGE_HYPOTHESIS', 'UNLINKED_SCENE_HYPOTHESIS', 'SYNTHETIC_FIXTURE']).nullable(),
	coordinateFrame: z.enum(['GLTF_Y_UP_METERS', 'SPZ_RUB', 'LOCAL_UNCALIBRATED']),
	objects: z.array(z.object({
		objectId: z.uuid(), name: z.string(), kind: z.enum(['MESH', 'SPLAT', 'MARKER', 'GROUP']),
		assetSha256: digest.nullable(), transform: z.unknown(), sourceBindings: z.array(z.object({ evidenceId: z.uuid(), sourceRevision: z.string() }).strict())
	}).strict()),
	actors: z.array(z.object({ actorId: z.string(), label: z.string(), appearance: z.string(), evidenceIds: z.array(z.uuid()) }).strict()),
	proceduralGeometry: z.object({
		environment: planFields.environment,
		primitives: planFields.primitives,
		assets: planFields.assets,
		placements: planFields.placements
	}).strict().nullable().optional(),
	sourceEvidence: z.array(z.object({ evidenceId: z.uuid(), sourceRevision: z.string() }).strict()),
	reviewedObservations: z.array(z.object({ observationId: z.string(), evidenceId: z.uuid(), sourceRevision: z.string(), sourceSha256: digest, analysisRevision: z.string(), observationRevision: z.string(), reviewDecisionId: z.uuid() }).strict()),
	plannedEvents: z.array(z.object({
		eventId: z.string(), label: z.string(), cueType: z.string(), status: z.enum(['measured', 'hypothesis', 'disputed', 'unknown']),
		reviewStatus: z.enum(['unreviewed', 'accepted', 'disputed', 'unresolved']), evidenceIds: z.array(z.uuid()), actorIds: z.array(z.string()),
		targetRefs: z.array(z.object({ kind: z.enum(['actor', 'primitive', 'asset']), targetId: z.string() }).strict()),
		clock: z.object({ evidenceId: z.uuid().nullable(), clockId: z.string(), startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(), uncertaintyMs: z.number().int().nonnegative() }).strict(),
		action: z.unknown(),
		sourceEvent: planFields.events.element.shape.sourceEvent.unwrap().optional()
	}).strict()),
	approvedSourceEvents: z.array(z.object({
		evidenceId: z.uuid(), sourceRevision: z.string(), analysisRevision: z.string(), eventId: z.uuid(),
		startMs: z.number().int().nonnegative(), endMs: z.number().int().positive(), clockId: z.string().nullable(), timeBasis: z.string().nullable(),
		uncertaintyMs: z.number().int().nonnegative().nullable().optional()
	}).strict()),
	sceneChapters: z.array(z.object({
		modality: z.enum(['video', 'image']), title: z.string(), evidenceId: z.uuid(), sourceRevision: z.string(),
		analysisRevision: z.string().nullable(), coordinateSpace: z.string(), intervalMs: z.tuple([z.number().int().nonnegative(), z.number().int().positive()]).nullable(),
		citations: z.array(z.unknown()), observations: z.array(z.unknown()), coverage: z.unknown()
	}).strict()),
	visualCues: z.array(z.object({
		eventId: z.uuid(), clockId: z.string(), timeBasis: z.string(), startMs: z.number().int().nonnegative(),
		endMs: z.number().int().positive(), uncertaintyMs: z.number().int().nonnegative(), source: z.discriminatedUnion('kind', [
			z.object({ kind: z.literal('AUTHORING') }).strict(),
			z.object({ kind: z.literal('EVIDENCE'), evidenceId: z.uuid(), sourceRevision: z.string(), analysisRevision: z.string() }).strict()
		]), targets: z.array(z.object({ objectId: z.uuid(), role: z.enum(['ACTOR', 'PROP']), name: z.string().nullable() }).strict()),
		action: z.unknown(), reviewState: z.literal('UNREVIEWED_ILLUSTRATION')
	}).strict()),
	annotations: z.array(z.object({ id: z.uuid(), eventId: z.string(), sourceTimeMs: z.number().int().nonnegative(), text: z.string(), objectId: z.string().nullable() }).strict()),
	unresolvedQuestions: z.array(z.string()),
	narrative: z.object({
		why: z.object({ status: z.enum(['unknown', 'hypothesis', 'disputed']), text: z.string().nullable(), evidenceIds: z.array(z.uuid()), reviewStatus: z.enum(['unreviewed', 'accepted', 'disputed']) }).strict(),
		how: z.object({ status: z.enum(['unknown', 'hypothesis', 'disputed']), text: z.string().nullable(), evidenceIds: z.array(z.uuid()), reviewStatus: z.enum(['unreviewed', 'accepted', 'disputed']) }).strict()
	}).nullable(),
	derivedAssets: z.array(z.object({ assetId: z.uuid(), format: z.string(), sha256: digest, bytes: z.number().int().positive(), role: z.enum(['DERIVED', 'PREVIEW', 'LOD']) }).strict()),
	limitations: z.array(z.string())
}).strict();

export type SceneRevisionReportV1 = z.infer<typeof SceneRevisionReportV1Schema>;

/** Build a report only from an integrity-checked saved scene revision readback. */
export async function buildSceneRevisionReportV1(input: { manifest: unknown; manifestSha256: string }): Promise<SceneRevisionReportV1> {
	const manifest = sceneDocumentV1Schema.parse(input.manifest);
	if (!manifest.caseId) throw new Error('SCENE_REPORT_CASE_SCOPE_REQUIRED');
	const suppliedHash = digest.parse(input.manifestSha256);
	const computedHash = await sha256Hex(new TextEncoder().encode(stableStringifySceneDocumentV1(manifest)));
	if (computedHash !== suppliedHash) throw new Error('SCENE_REPORT_MANIFEST_HASH_MISMATCH');
	const objectById = new Map(manifest.objects.map((object) => [object.objectId, object]));
	const preview = manifest.proceduralPreviewDraft;
	const sourceBindings = new Map<string, { evidenceId: string; sourceRevision: string }>();
	for (const source of [...(manifest.evidenceBindings ?? []), ...manifest.evidenceSources.map(({ evidenceId, sourceRevision }) => ({ evidenceId, sourceRevision }))]) {
		sourceBindings.set(`${source.evidenceId}:${source.sourceRevision}`, source);
	}
	for (const source of preview?.plan.sources ?? []) sourceBindings.set(`${source.evidenceId}:${source.sourceRevision}`, { evidenceId: source.evidenceId, sourceRevision: source.sourceRevision });
	const visualCues = (manifest.sceneTimelineCues ?? []).map((cue) => ({
		eventId: cue.eventId, clockId: cue.clockId, timeBasis: cue.timeBasis, startMs: cue.startMs, endMs: cue.endMs,
		uncertaintyMs: cue.uncertaintyMs, source: cue.source,
		targets: cue.targets.map((target) => ({ ...target, name: objectById.get(target.objectId)?.name ?? null })),
		action: cue.action, reviewState: cue.visualizationStatus as 'UNREVIEWED_ILLUSTRATION'
	}));
	const sceneChapters = [
		...(manifest.videoEventBindings ?? []).flatMap((binding) => binding.chapter ? [{
			modality: 'video' as const, title: binding.chapter.title, evidenceId: binding.evidenceId, sourceRevision: binding.sourceRevision,
			analysisRevision: binding.analysisRevision, coordinateSpace: binding.chapter.coordinateSpace,
			intervalMs: [binding.startMs, binding.endMs] as [number, number], citations: binding.chapter.citations,
			observations: [], coverage: binding.chapter.coverage
		}] : []),
		...[...(manifest.imageStorybookChapter ? [manifest.imageStorybookChapter] : []), ...(manifest.imageStorybookChapters ?? [])].map((chapter) => ({
			modality: 'image' as const, title: chapter.title, evidenceId: chapter.evidenceId, sourceRevision: chapter.sourceRevision,
			analysisRevision: chapter.analysisRevision, coordinateSpace: chapter.coordinateSpace, intervalMs: null,
			citations: chapter.citations, observations: chapter.beats, coverage: chapter.coverage
		}))
	];
	const why = preview?.plan.narrative.why;
	const how = preview?.plan.narrative.how;
	const unresolvedQuestions = [
		...(why?.status === 'unknown' ? ['Why is unresolved in the saved scene revision.'] : []),
		...(why?.status === 'disputed' ? ['Why remains disputed in the saved scene revision.'] : []),
		...(how?.status === 'unknown' ? ['How is unresolved in the saved scene revision.'] : []),
		...(how?.status === 'disputed' ? ['How remains disputed in the saved scene revision.'] : []),
		'Cross-source actor identity links are not established by scene appearances and are not represented by this export.'
	];
	const report = {
		schema: 'parent-atlas.scene-revision-report/v1' as const,
		reportKind: 'illustrative_scene_review' as const,
		caseId: manifest.caseId,
		sceneId: manifest.sceneId,
		revision: manifest.revision,
		manifestSha256: suppliedHash,
		createdAt: manifest.createdAt,
		classification: manifest.sceneClassification ?? null,
		coordinateFrame: manifest.coordinateFrame,
		objects: manifest.objects.map((object) => ({
			objectId: object.objectId, name: object.name, kind: object.kind, assetSha256: object.assetSha256,
			transform: object.transform, sourceBindings: object.sourceBindings ?? []
		})),
		actors: (preview?.plan.actors ?? []).map(({ actorId, label, appearance, evidenceIds }) => ({ actorId, label, appearance, evidenceIds })),
		proceduralGeometry: preview ? {
			environment: preview.plan.environment,
			primitives: preview.plan.primitives,
			assets: preview.plan.assets,
			placements: preview.plan.placements
		} : null,
		sourceEvidence: [...sourceBindings.values()].sort((a, b) => a.evidenceId.localeCompare(b.evidenceId) || a.sourceRevision.localeCompare(b.sourceRevision)),
		reviewedObservations: (preview?.plan.reviewedObservations ?? []).map(({ observationId, evidenceId, sourceRevision, sourceSha256, analysisRevision, observationRevision, reviewDecisionId }) => ({ observationId, evidenceId, sourceRevision, sourceSha256, analysisRevision, observationRevision, reviewDecisionId })),
		plannedEvents: (preview?.plan.events ?? []).map(({ eventId, label, cueType, status, reviewStatus, evidenceIds, actorIds, targetRefs, clock, action, sourceEvent }) => ({
			eventId, label, cueType, status, reviewStatus, evidenceIds, actorIds, targetRefs, clock, action: action ?? null, sourceEvent
		})),
		approvedSourceEvents: (manifest.videoEventBindings ?? []).map((binding) => ({
			evidenceId: binding.evidenceId, sourceRevision: binding.sourceRevision, analysisRevision: binding.analysisRevision,
			eventId: binding.eventId, startMs: binding.startMs, endMs: binding.endMs,
			clockId: binding.sourceClock?.clockId ?? null, timeBasis: binding.sourceClock?.timeBasis ?? null,
			uncertaintyMs: binding.sourceClock?.uncertaintyMs ?? null
		})),
		sceneChapters,
		visualCues,
		annotations: (preview?.annotations ?? []).map((note) => ({ ...note, objectId: note.objectId ?? null })),
		unresolvedQuestions,
		narrative: preview ? {
			why: { status: preview.plan.narrative.why.status, text: preview.plan.narrative.why.text ?? null, evidenceIds: preview.plan.narrative.why.evidenceIds, reviewStatus: preview.plan.narrative.why.reviewStatus },
			how: { status: preview.plan.narrative.how.status, text: preview.plan.narrative.how.text ?? null, evidenceIds: preview.plan.narrative.how.evidenceIds, reviewStatus: preview.plan.narrative.how.reviewStatus }
		} : null,
		derivedAssets: manifest.assets.filter((asset) => asset.role !== 'SOURCE').map((asset) => ({ assetId: asset.assetId, format: asset.format, sha256: asset.sha256, bytes: asset.bytes, role: asset.role as 'DERIVED' | 'PREVIEW' | 'LOD' })),
		limitations: [
			'Visualization cues are presentation hypotheses; they do not establish that an event occurred.',
			'Source clock lanes are reported independently; no clock alignment is inferred by this export.',
			'Actor and object references are scene handles, not identity or guilt determinations.',
			'Only evidence links and review states present in this saved revision are included.'
		]
	};
	return SceneRevisionReportV1Schema.parse(report);
}

export function serializeSceneRevisionReportV1(report: unknown): string {
	return `${JSON.stringify(SceneRevisionReportV1Schema.parse(report), null, 2)}\n`;
}
