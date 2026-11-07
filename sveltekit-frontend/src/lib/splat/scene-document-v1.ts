import { z } from 'zod';
import { calibrate, type CalibrationAnchor } from './calibration.js';

const finite = z.number().finite();
const digest = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected SHA-256 hex');
const sourceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/, 'Expected canonical source revision');
export const SPZ_DECODER_REVISION_V1 = 'spz-v4-decoder-core-v1';
export const SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1 = 'three-gaussian-splat-v1';
export const DERIVED_SCENE_ASSET_BYTE_BUDGET = 8 * 1024 * 1024;

export function createSceneQualityReceiptV1(input: { derivedAssetBytes: number; triangleCount: number; textureBytes?: number | null }) {
	const derivedAssetBytes = z.number().int().nonnegative().parse(input.derivedAssetBytes);
	return {
		triangleBudget: 100_000,
		triangleCount: z.number().int().nonnegative().parse(input.triangleCount),
		textureBytes: input.textureBytes ?? null,
		derivedAssetBytes,
		derivedAssetByteBudget: DERIVED_SCENE_ASSET_BYTE_BUDGET,
		derivedAssetByteStatus: derivedAssetBytes <= DERIVED_SCENE_ASSET_BYTE_BUDGET ? 'WITHIN_BUDGET' as const : 'BUDGET_NOT_MET' as const,
		status: 'NOT_ASSESSED' as const
	};
}

export const sceneTransformV1Schema = z.object({
	translation: z.tuple([finite, finite, finite]),
	rotationXyzw: z.tuple([finite, finite, finite, finite]),
	scale: z.tuple([finite.positive(), finite.positive(), finite.positive()])
}).strict().superRefine((transform, context) => {
	const [x, y, z, w] = transform.rotationXyzw;
	const length = Math.hypot(x, y, z, w);
	if (Math.abs(length - 1) > 0.01) context.addIssue({ code: 'custom', message: 'Quaternion must be normalized', path: ['rotationXyzw'] });
});

export const sceneDocumentObjectV1Schema = z.object({
	objectId: z.string().uuid(),
	parentObjectId: z.string().uuid().nullable(),
	name: z.string().min(1).max(200),
	kind: z.enum(['MESH', 'SPLAT', 'MARKER', 'GROUP']),
	assetSha256: digest.nullable(),
	transform: sceneTransformV1Schema,
	geometry: z.object({ meshCount: z.number().int().nonnegative(), vertexCount: z.number().int().nonnegative(), triangleCount: z.number().int().nonnegative(), textureCount: z.number().int().nonnegative(), boneCount: z.number().int().nonnegative() }).strict().nullable()
}).strict();

export const surfaceMarkerV1Schema = z.object({
	markerId: z.string().uuid(),
	evidenceId: z.string().uuid(),
	sourceRevision,
	// Optional for legacy compatibility. New editable-scene anchors must state
	// explicitly that they are analyst hypotheses on reconstruction geometry.
	anchorKind: z.literal('MESH_SURFACE_HYPOTHESIS').optional(),
	meshObjectId: z.string().uuid(),
	meshAssetSha256: digest,
	triangleIndex: z.number().int().nonnegative(),
	/** Weights for the triangle's A/B/C vertices in the mesh's local geometry. */
	barycentric: z.tuple([finite, finite, finite]),
	label: z.string().min(1).max(200)
}).strict().superRefine((marker, context) => {
	const weights = marker.barycentric as [number, number, number];
	if (weights.some((weight) => weight < -0.001 || weight > 1.001) || Math.abs(weights[0] + weights[1] + weights[2] - 1) > 0.001) {
		context.addIssue({ code: 'custom', message: 'Barycentric weights must be within the triangle and sum to one', path: ['barycentric'] });
	}
});

const calibrationAnchorV1Schema = z.object({
	id: z.string().min(1).max(100),
	splat: z.tuple([finite, finite, finite]),
	worldM: z.tuple([finite, finite, finite])
}).strict();

const calibrationTransformV1Schema = z.object({
	scale: finite.positive(),
	yawRad: finite,
	translation: z.tuple([finite, finite, finite])
}).strict();

export const sceneCalibrationV1Schema = z.object({
	sourceSha256: digest,
	sourceCoordinateSystem: z.literal('RUB'),
	targetCoordinateSystem: z.literal('GLTF_Y_UP_METERS'),
	anchors: z.array(calibrationAnchorV1Schema).min(3).max(16),
	toleranceM: finite.positive().max(0.5),
	transform: calibrationTransformV1Schema,
	maxResidualM: finite.nonnegative()
}).strict().superRefine((calibration, context) => {
	const ids = new Set<string>();
	for (const [index, anchor] of calibration.anchors.entries()) {
		if (ids.has(anchor.id)) context.addIssue({ code: 'custom', message: 'Calibration anchor IDs must be unique', path: ['anchors', index, 'id'] });
		ids.add(anchor.id);
	}
	try {
		const result = calibrate(calibration.anchors as unknown as CalibrationAnchor[], calibration.toleranceM);
		const actual = result.transform;
		const targetTrans = calibration.transform.translation as readonly number[];
		const valuesMatch = Math.abs(actual.scale - calibration.transform.scale) <= 1e-8
			&& Math.abs(actual.yawRad - calibration.transform.yawRad) <= 1e-8
			&& actual.translation.every((value, index) => {
				const expected = targetTrans[index] ?? 0;
				return Math.abs(value - expected) <= 1e-8;
			});
		if (!valuesMatch) context.addIssue({ code: 'custom', message: 'Calibration transform must match the anchor-derived transform', path: ['transform'] });
		if (!result.pass) context.addIssue({ code: 'custom', message: 'Calibration anchor residual exceeds tolerance', path: ['toleranceM'] });
		if (Math.abs(result.maxResidualM - calibration.maxResidualM) > 1e-8) context.addIssue({ code: 'custom', message: 'Calibration residual receipt must match recomputed anchors', path: ['maxResidualM'] });
	} catch {
		context.addIssue({ code: 'custom', message: 'Calibration anchors do not define a valid transform', path: ['anchors'] });
	}
});

export function createSceneCalibrationV1(input: {
	sourceSha256: string;
	anchors: readonly CalibrationAnchor[];
	toleranceM: number;
}) {
	const result = calibrate(input.anchors, input.toleranceM);
	if (!result.pass) throw new Error('SCENE_CALIBRATION_RESIDUAL_EXCEEDS_TOLERANCE');
	return sceneCalibrationV1Schema.parse({
		sourceSha256: input.sourceSha256,
		sourceCoordinateSystem: 'RUB',
		targetCoordinateSystem: 'GLTF_Y_UP_METERS',
		anchors: input.anchors,
		toleranceM: input.toleranceM,
		transform: result.transform,
		maxResidualM: result.maxResidualM
	});
}
export type SurfaceMarkerV1 = {
	markerId: string;
	evidenceId: string;
	sourceRevision: string;
	anchorKind?: 'MESH_SURFACE_HYPOTHESIS';
	meshObjectId: string;
	meshAssetSha256: string;
	triangleIndex: number;
	barycentric: [number, number, number];
	label: string;
};

export const sceneDocumentV1Schema = z.object({
	schema: z.literal('parent-atlas.scene-document.v1'),
	sceneId: z.string().uuid(),
	caseId: z.string().uuid().nullable(),
	status: z.enum(['FIXTURE', 'HYPOTHESIS', 'MEASURED']),
	// Additive classification keeps old v1 manifest hashes readable while new
	// revisions label the evidentiary meaning of their geometry explicitly.
	sceneClassification: z.enum(['MEASURED_MULTI_IMAGE', 'SINGLE_IMAGE_HYPOTHESIS', 'SYNTHETIC_FIXTURE']).optional(),
	revision: z.number().int().positive(),
	parentManifestSha256: digest.nullable(),
	createdAt: z.string().datetime(),
	coordinateFrame: z.enum(['GLTF_Y_UP_METERS', 'SPZ_RUB', 'LOCAL_UNCALIBRATED']),
	objects: z.array(sceneDocumentObjectV1Schema).max(10_000),
	animations: z.array(z.object({ clipId: z.string().uuid(), name: z.string().min(1).max(200), durationSeconds: finite.nonnegative(), frameRate: finite.positive().nullable() }).strict()).max(1_000),
	evidenceBindings: z.array(z.object({ evidenceId: z.string().uuid(), sourceRevision }).strict()).max(10_000).optional(),
	// Optional to preserve canonical hashes for existing v1 scene manifests.
	surfaceMarkers: z.array(surfaceMarkerV1Schema).max(10_000).optional(),
	evidenceSources: z.array(z.object({
		evidenceId: z.string().uuid(),
		sourceRevision,
		format: z.literal('SPZ'),
		coordinateSystem: z.literal('RUB'),
		decoderRevision: z.string().min(1).max(100),
		representationRevision: z.string().min(1).max(100)
	}).strict()).max(10_000).default([]),
	// Optional to preserve hashes of existing v1 manifests. Calibration maps SPZ RUB
	// coordinates into the scene's GLTF-compatible Y-up meter frame, not GPS coordinates.
	calibration: sceneCalibrationV1Schema.optional(),
	assets: z.array(z.object({
		assetId: z.string().uuid(), format: z.enum(['GLB', 'OBJ', 'FBX', 'SPZ', 'SOG', 'RAD', 'RADC', 'IMAGE_JPEG', 'IMAGE_PNG', 'IMAGE_GIF', 'IMAGE_WEBP']), sha256: digest,
		bytes: z.number().int().positive(), role: z.enum(['SOURCE', 'DERIVED', 'PREVIEW', 'LOD']),
		derivation: z.object({
			parentAssetSha256: digest,
			producer: z.string().min(1).max(200),
			producerVersion: z.string().min(1).max(100),
			lodLevel: z.number().int().nonnegative(),
			chunkId: z.string().min(1).max(200)
		}).strict().optional()
	}).strict()).max(10_000),
	quality: z.object({
		triangleBudget: z.number().int().positive().nullable(),
		triangleCount: z.number().int().nonnegative(),
		textureBytes: z.number().int().nonnegative().nullable(),
		derivedAssetBytes: z.number().int().nonnegative(),
		derivedAssetByteBudget: z.number().int().positive(),
		derivedAssetByteStatus: z.enum(['WITHIN_BUDGET', 'BUDGET_NOT_MET']),
		status: z.enum(['NOT_ASSESSED', 'PASSED', 'FAILED'])
	}).strict()
}).strict().superRefine((document, context) => {
	if (document.sceneClassification === 'SYNTHETIC_FIXTURE' && document.status !== 'FIXTURE') {
		context.addIssue({ code: 'custom', message: 'Synthetic fixture classification requires FIXTURE lifecycle status', path: ['sceneClassification'] });
	}
	if (document.sceneClassification === 'SINGLE_IMAGE_HYPOTHESIS' && document.status !== 'HYPOTHESIS') {
		context.addIssue({ code: 'custom', message: 'Single-image hypothesis classification requires HYPOTHESIS lifecycle status', path: ['sceneClassification'] });
	}
	if (document.sceneClassification === 'MEASURED_MULTI_IMAGE') {
		const distinctSources = new Set([
			...(document.evidenceBindings ?? []).map((binding) => binding.evidenceId),
			...document.evidenceSources.map((source) => source.evidenceId)
		]);
		if (document.status !== 'MEASURED' || distinctSources.size < 2) {
			context.addIssue({ code: 'custom', message: 'Measured multi-image classification requires MEASURED status and at least two distinct evidence sources', path: ['sceneClassification'] });
		}
	}
	const measuredDerivedBytes = document.assets.reduce((sum, asset) => sum + (asset.role === 'DERIVED' || asset.role === 'LOD' ? asset.bytes : 0), 0);
	if (document.quality.derivedAssetBytes !== measuredDerivedBytes) {
		context.addIssue({ code: 'custom', message: 'Derived asset byte receipt must equal the measured DERIVED and LOD asset bytes', path: ['quality', 'derivedAssetBytes'] });
	}
	const expectedByteStatus = measuredDerivedBytes <= document.quality.derivedAssetByteBudget ? 'WITHIN_BUDGET' : 'BUDGET_NOT_MET';
	if (document.quality.derivedAssetByteStatus !== expectedByteStatus) {
		context.addIssue({ code: 'custom', message: `Derived asset byte status must be ${expectedByteStatus}`, path: ['quality', 'derivedAssetByteStatus'] });
	}
	const objectIds = new Set<string>();
	const evidenceIds = new Set<string>();
	for (const [index, binding] of (document.evidenceBindings ?? []).entries()) {
		if (evidenceIds.has(binding.evidenceId)) context.addIssue({ code: 'custom', message: 'Duplicate evidence binding', path: ['evidenceBindings', index, 'evidenceId'] });
		evidenceIds.add(binding.evidenceId);
	}
	for (const [index, source] of document.evidenceSources.entries()) {
		if (evidenceIds.has(source.evidenceId)) context.addIssue({ code: 'custom', message: 'Duplicate evidence source binding', path: ['evidenceSources', index, 'evidenceId'] });
		evidenceIds.add(source.evidenceId);
	}
	const sourceRevisions = new Map<string, string>();
	for (const binding of (document.evidenceBindings ?? [])) sourceRevisions.set(binding.evidenceId, binding.sourceRevision);
	for (const source of document.evidenceSources) sourceRevisions.set(source.evidenceId, source.sourceRevision);
	const admittedSourceHashes = new Set(document.assets.map((asset) => asset.sha256));
	for (const binding of (document.evidenceBindings ?? [])) admittedSourceHashes.add(binding.sourceRevision.slice('sha256:'.length));
	for (const source of document.evidenceSources) admittedSourceHashes.add(source.sourceRevision.slice('sha256:'.length));
	if (document.calibration) {
		if (document.coordinateFrame !== 'GLTF_Y_UP_METERS') context.addIssue({ code: 'custom', message: 'Splat calibration target requires GLTF_Y_UP_METERS scene coordinates', path: ['coordinateFrame'] });
		const calibratedEvidenceSource = document.evidenceSources.some((source) => source.format === 'SPZ' && source.coordinateSystem === 'RUB' && source.sourceRevision === `sha256:${document.calibration?.sourceSha256}`);
		if (!calibratedEvidenceSource) context.addIssue({ code: 'custom', message: 'Calibration source hash must match an SPZ evidence source revision', path: ['calibration', 'sourceSha256'] });
	}
	for (const [index, asset] of document.assets.entries()) {
		if (asset.role === 'LOD') {
			if (!asset.derivation) {
				context.addIssue({ code: 'custom', message: 'LOD asset requires source hash and producer lineage', path: ['assets', index, 'derivation'] });
			} else if (!admittedSourceHashes.has(asset.derivation.parentAssetSha256)) {
				context.addIssue({ code: 'custom', message: 'LOD parent hash must match a manifest asset or evidence source revision', path: ['assets', index, 'derivation', 'parentAssetSha256'] });
			}
		}
	}
	const markersById = new Set<string>();
	const objectsById = new Map(document.objects.map((object) => [object.objectId, object]));
	for (const [index, marker] of (document.surfaceMarkers ?? []).entries()) {
		if (markersById.has(marker.markerId)) context.addIssue({ code: 'custom', message: 'Duplicate surface marker ID', path: ['surfaceMarkers', index, 'markerId'] });
		markersById.add(marker.markerId);
		if (document.sceneClassification === 'SINGLE_IMAGE_HYPOTHESIS' && marker.anchorKind !== 'MESH_SURFACE_HYPOTHESIS') {
			context.addIssue({ code: 'custom', message: 'Hypothesis-scene anchors must be explicitly classified as mesh-surface hypotheses', path: ['surfaceMarkers', index, 'anchorKind'] });
		}
		if (sourceRevisions.get(marker.evidenceId) !== marker.sourceRevision) {
			context.addIssue({ code: 'custom', message: 'Surface marker must match a manifest evidence source revision', path: ['surfaceMarkers', index, 'sourceRevision'] });
		}
		const mesh = objectsById.get(marker.meshObjectId);
		if (!document.assets.some((asset) => (asset.role === 'DERIVED' || asset.role === 'LOD') && asset.sha256 === marker.meshAssetSha256)) {
			context.addIssue({ code: 'custom', message: 'Surface marker must bind to a revision asset SHA-256', path: ['surfaceMarkers', index, 'meshAssetSha256'] });
		}
		if (!mesh || mesh.kind !== 'MESH' || !mesh.geometry || marker.triangleIndex >= mesh.geometry.triangleCount) {
			context.addIssue({ code: 'custom', message: 'Surface marker must target a triangle in a manifest mesh object', path: ['surfaceMarkers', index, 'meshObjectId'] });
		} else if (mesh.geometry.boneCount > 0) {
			context.addIssue({ code: 'custom', message: 'Skinned geometry needs a bone-qualified anchor contract', path: ['surfaceMarkers', index, 'meshObjectId'] });
		} else if (mesh.assetSha256 !== marker.meshAssetSha256) {
			context.addIssue({ code: 'custom', message: 'Surface marker asset hash must match its target mesh object', path: ['surfaceMarkers', index, 'meshAssetSha256'] });
		}
	}
	for (const [index, object] of document.objects.entries()) {
		if (objectIds.has(object.objectId)) context.addIssue({ code: 'custom', message: 'Duplicate objectId', path: ['objects', index, 'objectId'] });
		objectIds.add(object.objectId);
	}
	for (const [index, object] of document.objects.entries()) {
		if (object.parentObjectId && !objectIds.has(object.parentObjectId)) context.addIssue({ code: 'custom', message: 'Parent object is not in this manifest', path: ['objects', index, 'parentObjectId'] });
	}
	// Three.js object hierarchies must be trees/forests. A parent cycle makes
	// world-matrix propagation and revision readback undefined, even if every ID exists.
	const objectIndexById = new Map(document.objects.map((object, index) => [object.objectId, index]));
	const visitState = new Map<string, 1 | 2>();
	const visitParentChain = (objectId: string) => {
		const state = visitState.get(objectId);
		if (state === 2) return;
		if (state === 1) return;
		visitState.set(objectId, 1);
		const index = objectIndexById.get(objectId);
		if (
			index === undefined ||
			!Number.isInteger(index) ||
			index < 0 ||
			index >= document.objects.length
		) {
			context.addIssue({
				code: 'custom',
				message: 'Scene object index is invalid or out of range',
				path: ['objects']
			});
			return;
		}
		const parentId = document.objects[index].parentObjectId;
		if (parentId && objectIndexById.has(parentId)) {
			if (visitState.get(parentId) === 1) {
				context.addIssue({
					code: 'custom',
					message: 'Scene object parent hierarchy contains a cycle',
					path: ['objects', index, 'parentObjectId']
				});
			} else {
				visitParentChain(parentId);
			}
		}
		visitState.set(objectId, 2);
	};
	for (const object of document.objects) visitParentChain(object.objectId);
});

export type SceneDocumentV1 = z.infer<typeof sceneDocumentV1Schema>;

/** Resolve calibration only for the exact exhibit source revision admitted by this manifest. */
export function calibrationForEvidenceV1(document: SceneDocumentV1, evidenceId: string, sourceRevision: string) {
	const source = document.evidenceSources.find((candidate) => candidate.evidenceId === evidenceId && candidate.sourceRevision === sourceRevision);
	if (!source || source.format !== 'SPZ' || source.coordinateSystem !== 'RUB' || !document.calibration) return null;
	return document.calibration.sourceSha256 === sourceRevision.slice('sha256:'.length) ? document.calibration : null;
}

/** Canonical JSON encoding shared by the scene server and browser readback verifier. */
export function stableStringifySceneDocumentV1(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		const encoded = JSON.stringify(value);
		if (encoded === undefined) throw new TypeError('Scene manifest contains a non-JSON value.');
		return encoded;
	}
	if (Array.isArray(value)) return `[${value.map(stableStringifySceneDocumentV1).join(',')}]`;
	return `{${Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringifySceneDocumentV1(entry)}`)
		.join(',')}}`;
}

/** Validate and freeze a manifest revision. Caller supplies trusted source identity and measured asset receipts. */
export function createSceneDocumentV1(input: unknown): Readonly<SceneDocumentV1> {
	const parsed = sceneDocumentV1Schema.parse(input);
	return deepFreeze(parsed);
}

function deepFreeze<T>(value: T): Readonly<T> {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	}
	return value;
}
