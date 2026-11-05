import { z } from 'zod';

const finite = z.number().finite();
const digest = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected SHA-256 hex');

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

export const sceneDocumentV1Schema = z.object({
	schema: z.literal('parent-atlas.scene-document.v1'),
	sceneId: z.string().uuid(),
	caseId: z.string().uuid().nullable(),
	status: z.enum(['FIXTURE', 'HYPOTHESIS', 'MEASURED']),
	revision: z.number().int().positive(),
	parentManifestSha256: digest.nullable(),
	createdAt: z.string().datetime(),
	coordinateFrame: z.enum(['GLTF_Y_UP_METERS', 'SPZ_RUB', 'LOCAL_UNCALIBRATED']),
	objects: z.array(sceneDocumentObjectV1Schema).max(10_000),
	animations: z.array(z.object({ clipId: z.string().uuid(), name: z.string().min(1).max(200), durationSeconds: finite.nonnegative(), frameRate: finite.positive().nullable() }).strict()).max(1_000),
	assets: z.array(z.object({ assetId: z.string().uuid(), format: z.enum(['GLB', 'SPZ', 'SOG', 'RAD', 'RADC']), sha256: digest, bytes: z.number().int().positive(), role: z.enum(['SOURCE', 'DERIVED', 'PREVIEW', 'LOD']) }).strict()).max(10_000),
	quality: z.object({ triangleBudget: z.number().int().positive().nullable(), triangleCount: z.number().int().nonnegative(), textureBytes: z.number().int().nonnegative().nullable(), status: z.enum(['NOT_ASSESSED', 'PASSED', 'FAILED']) }).strict()
}).strict().superRefine((document, context) => {
	const objectIds = new Set<string>();
	for (const [index, object] of document.objects.entries()) {
		if (objectIds.has(object.objectId)) context.addIssue({ code: 'custom', message: 'Duplicate objectId', path: ['objects', index, 'objectId'] });
		objectIds.add(object.objectId);
	}
	for (const [index, object] of document.objects.entries()) {
		if (object.parentObjectId && !objectIds.has(object.parentObjectId)) context.addIssue({ code: 'custom', message: 'Parent object is not in this manifest', path: ['objects', index, 'parentObjectId'] });
	}
});

export type SceneDocumentV1 = z.infer<typeof sceneDocumentV1Schema>;

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
