/**
 * Phase 15.D1: validates a one-bone rigid influence before a SkinnedMesh is admitted.
 *
 * Rigid means every vertex is driven by exactly one bone with weight 1 and no blending.
 * Different vertices may use different bones (a rigid character has one bone per part).
 * Skinned bounds refit is owned by splat/spatial-bvh-manager-v1.ts and is not repeated here.
 * Pure data check: no three.js, no GPU.
 */
export const ONE_BONE_RIGID_SKIN_REVISION_V1 = 'atlas-one-bone-rigid-skin-v1' as const;

export interface OneBoneRigidSkinInputV1 {
	readonly positions: ArrayLike<number>;
	readonly skinIndex: ArrayLike<number>;
	readonly skinWeight: ArrayLike<number>;
	readonly boneCount: number;
	/** Optional bone inverse matrices, 16 values per bone, column-major. */
	readonly boneInverses?: ArrayLike<number>;
}

export type OneBoneRigidSkinReasonV1 =
	| 'VERTEX_COUNT_INVALID'
	| 'POSITION_LENGTH_MISMATCH'
	| 'SKIN_ATTRIBUTE_LENGTH_MISMATCH'
	| 'NON_FINITE_VALUE'
	| 'BONE_INDEX_OUT_OF_RANGE'
	| 'BONE_INDEX_NOT_INTEGER'
	| 'WEIGHT_NOT_ONE'
	| 'SECONDARY_INFLUENCE_PRESENT'
	| 'BONE_INVERSE_LENGTH_MISMATCH';

export interface OneBoneRigidSkinResultV1 {
	readonly revision: typeof ONE_BONE_RIGID_SKIN_REVISION_V1;
	readonly ok: boolean;
	readonly reasons: readonly OneBoneRigidSkinReasonV1[];
	/** Set only when every vertex uses the same bone; null for multi-part rigid meshes. */
	readonly boneIndex: number | null;
	readonly distinctBoneCount: number;
	readonly vertexCount: number;
	readonly bounds: { min: [number, number, number]; max: [number, number, number] } | null;
}

const WEIGHT_EPSILON = 1e-6;

export function validateOneBoneRigidSkinV1(input: OneBoneRigidSkinInputV1): OneBoneRigidSkinResultV1 {
	const reasons = new Set<OneBoneRigidSkinReasonV1>();
	const vertexCount = Math.floor(input.positions.length / 3);
	const fail = (r: OneBoneRigidSkinReasonV1) => reasons.add(r);

	if (!Number.isSafeInteger(vertexCount) || vertexCount < 1 || input.positions.length !== vertexCount * 3) {
		fail('VERTEX_COUNT_INVALID');
	}
	if (input.positions.length % 3 !== 0) fail('POSITION_LENGTH_MISMATCH');
	if (input.skinIndex.length !== vertexCount * 4 || input.skinWeight.length !== vertexCount * 4) {
		fail('SKIN_ATTRIBUTE_LENGTH_MISMATCH');
	}
	if (!Number.isSafeInteger(input.boneCount) || input.boneCount < 1) fail('BONE_INDEX_OUT_OF_RANGE');
	if (input.boneInverses !== undefined && input.boneInverses.length !== input.boneCount * 16) {
		fail('BONE_INVERSE_LENGTH_MISMATCH');
	}
	for (let i = 0; i < input.positions.length; i++) {
		if (!Number.isFinite(input.positions[i])) { fail('NON_FINITE_VALUE'); break; }
	}
	if (input.boneInverses) {
		for (let i = 0; i < input.boneInverses.length; i++) {
			if (!Number.isFinite(input.boneInverses[i])) { fail('NON_FINITE_VALUE'); break; }
		}
	}

	let boneIndex: number | null = null;
	const usedBones = new Set<number>();
	const structurallyOk = !reasons.has('VERTEX_COUNT_INVALID') && !reasons.has('SKIN_ATTRIBUTE_LENGTH_MISMATCH');
	if (structurallyOk) {
		for (let v = 0; v < vertexCount; v++) {
			const o = v * 4;
			for (let s = 0; s < 4; s++) {
				const w = input.skinWeight[o + s];
				const idx = input.skinIndex[o + s];
				if (!Number.isFinite(w) || !Number.isFinite(idx)) { fail('NON_FINITE_VALUE'); continue; }
				if (!Number.isInteger(idx)) fail('BONE_INDEX_NOT_INTEGER');
				if (s > 0 && Math.abs(w) > WEIGHT_EPSILON) fail('SECONDARY_INFLUENCE_PRESENT');
			}
			const primaryIndex = input.skinIndex[o];
			const primaryWeight = input.skinWeight[o];
			if (!Number.isInteger(primaryIndex) || primaryIndex < 0 || primaryIndex >= input.boneCount) {
				fail('BONE_INDEX_OUT_OF_RANGE');
			} else {
				usedBones.add(primaryIndex);
			}
			if (!Number.isFinite(primaryWeight) || Math.abs(primaryWeight - 1) > WEIGHT_EPSILON) fail('WEIGHT_NOT_ONE');
		}
		if (usedBones.size === 1) boneIndex = [...usedBones][0];
	}

	let bounds: OneBoneRigidSkinResultV1['bounds'] = null;
	if (!reasons.has('NON_FINITE_VALUE') && !reasons.has('POSITION_LENGTH_MISMATCH') && vertexCount >= 1 && input.positions.length >= 3) {
		const min: [number, number, number] = [Infinity, Infinity, Infinity];
		const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
		for (let v = 0; v < vertexCount; v++) {
			for (let k = 0; k < 3; k++) {
				const c = input.positions[v * 3 + k];
				if (c < min[k]) min[k] = c;
				if (c > max[k]) max[k] = c;
			}
		}
		bounds = { min, max };
	}

	const list = [...reasons];
	return {
		revision: ONE_BONE_RIGID_SKIN_REVISION_V1,
		ok: list.length === 0,
		reasons: list,
		boneIndex: list.length === 0 ? boneIndex : null,
		distinctBoneCount: list.length === 0 ? usedBones.size : 0,
		vertexCount: Number.isSafeInteger(vertexCount) && vertexCount > 0 ? vertexCount : 0,
		bounds,
	};
}
