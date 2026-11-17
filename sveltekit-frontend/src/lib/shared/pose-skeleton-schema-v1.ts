import { z } from 'zod';

/**
 * Versioned pose schemas are independent of detector class IDs and UI palette slots.
 * Coordinates in observations remain full-precision source-frame pixels; the packed
 * buffer below is only a disposable display derivative.
 */

export const humanCoco17PoseSchemaV1 = {
	schemaId: 'human.coco17.v1',
	subjectKind: 'human',
	species: null,
	coordinateSpace: 'source-frame-pixels',
	joints: [
		{ index: 0, name: 'nose' },
		{ index: 1, name: 'left_eye' },
		{ index: 2, name: 'right_eye' },
		{ index: 3, name: 'left_ear' },
		{ index: 4, name: 'right_ear' },
		{ index: 5, name: 'left_shoulder' },
		{ index: 6, name: 'right_shoulder' },
		{ index: 7, name: 'left_elbow' },
		{ index: 8, name: 'right_elbow' },
		{ index: 9, name: 'left_wrist' },
		{ index: 10, name: 'right_wrist' },
		{ index: 11, name: 'left_hip' },
		{ index: 12, name: 'right_hip' },
		{ index: 13, name: 'left_knee' },
		{ index: 14, name: 'right_knee' },
		{ index: 15, name: 'left_ankle' },
		{ index: 16, name: 'right_ankle' },
	],
	bones: [
		[0, 1], [0, 2], [1, 3], [2, 4],
		[5, 6], [5, 7], [7, 9], [6, 8], [8, 10],
		[5, 11], [6, 12], [11, 12],
		[11, 13], [13, 15], [12, 14], [14, 16],
	],
} as const;

const poseJointSchema = z.object({
	index: z.number().int().min(0).max(255),
	name: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/),
}).strict();

export const poseSkeletonSchemaV1Schema = z.object({
	schemaId: z.string().min(1).max(128),
	subjectKind: z.enum(['human', 'animal']),
	species: z.string().min(1).max(64).nullable(),
	coordinateSpace: z.literal('source-frame-pixels'),
	joints: z.array(poseJointSchema).min(1).max(256),
	bones: z.array(z.tuple([z.number().int().min(0).max(255), z.number().int().min(0).max(255)])).max(512),
}).strict().superRefine((schema, ctx) => {
	if (schema.subjectKind === 'human' && schema.species !== null) {
		ctx.addIssue({ code: 'custom', path: ['species'], message: 'Human schemas must not declare an animal species.' });
	}
	if (schema.subjectKind === 'animal' && !schema.species) {
		ctx.addIssue({ code: 'custom', path: ['species'], message: 'Animal schemas require an explicit species.' });
	}
	const names = new Set<string>();
	schema.joints.forEach((joint, position) => {
		if (joint.index !== position) ctx.addIssue({ code: 'custom', path: ['joints', position, 'index'], message: 'Joint indexes must be contiguous and schema ordered.' });
		if (names.has(joint.name)) ctx.addIssue({ code: 'custom', path: ['joints', position, 'name'], message: 'Joint names must be unique.' });
		names.add(joint.name);
	});
	const edges = new Set<string>();
	schema.bones.forEach(([from, to], position) => {
		if (from >= schema.joints.length || to >= schema.joints.length || from === to) {
			ctx.addIssue({ code: 'custom', path: ['bones', position], message: 'Bone endpoints must reference two distinct declared joints.' });
		}
		const edgeKey = from < to ? `${from}:${to}` : `${to}:${from}`;
		if (edges.has(edgeKey)) ctx.addIssue({ code: 'custom', path: ['bones', position], message: 'Bone edges must be unique.' });
		edges.add(edgeKey);
	});
});

const poseKeypointV1Schema = z.object({
	index: z.number().int().min(0).max(255),
	x: z.number().finite().nullable(),
	y: z.number().finite().nullable(),
	confidence: z.number().finite().min(0).max(1),
	visibility: z.enum(['visible', 'occluded', 'not_labeled']),
}).strict();

export const poseObservationV1Schema = z.object({
	schema: z.literal('atlas.pose-observation.v1'),
	evidenceId: z.string().uuid(),
	sourceSha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	sourceRevision: z.string().min(1).max(256),
	analysisRevision: z.string().min(1).max(256),
	framePtsUs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
	frameIndex: z.number().int().nonnegative().max(0xffffffff),
	frameWidth: z.number().int().min(1).max(32768),
	frameHeight: z.number().int().min(1).max(32768),
	skeletonSchemaId: z.string().min(1).max(128),
	trackId: z.string().min(1).max(128).nullable(),
	trackScopeId: z.string().min(1).max(256).nullable(),
	origin: z.enum(['manual', 'model']),
	modelRevision: z.string().min(1).max(256).nullable(),
	reviewState: z.enum(['UNREVIEWED', 'REVIEWED', 'REJECTED']),
	keypoints: z.array(poseKeypointV1Schema).min(1).max(256),
}).strict();

export type PoseSkeletonSchemaV1 = z.infer<typeof poseSkeletonSchemaV1Schema>;
export type PoseObservationV1 = z.infer<typeof poseObservationV1Schema>;

export function parsePoseObservationV1(input: unknown, schemaInput: unknown): PoseObservationV1 {
	const parsedSchema = poseSkeletonSchemaV1Schema.parse(schemaInput);
	const observation = poseObservationV1Schema.parse(input);
	if (observation.skeletonSchemaId !== parsedSchema.schemaId) throw new RangeError('Pose schema ID does not match the observation.');
	if (observation.keypoints.length !== parsedSchema.joints.length) throw new RangeError('Pose keypoint count does not match the declared skeleton schema.');
	if (observation.origin === 'manual' && observation.modelRevision !== null) throw new RangeError('Manual pose observations cannot claim a model revision.');
	if (observation.origin === 'model' && !observation.modelRevision) throw new RangeError('Model pose observations require an exact model revision.');
	if (observation.trackId !== null && observation.trackScopeId === null) throw new RangeError('Track-linked pose observations require a track scope.');
	for (let index = 0; index < observation.keypoints.length; index += 1) {
		const point = observation.keypoints[index]!;
		if (point.index !== parsedSchema.joints[index]!.index) throw new RangeError('Pose keypoints must use the declared schema order.');
		const unlabeled = point.visibility === 'not_labeled';
		if (unlabeled !== (point.x === null && point.y === null)) throw new RangeError('Unlabeled joints require null coordinates; labeled joints require coordinates.');
		if (!unlabeled && (point.x! < 0 || point.x! > observation.frameWidth || point.y! < 0 || point.y! > observation.frameHeight)) {
			throw new RangeError('Pose keypoint coordinates must be inside the source frame.');
		}
	}
	return observation;
}

/** Pack normalized display-only positions into 8 bytes per joint, little endian. */
export function packPoseOverlayV1(observationInput: unknown, schemaInput: unknown): Uint8Array {
	const observation = parsePoseObservationV1(observationInput, schemaInput);
	const bytes = new Uint8Array(observation.keypoints.length * 8);
	const view = new DataView(bytes.buffer);
	for (let i = 0; i < observation.keypoints.length; i += 1) {
		const point = observation.keypoints[i]!;
		const offset = i * 8;
		const x = point.x === null ? 0 : Math.round((point.x / observation.frameWidth) * 65535);
		const y = point.y === null ? 0 : Math.round((point.y / observation.frameHeight) * 65535);
		view.setUint16(offset, x, true);
		view.setUint16(offset + 2, y, true);
		view.setUint8(offset + 4, Math.round(point.confidence * 255));
		view.setUint8(offset + 5, point.visibility === 'visible' ? 1 : point.visibility === 'occluded' ? 2 : 0);
		view.setUint16(offset + 6, 0, true);
	}
	return bytes;
}
