/**
 * Pure helpers for attaching the jester accessories (built by scripts/atlas/build-jester-accessories-v1.py) to a character's
 * bone nodes: manifest validation and the local rotation of a pivot for a given spring angle.
 * Node transforms stay in glTF space: Babylon's glTF loader keeps them raw and handles handedness with its root node
 * (rotation [0,1,0,0], scale [1,1,-1]; verified in glTFLoader.pure.js), so no axis conversion is applied here.
 */
import { qFromAxisAngle, qMul, qNormalize, type Quat } from './rest-pose-retarget-v1.js';
import { JESTER_ACCESSORY_PIVOTS, type PivotSpec } from './jester-accessory-rig-v1.js';

export interface AccessoryManifestPivot {
	id: string;
	bone: string;
	/** Previous pivot in a chain (cap horns, tail); null for a pivot parented to a bone. */
	parent: string | null;
	/** Offset in glTF space: from the bone (bone-local) for roots, from the parent pivot for chain links. */
	offset: [number, number, number];
	/** Roots only: counter-rotation so the accessory stands world-aligned at rest (glTF space, xyzw). */
	baseRotation?: [number, number, number, number];
}

export interface AccessoryManifest {
	scale: number;
	pivots: AccessoryManifestPivot[];
}

/** Throws unless the manifest matches the rig's pivot table exactly (same ids, bones and chains). */
export function validateAccessoryManifest(manifest: AccessoryManifest, specs: readonly PivotSpec[] = JESTER_ACCESSORY_PIVOTS): void {
	const byId = new Map(manifest.pivots.map((p) => [p.id, p]));
	if (byId.size !== manifest.pivots.length) throw new Error('ACCESSORY_MANIFEST_DUPLICATE_PIVOT');
	if (byId.size !== specs.length) throw new Error(`ACCESSORY_MANIFEST_PIVOT_COUNT ${byId.size} != ${specs.length}`);
	for (const s of specs) {
		const m = byId.get(s.id);
		if (!m) throw new Error(`ACCESSORY_MANIFEST_MISSING ${s.id}`);
		if (m.bone !== s.bone) throw new Error(`ACCESSORY_MANIFEST_BONE ${s.id}: ${m.bone} != ${s.bone}`);
		if ((m.parent ?? null) !== (s.follows ?? null)) throw new Error(`ACCESSORY_MANIFEST_PARENT ${s.id}`);
		if (!m.offset.every(Number.isFinite) || m.offset.length !== 3) throw new Error(`ACCESSORY_MANIFEST_OFFSET ${s.id}`);
		if (m.parent === null && (!m.baseRotation || m.baseRotation.length !== 4 || !m.baseRotation.every(Number.isFinite))) {
			throw new Error(`ACCESSORY_MANIFEST_BASE_ROTATION ${s.id}`);
		}
	}
}

/** Local rotation (glTF space) of a pivot at `angle` about its spec axis; roots compose the counter-rotation first. */
export function pivotLocalRotation(spec: PivotSpec, base: Quat | null, angle: number): Quat {
	const swing = qFromAxisAngle(spec.axis as readonly [number, number, number], Number.isFinite(angle) ? angle : 0);
	return qNormalize(base ? qMul(base, swing) : swing);
}
