import { buildJesterPartBoneMap, JESTER_PART_COUNT } from './jester-part-bone-table-v1.js';
import { JESTER_ACCESSORY_PIVOTS } from './jester-accessory-rig-v1.js';

export interface JesterAccessoryBindingV1 {
	pivotId: string;
	bone: string;
	parts: readonly number[];
}

export function buildJesterAccessoryBindingPlanV1(
	meshCount: number,
	availableBones: ReadonlySet<string>,
): JesterAccessoryBindingV1[] {
	if (meshCount !== JESTER_PART_COUNT) {
		throw new Error(`JESTER_OBJ_PART_COUNT_MISMATCH:${meshCount}`);
	}
	const partBones = buildJesterPartBoneMap();
	const bindings = JESTER_ACCESSORY_PIVOTS.map((pivot) => {
		if (!availableBones.has(pivot.bone)) throw new Error(`JESTER_ACCESSORY_BONE_MISSING:${pivot.bone}`);
		for (const part of pivot.parts) {
			if (partBones.get(part) !== pivot.bone) throw new Error(`JESTER_ACCESSORY_PART_BONE_MISMATCH:${part}`);
		}
		return { pivotId: pivot.id, bone: pivot.bone, parts: pivot.parts };
	});
	const selected = bindings.flatMap((binding) => binding.parts);
	if (new Set(selected).size !== selected.length) throw new Error('JESTER_ACCESSORY_PART_DUPLICATE');
	return bindings;
}
