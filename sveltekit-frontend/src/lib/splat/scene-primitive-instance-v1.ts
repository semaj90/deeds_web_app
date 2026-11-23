/**
 * Serializable record for one placeholder primitive instance. This is the shape that would be
 * stored in `scene_assets` metadata. Building the record performs no database write.
 *
 * The record is illustrative: provenance is always `illustrative-placeholder`, and it is never
 * evidence. The scene revision remains the authority; `instanceKey` is a lookup handle only.
 */

import { placeholderTriangleCountV1, placeholderWithinBudgetV1, type TessellationTierV1 } from './scene-optimization-registry-v1.js';
import { derivePrimitiveInstanceKeyV1 } from './scene-primitive-key-v1.js';
import type { ScenePrimitiveKindV1, PrimitiveDetailLevelV1 } from './scene-primitive-registry-v1.js';

export const SCENE_PRIMITIVE_INSTANCE_SCHEMA_V1 = 'scene.primitive-instance-record.v1' as const;

export interface PrimitiveInstanceInputV1 {
	readonly kind: ScenePrimitiveKindV1;
	readonly detail: PrimitiveDetailLevelV1;
	readonly materialKey: string;
	readonly sceneRevision: string;
	readonly position?: readonly [number, number, number];
	readonly rotation?: readonly [number, number, number];
	readonly scale?: readonly [number, number, number];
}

export interface PrimitiveInstanceRecordV1 {
	readonly schema: typeof SCENE_PRIMITIVE_INSTANCE_SCHEMA_V1;
	readonly instanceKey: string;
	readonly kind: ScenePrimitiveKindV1;
	readonly detail: PrimitiveDetailLevelV1;
	readonly materialKey: string;
	readonly sceneRevision: string;
	readonly position: readonly [number, number, number];
	readonly rotation: readonly [number, number, number];
	readonly scale: readonly [number, number, number];
	readonly triangleCount: number;
	readonly withinBudget: boolean;
	readonly provenance: 'illustrative-placeholder';
}

const TIER_FOR_DETAIL: Readonly<Record<PrimitiveDetailLevelV1, TessellationTierV1>> = Object.freeze({
	retro: 'retro',
	balanced: 'balanced',
	detailed: 'detailed'
});

function vec3(value: readonly [number, number, number] | undefined, fallback: readonly [number, number, number]): readonly [number, number, number] {
	const v = value ?? fallback;
	if (v.length !== 3 || !v.every((n) => Number.isFinite(n))) throw new Error('PRIMITIVE_INSTANCE_VECTOR_INVALID');
	return [v[0], v[1], v[2]] as const;
}

export async function buildPrimitiveInstanceRecordV1(input: PrimitiveInstanceInputV1): Promise<PrimitiveInstanceRecordV1> {
	if (!input.materialKey.trim()) throw new Error('PRIMITIVE_INSTANCE_MATERIAL_REQUIRED');
	if (!input.sceneRevision.trim()) throw new Error('PRIMITIVE_INSTANCE_SCENE_REVISION_REQUIRED');
	const position = vec3(input.position, [0, 0, 0]);
	const rotation = vec3(input.rotation, [0, 0, 0]);
	const scale = vec3(input.scale, [1, 1, 1]);
	if (scale.some((n) => n <= 0)) throw new Error('PRIMITIVE_INSTANCE_SCALE_MUST_BE_POSITIVE');

	const triangleCount = placeholderTriangleCountV1(input.kind, TIER_FOR_DETAIL[input.detail]);
	const instanceKey = await derivePrimitiveInstanceKeyV1({
		kind: input.kind,
		detail: input.detail,
		materialKey: input.materialKey,
		sceneRevision: input.sceneRevision
	});
	return {
		schema: SCENE_PRIMITIVE_INSTANCE_SCHEMA_V1,
		instanceKey,
		kind: input.kind,
		detail: input.detail,
		materialKey: input.materialKey,
		sceneRevision: input.sceneRevision,
		position,
		rotation,
		scale,
		triangleCount,
		withinBudget: placeholderWithinBudgetV1(triangleCount),
		provenance: 'illustrative-placeholder'
	};
}
