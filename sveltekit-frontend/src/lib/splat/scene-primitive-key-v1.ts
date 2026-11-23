/**
 * Deterministic lookup key for a placeholder primitive instance. Built on the existing UUID owner
 * (`uuid.derive` in `$lib/utils/uuid.ts`, UUIDv8 over canonical JSON). It does not create a new
 * derivation scheme.
 *
 * The key is a lookup handle only. It does not authorize an upsert, it is not a canonical scene
 * identity, and the scene revision remains the authority.
 */

import { uuid, type UUIDAttributes } from '../utils/uuid.js';
import type { PrimitiveDetailLevelV1, ScenePrimitiveKindV1 } from './scene-primitive-registry-v1.js';

export const SCENE_PRIMITIVE_KEY_DOMAIN_V1 = 'scene.primitive-instance.v1' as const;

export interface ScenePrimitiveKeyInputV1 {
	readonly kind: ScenePrimitiveKindV1;
	readonly detail: PrimitiveDetailLevelV1;
	readonly materialKey: string;
	readonly sceneRevision: string;
}

export async function derivePrimitiveInstanceKeyV1(input: ScenePrimitiveKeyInputV1): Promise<string> {
	const attributes: UUIDAttributes = {
		kind: input.kind,
		detail: input.detail,
		material: input.materialKey,
		sceneRevision: input.sceneRevision
	};
	return uuid.derive(SCENE_PRIMITIVE_KEY_DOMAIN_V1, attributes);
}
