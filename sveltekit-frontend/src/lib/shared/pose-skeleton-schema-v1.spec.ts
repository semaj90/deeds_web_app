import { describe, expect, it } from 'vitest';
import {
	humanCoco17PoseSchemaV1,
	packPoseOverlayV1,
	parsePoseObservationV1,
	poseSkeletonSchemaV1Schema,
} from './pose-skeleton-schema-v1.js';

const observation = {
	schema: 'atlas.pose-observation.v1',
	evidenceId: '4cf3e0c4-f3c7-4e0a-9a7e-1adf01dd7291',
	sourceSha256: `sha256:${'a'.repeat(64)}`,
	sourceRevision: 'source-rev-1',
	analysisRevision: 'analysis-rev-1',
	framePtsUs: 1_250_000,
	frameIndex: 37,
	frameWidth: 640,
	frameHeight: 480,
	skeletonSchemaId: 'human.coco17.v1',
	trackId: 'track-0001',
	trackScopeId: 'sha256:run-scoped-track',
	origin: 'manual',
	modelRevision: null,
	reviewState: 'UNREVIEWED',
	keypoints: humanCoco17PoseSchemaV1.joints.map(({ index }) => ({ index, x: index === 0 ? 320 : null, y: index === 0 ? 240 : null, confidence: index === 0 ? 1 : 0, visibility: index === 0 ? 'visible' : 'not_labeled' })),
} as const;

describe('pose skeleton schema v1', () => {
	it('declares ordered COCO-17 joints and valid bone endpoints', () => {
		expect(poseSkeletonSchemaV1Schema.parse(humanCoco17PoseSchemaV1).joints).toHaveLength(17);
		expect(humanCoco17PoseSchemaV1.bones.length).toBeGreaterThan(0);
	});

	it('validates full precision source-pixel observations and packs a display buffer', () => {
		expect(parsePoseObservationV1(observation, humanCoco17PoseSchemaV1).keypoints[0]).toMatchObject({ x: 320, y: 240 });
		const packed = packPoseOverlayV1(observation, humanCoco17PoseSchemaV1);
		expect(packed.byteLength).toBe(17 * 8);
		const view = new DataView(packed.buffer, packed.byteOffset, packed.byteLength);
		expect(view.getUint16(0, true)).toBe(32768);
		expect(view.getUint16(2, true)).toBe(32768);
		expect(view.getUint8(4)).toBe(255);
	});

	it('rejects schema-order, frame-bounds and model-revision mismatches', () => {
		const reordered = { ...observation, keypoints: [...observation.keypoints].reverse() };
		expect(() => parsePoseObservationV1(reordered, humanCoco17PoseSchemaV1)).toThrow(/schema order/i);
		const outside = { ...observation, keypoints: observation.keypoints.map((point, index) => index === 0 ? { ...point, x: 641 } : point) };
		expect(() => parsePoseObservationV1(outside, humanCoco17PoseSchemaV1)).toThrow(/inside the source frame/i);
		const unpinnedModel = { ...observation, origin: 'model', modelRevision: null };
		expect(() => parsePoseObservationV1(unpinnedModel, humanCoco17PoseSchemaV1)).toThrow(/exact model revision/i);
	});

	it('requires species-specific, uniquely indexed animal schemas', () => {
		const animal = { ...humanCoco17PoseSchemaV1, schemaId: 'animal.example.v1', subjectKind: 'animal' as const, species: null };
		expect(poseSkeletonSchemaV1Schema.safeParse(animal).success).toBe(false);
		const duplicateJoint = { ...animal, species: 'dog', joints: [{ index: 0, name: 'nose' }, { index: 1, name: 'nose' }], bones: [[0, 1] as [number, number]] };
		expect(poseSkeletonSchemaV1Schema.safeParse(duplicateJoint).success).toBe(false);
	});
});
