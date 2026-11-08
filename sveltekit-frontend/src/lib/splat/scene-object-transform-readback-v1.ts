import type { SceneDocumentV1 } from './scene-document-v1.js';

type SceneObjectV1 = SceneDocumentV1['objects'][number];

export interface SceneTransformTargetV1 {
	position: { set(x: number, y: number, z: number): unknown };
	quaternion: { set(x: number, y: number, z: number, w: number): unknown };
	scale: { set(x: number, y: number, z: number): unknown };
}

/** Restore saved local transforms by stable Atlas object ID, validating the full mapping first. */
export function applySceneObjectTransformsV1(
	objects: readonly SceneObjectV1[],
	runtimeObjects: ReadonlyMap<string, SceneTransformTargetV1>
): void {
	const targets = objects.map((saved) => {
		const target = runtimeObjects.get(saved.objectId);
		if (!target) throw new Error(`SCENE_OBJECT_READBACK_MISSING:${saved.objectId}`);
		return { target, transform: saved.transform };
	});
	for (const { target, transform } of targets) {
		const [tx, ty, tz] = transform.translation;
		const [qx, qy, qz, qw] = transform.rotationXyzw;
		const [sx, sy, sz] = transform.scale;
		target.position.set(tx, ty, tz);
		target.quaternion.set(qx, qy, qz, qw);
		target.scale.set(sx, sy, sz);
	}
}
