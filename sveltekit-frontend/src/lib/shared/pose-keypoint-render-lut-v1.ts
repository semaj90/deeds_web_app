/** Display-only 16-color lookup for COCO-17 source-frame pose annotations. */
export const POSE_KEYPOINT_PALETTE16_V1 = Object.freeze([
	'#ffe066', '#ff6b6b', '#4ecdc4', '#f7b267',
	'#5dade2', '#c792ea', '#9bd770', '#ff8fab',
	'#60d394', '#f9c74f', '#577590', '#f9844a',
	'#90be6d', '#43aa8b', '#f15bb5', '#ffffff',
] as const);

/** COCO-17 joint index -> display palette slot. Eye/ear pairs share their side color. */
export const POSE_KEYPOINT_INDEX_TO_PALETTE_SLOT_V1 = Object.freeze([
	0, 1, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15,
] as const);

export function poseKeypointDisplayColorV1(jointIndex: number): string {
	if (!Number.isInteger(jointIndex) || jointIndex < 0 || jointIndex >= POSE_KEYPOINT_INDEX_TO_PALETTE_SLOT_V1.length) {
		throw new RangeError('Pose keypoint index is outside the COCO-17 display LUT.');
	}
	const slot = POSE_KEYPOINT_INDEX_TO_PALETTE_SLOT_V1[jointIndex];
	return POSE_KEYPOINT_PALETTE16_V1[slot]!;
}
